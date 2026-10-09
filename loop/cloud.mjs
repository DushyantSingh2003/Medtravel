#!/usr/bin/env node
// Task queue for running the build plan from Claude Code cloud sessions (routines).
// State lives in loop/cloud-state.json and is committed to the develop branch, so every
// fresh cloud session knows what is done, what is in progress, and what is next.
//
//   node loop/cloud.mjs next                 print the next task (or why there is none)
//   node loop/cloud.mjs claim <ID>           mark a task in progress (commit + push right after)
//   node loop/cloud.mjs finish <ID> done|failed|blocked ["note"]
//   node loop/cloud.mjs status               progress overview
//   node loop/cloud.mjs approve|retry|skip|done <ID>
//
// You can also queue a command from the GitHub website: create an empty file named
// loop/commands/approve-C-01 (or retry-F-06, skip-W-09, done-L-09). The next run applies it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOP_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(LOOP_DIR, '..');
const STATE_FILE = path.join(LOOP_DIR, 'cloud-state.json');
const COMMANDS_DIR = path.join(LOOP_DIR, 'commands');
const config = JSON.parse(fs.readFileSync(path.join(LOOP_DIR, 'config.json'), 'utf8'));
const STALE_HOURS = config.cloudStaleClaimHours ?? 4;
const MAX_ATTEMPTS = config.maxAttempts ?? 2;
const ID_RE = /^[A-Z]{1,3}-\d{2}$/;

const now = () => new Date().toISOString();

// ---------- plan parsing (same rules as runner.mjs)
const TASK_HEADING = /^\*\*([A-Z]{1,3}-\d{2})\s+(.+?)\*\*\s*$/;
function parsePlan() {
  const lines = fs.readFileSync(path.join(REPO, config.planFile || 'docs/BUILD_PLAN.md'), 'utf8').split('\n');
  const tasks = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_HEADING);
    if (!m) continue;
    const task = { id: m[1], title: m[2].replace(/\\/g, ''), kind: 'checklist', prompt: '', doneWhen: '', scaffold: false };
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length && lines[j].startsWith('```')) {
      const fence = lines[j].match(/^`+/)[0];
      const buf = [];
      j++;
      while (j < lines.length && !lines[j].startsWith(fence)) buf.push(lines[j++]);
      let prompt = buf.join('\n').trim();
      if (/^\/scaffold-module\s+/.test(prompt)) {
        task.scaffold = true;
        prompt = prompt.replace(/^\/scaffold-module\s+/, '');
      }
      task.prompt = prompt.replace(/^\/task\s+[A-Z]{1,3}-\d{2}\s+/, '');
      task.kind = 'prompt';
      j++;
    }
    for (; j < lines.length; j++) {
      if (TASK_HEADING.test(lines[j]) || /^#{1,3}\s/.test(lines[j])) break;
      const dm = lines[j].match(/^Done when:\s*(.+)$/);
      if (dm) task.doneWhen = dm[1].trim();
    }
    tasks.set(task.id, task);
  }
  return tasks;
}
const order = () => [...config.order, ...(config.includeLaterPhases ? config.laterOrder : [])];

// ---------- state
function load() {
  if (!fs.existsSync(STATE_FILE)) return { tasks: {}, approvals: [], log: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}
function save(s) {
  s.log = (s.log || []).slice(-200);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');
}
const ts = (s, id) => (s.tasks[id] ||= { status: 'pending', attempts: 0 });
function note(s, msg) {
  (s.log ||= []).push(`${now()} ${msg}`);
}

function apply(s, cmd, id) {
  if (!ID_RE.test(id)) throw new Error(`bad task id ${id}`);
  const t = ts(s, id);
  if (cmd === 'approve') { if (!s.approvals.includes(id)) s.approvals.push(id); }
  else if (cmd === 'retry') { t.status = 'pending'; t.attempts = 0; t.note = 'retry requested'; }
  else if (cmd === 'skip') { t.status = 'skipped'; t.note = 'skipped by user'; }
  else if (cmd === 'done') { t.status = 'done'; t.note = 'marked done by user'; t.finishedAt = now(); }
  else throw new Error(`unknown command ${cmd}`);
  note(s, `${cmd} ${id}`);
}

function applyCommandFiles(s) {
  if (!fs.existsSync(COMMANDS_DIR)) return [];
  const applied = [];
  for (const f of fs.readdirSync(COMMANDS_DIR)) {
    const m = f.match(/^(approve|retry|skip|done)-([A-Z]{1,3}-\d{2})(\.\w+)?$/);
    if (!m) continue;
    apply(s, m[1], m[2]);
    fs.rmSync(path.join(COMMANDS_DIR, f));
    applied.push(`${m[1]} ${m[2]}`);
  }
  return applied;
}

function render(file, vars) {
  let text = fs.readFileSync(path.join(LOOP_DIR, 'prompts', file), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(String(v ?? ''));
  return text;
}

// ---------- commands
function next() {
  const tasks = parsePlan();
  const s = load();
  const applied = applyCommandFiles(s);
  save(s);
  if (applied.length) console.log(`Applied queued commands: ${applied.join(', ')} (commit loop/ changes)`);
  for (const id of order()) {
    const task = tasks.get(id);
    if (!task) { console.log(`ERROR: ${id} is in loop/config.json order but not in the plan.`); process.exit(1); }
    const t = s.tasks[id] || { status: 'pending', attempts: 0 };
    if (t.status === 'done' || t.status === 'skipped') continue;
    if (t.status === 'in-progress') {
      const ageH = (Date.now() - Date.parse(t.claimedAt)) / 3.6e6;
      if (ageH < STALE_HOURS) {
        console.log(`BUSY: ${id} was claimed ${ageH.toFixed(1)} h ago by another run. Nothing to do this run.`);
        process.exit(3);
      }
      console.log(`NOTE: ${id} claim is ${ageH.toFixed(1)} h old (stale); it will be restarted.`);
    }
    if (t.status === 'failed' || t.status === 'blocked') {
      console.log(`STOPPED: ${id} is ${t.status}. Reason: ${t.note || 'n/a'}\nA human must fix it, then create loop/commands/retry-${id} (or skip-${id}).`);
      process.exit(4);
    }
    if ((config.humanTasks || []).includes(id)) {
      console.log(`HUMAN: ${id} ${task.title} is a human task. When finished, create loop/commands/done-${id}.`);
      process.exit(5);
    }
    if ((config.pauseBefore || []).includes(id) && !s.approvals.includes(id)) {
      console.log(`CHECKPOINT: paused before ${id} ${task.title}. Review develop, then create loop/commands/approve-${id}.`);
      process.exit(6);
    }
    const instructions = task.scaffold
      ? `Follow the procedure in .claude/skills/scaffold-module/SKILL.md (skip its "wait for approval" step) for: ${task.prompt}`
      : task.prompt;
    const security = (config.securityTasks || []).includes(id);
    console.log(`TASK: ${id}`);
    console.log(`TITLE: ${task.title}`);
    console.log(`ATTEMPT: ${(t.attempts || 0) + 1} of ${MAX_ATTEMPTS}`);
    console.log(`SECURITY_REVIEW: ${security ? 'yes' : 'no'}`);
    if (t.note) console.log(`PREVIOUS_NOTE: ${t.note}`);
    console.log('----- TASK PROMPT -----');
    console.log(render('task.md', { TASK_ID: id, TASK_TITLE: task.title, TASK_TEXT: instructions, DONE_WHEN: task.doneWhen || 'see task text' }));
    process.exit(0);
  }
  console.log('DONE: every task in the run order is finished.');
  process.exit(2);
}

function claim(id) {
  const s = load();
  const t = ts(s, id);
  if (t.status === 'in-progress' && (Date.now() - Date.parse(t.claimedAt)) / 3.6e6 < STALE_HOURS) {
    console.log(`ALREADY CLAIMED: ${id}`);
    process.exit(3);
  }
  t.status = 'in-progress';
  t.attempts = (t.attempts || 0) + 1;
  t.claimedAt = now();
  t.session = process.env.CLAUDE_CODE_SESSION_ID || process.env.HOSTNAME || '';
  note(s, `claim ${id} attempt ${t.attempts}`);
  save(s);
  console.log(`Claimed ${id} (attempt ${t.attempts}). Now commit loop/cloud-state.json and push develop before starting work.`);
}

function finish(id, result, msg = '') {
  const s = load();
  const t = ts(s, id);
  t.finishedAt = now();
  if (result === 'done') {
    t.status = 'done';
    t.note = msg;
  } else if (result === 'failed' && t.attempts < MAX_ATTEMPTS) {
    t.status = 'pending';
    t.note = `attempt ${t.attempts} failed: ${msg}`;
  } else if (result === 'failed' || result === 'blocked') {
    t.status = result;
    t.note = msg;
  } else throw new Error('result must be done, failed or blocked');
  note(s, `finish ${id} ${result}`);
  save(s);
  console.log(`${id} -> ${t.status}`);
}

function status() {
  const tasks = parsePlan();
  const s = load();
  const counts = {};
  for (const id of order()) {
    const t = s.tasks[id] || { status: 'pending', attempts: 0 };
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.status !== 'pending' || t.note) console.log(`${id.padEnd(6)} ${t.status.padEnd(12)} tries=${t.attempts}  ${tasks.get(id)?.title || ''}${t.note ? `\n         note: ${t.note.slice(0, 300)}` : ''}`);
  }
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')} · of ${order().length}`);
  console.log(`approved checkpoints: ${s.approvals.join(', ') || 'none'}`);
}

const [cmd, id, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'next': next(); break;
  case 'claim': claim(id); break;
  case 'finish': finish(id, rest[0], rest.slice(1).join(' ')); break;
  case 'status': status(); break;
  case 'approve': case 'retry': case 'skip': case 'done': {
    const s = load(); apply(s, cmd, id); save(s); console.log(`${cmd} ${id} recorded; commit and push loop/cloud-state.json.`); break;
  }
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
