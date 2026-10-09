#!/usr/bin/env node
// MedTravel autonomous build loop for Claude Code.
//
// Reads the task list from docs/BUILD_PLAN.md, then for each task:
//   branch -> claude -p (implement) -> verify (pnpm check) -> fix rounds -> review -> commit -> merge -> next
//
// Usage:  node loop/runner.mjs <command>
//   check            preflight checks (auth, git, docker, plan)
//   plan             list parsed tasks in run order
//   status           progress, costs, current/paused state
//   run              run the loop until everything is done (use with systemd)
//   once [ID]        run the next task (or a specific one) and exit
//   watch            follow the live log of the running task
//   approve <ID>     let the loop continue past a pause point
//   retry <ID>       reset a failed/blocked task to pending
//   skip <ID>        skip a task
//   done <ID>        mark a task done (you did it by hand)
//   stop             finish the current task, then stop
//
// Requires Node 22+, git, and the `claude` CLI on PATH. No npm dependencies.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOOP_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.LOOP_REPO_DIR || path.join(LOOP_DIR, '..'));
const STATE_DIR = path.join(REPO, '.loop');
const OUT_DIR = path.join(STATE_DIR, 'out');
const LOG_DIR = path.join(STATE_DIR, 'logs');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const STOP_FILE = path.join(STATE_DIR, 'STOP');
const COMMANDS_FILE = path.join(STATE_DIR, 'commands.jsonl');
const LOCK_FILE = path.join(STATE_DIR, 'runner.lock');
const RUNNER_LOG = path.join(STATE_DIR, 'runner.log');
const CONFIG_FILE = process.env.LOOP_CONFIG || path.join(LOOP_DIR, 'config.json');

const DEFAULTS = {
  planFile: 'docs/BUILD_PLAN.md',
  baseBranch: 'develop',
  mainBranch: 'main',
  branchPrefix: 'task/',
  mergeMode: 'direct', // direct | pr | local
  waitForCi: true,
  order: [],
  laterOrder: [],
  includeLaterPhases: false,
  humanTasks: [],
  pauseBefore: [],
  securityTasks: [],
  protectedPaths: ['loop/', 'docs/BUILD_PLAN.md', 'docs/PRD.md'],
  claude: {
    command: 'claude',
    model: null,
    effort: null,
    permissionMode: 'bypassPermissions',
    maxTurns: 250,
    maxTaskUsd: null,
    timeoutMinutes: 150,
    extraArgs: [],
  },
  review: { enabled: true, rounds: 1, blockingSeverities: ['critical', 'high', 'medium'], maxTurns: 80 },
  securityReview: { enabled: true, blockingSeverities: ['critical', 'high'] },
  maxFixRounds: 3,
  maxAttempts: 2,
  maxTotalUsd: null,
  verify: { commands: ['pnpm install', 'pnpm check'], timeoutMinutes: 45 },
  beforeEach: [],
  rateLimitSleepMinutes: 30,
  stopOnFailure: true,
  commitTrailer: 'Co-Authored-By: Claude <noreply@anthropic.com>',
  notify: { onTaskDone: true, onFailure: true, onPause: true, onRateLimit: true },
};

// ---------------------------------------------------------------- utilities

let shuttingDown = false;
let currentChild = null;
let inLoop = false;

function loadConfig() {
  const raw = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
  const cfg = { ...DEFAULTS, ...raw };
  for (const k of ['claude', 'review', 'securityReview', 'verify', 'notify']) cfg[k] = { ...DEFAULTS[k], ...(raw[k] || {}) };
  return cfg;
}
const config = loadConfig();

const now = () => new Date().toISOString();
const stamp = () => now().replace(/[-:]/g, '').replace(/\..+/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDirs() {
  for (const d of [STATE_DIR, OUT_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}

function log(msg) {
  const line = `[${now()}] ${msg}`;
  console.log(line);
  try {
    ensureDirs();
    fs.appendFileSync(RUNNER_LOG, line + '\n');
  } catch {}
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: opts.timeoutMs,
    env: { ...process.env, ...(opts.env || {}) },
    input: opts.input,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && !r.error;
  if (!ok && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status ?? r.error?.code}): ${out.slice(-2000)}`);
  }
  return { ok, status: r.status, out, stdout: r.stdout || '', timedOut: r.error?.code === 'ETIMEDOUT' };
}
const git = (args, opts) => run('git', args, opts);
const bash = (script, opts) => run('bash', ['-lc', script], opts);

function hasRemote() {
  return git(['remote', 'get-url', 'origin'], { allowFail: true }).ok;
}

function tail(text, lines = 200) {
  const arr = text.split('\n');
  return arr.slice(-lines).join('\n');
}

function render(file, vars) {
  let text = fs.readFileSync(path.join(LOOP_DIR, 'prompts', file), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(String(v ?? ''));
  return text;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// ---------------------------------------------------------------- notifications

async function notify(text) {
  const msg = `[MedTravel loop] ${text}`;
  log(`notify: ${text}`);
  const jobs = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg.slice(0, 4000) }),
      }),
    );
  }
  if (process.env.NOTIFY_WEBHOOK_URL) {
    jobs.push(
      fetch(process.env.NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: msg, content: msg.slice(0, 1900) }),
      }),
    );
  }
  await Promise.allSettled(jobs.map((p) => Promise.race([p, sleep(10000)])));
}

// ---------------------------------------------------------------- plan parsing

const TASK_HEADING = /^\*\*([A-Z]{1,3}-\d{2})\s+(.+?)\*\*\s*$/;

function parsePlan() {
  const file = path.join(REPO, config.planFile);
  if (!fs.existsSync(file)) throw new Error(`Plan file not found: ${config.planFile}. Export the build plan doc as Markdown to this path.`);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const tasks = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_HEADING);
    if (!m) continue;
    const [, id, title] = m;
    const task = { id, title: title.replace(/\\/g, ''), kind: 'checklist', prompt: '', doneWhen: '', scaffold: false, body: '' };
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length && lines[j].startsWith('```')) {
      const fence = lines[j].match(/^`+/)[0];
      const buf = [];
      j++;
      while (j < lines.length && !lines[j].startsWith(fence)) buf.push(lines[j++]);
      task.kind = 'prompt';
      let prompt = buf.join('\n').trim();
      if (/^\/scaffold-module\s+/.test(prompt)) {
        task.scaffold = true;
        prompt = prompt.replace(/^\/scaffold-module\s+/, '');
      }
      prompt = prompt.replace(/^\/task\s+[A-Z]{1,3}-\d{2}\s+/, '');
      task.prompt = prompt;
      j++;
    }
    const body = [];
    for (; j < lines.length; j++) {
      if (TASK_HEADING.test(lines[j]) || /^#{1,3}\s/.test(lines[j])) break;
      const dm = lines[j].match(/^Done when:\s*(.+)$/);
      if (dm) task.doneWhen = dm[1].trim();
      body.push(lines[j]);
    }
    task.body = body.join('\n').trim();
    tasks.set(id, task);
  }
  return tasks;
}

function runOrder() {
  return [...config.order, ...(config.includeLaterPhases ? config.laterOrder : [])];
}

function validatePlan(tasks) {
  const problems = [];
  const order = runOrder();
  const seen = new Set();
  for (const id of order) {
    if (!tasks.has(id)) problems.push(`order lists ${id} but it is not in ${config.planFile}`);
    if (seen.has(id)) problems.push(`order lists ${id} twice`);
    seen.add(id);
  }
  const all = new Set([...config.order, ...config.laterOrder]);
  for (const id of tasks.keys()) if (!all.has(id)) problems.push(`warning: ${id} is in the plan but not in config order (it will never run)`);
  for (const id of order) {
    const t = tasks.get(id);
    if (t && t.kind !== 'prompt' && !config.humanTasks.includes(id)) problems.push(`${id} has no prompt block; add it to humanTasks`);
  }
  return problems;
}

// ---------------------------------------------------------------- state

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { tasks: {}, totalCostUsd: 0, approvals: [], paused: null, current: null };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}
function saveState(state) {
  ensureDirs();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}
function taskState(state, id) {
  return (state.tasks[id] ||= { status: 'pending', attempts: 0, costUsd: 0, sessions: {} });
}
function recomputeCost(state) {
  let total = 0;
  for (const t of Object.values(state.tasks)) {
    t.costUsd = Object.values(t.sessions || {}).reduce((a, b) => a + b, 0);
    total += t.costUsd;
  }
  state.totalCostUsd = Math.round(total * 100) / 100;
}

function applyCommand(state, c) {
  const t = c.id ? taskState(state, c.id) : null;
  switch (c.cmd) {
    case 'approve':
      if (!state.approvals.includes(c.id)) state.approvals.push(c.id);
      if (state.paused?.id === c.id) state.paused = null;
      break;
    case 'retry':
      t.status = 'pending';
      t.attempts = 0;
      t.note = 'retry requested';
      break;
    case 'skip':
      t.status = 'skipped';
      t.note = 'skipped by user';
      break;
    case 'done':
      t.status = 'done';
      t.note = 'marked done by user';
      t.finishedAt = now();
      break;
  }
  if (state.paused && c.id && state.paused.id === c.id && c.cmd !== 'approve') state.paused = null;
}

function drainCommands(state) {
  if (!fs.existsSync(COMMANDS_FILE)) return false;
  const text = fs.readFileSync(COMMANDS_FILE, 'utf8');
  fs.writeFileSync(COMMANDS_FILE, '');
  let changed = false;
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      applyCommand(state, JSON.parse(line));
      changed = true;
      log(`command applied: ${line}`);
    } catch (e) {
      log(`bad command ${line}: ${e.message}`);
    }
  }
  if (changed) saveState(state);
  return changed;
}

function runnerAlive() {
  if (!fs.existsSync(LOCK_FILE)) return false;
  const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8'));
  try {
    process.kill(pid, 0);
    return pid !== process.pid;
  } catch {
    return false;
  }
}
function acquireLock() {
  ensureDirs();
  if (runnerAlive()) throw new Error(`Another runner is active (pid ${fs.readFileSync(LOCK_FILE, 'utf8')}).`);
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}
function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK_FILE, 'utf8')) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

// ---------------------------------------------------------------- git helpers

function ensureLocalExcludes() {
  const ex = path.join(REPO, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(ex), { recursive: true });
  const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
  if (!cur.split('\n').includes('.loop/')) fs.appendFileSync(ex, '\n.loop/\n');
}

function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
}

function cleanTree() {
  git(['reset', '-q', '--hard']);
  git(['clean', '-q', '-fd', '-e', '.loop/']);
}

function ensureBaseBranch() {
  const base = config.baseBranch;
  const remote = hasRemote();
  if (remote) git(['fetch', '-q', 'origin'], { allowFail: true });
  const localExists = git(['rev-parse', '--verify', '-q', base], { allowFail: true }).ok;
  const remoteExists = remote && git(['rev-parse', '--verify', '-q', `origin/${base}`], { allowFail: true }).ok;
  if (!localExists) {
    if (remoteExists) git(['checkout', '-q', '-b', base, `origin/${base}`]);
    else {
      const from = git(['rev-parse', '--verify', '-q', config.mainBranch], { allowFail: true }).ok ? config.mainBranch : 'HEAD';
      git(['checkout', '-q', '-b', base, from]);
      if (remote) git(['push', '-q', '-u', 'origin', base], { allowFail: true });
    }
  } else {
    git(['checkout', '-q', base]);
    if (remoteExists) {
      const pull = git(['merge', '-q', '--ff-only', `origin/${base}`], { allowFail: true });
      if (!pull.ok) throw new Error(`${base} has diverged from origin/${base}; fix manually (${pull.out.slice(-300)})`);
    }
  }
}

function prepareBranch(id, title) {
  if (git(['status', '--porcelain']).stdout.trim()) {
    log('working tree not clean before task; discarding leftover changes');
    cleanTree();
  }
  ensureBaseBranch();
  const branch = `${config.branchPrefix}${id.toLowerCase()}-${slug(title)}`;
  git(['checkout', '-q', '-B', branch]);
  const baseSha = git(['rev-parse', 'HEAD']).stdout.trim();
  return { branch, baseSha };
}

// Undo anything the agent must not do: commits, branch switches, edits to protected paths.
function guardRepo(ctx) {
  const branch = currentBranch();
  if (branch !== ctx.branch) {
    log(`agent switched branch to ${branch}; returning to ${ctx.branch}`);
    git(['stash', '-q', '-u'], { allowFail: true });
    git(['checkout', '-q', ctx.branch]);
    git(['stash', 'pop', '-q'], { allowFail: true });
  }
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  if (head !== ctx.baseSha) {
    log('agent created commits; folding them back into the working tree');
    git(['reset', '-q', '--soft', ctx.baseSha]);
  }
  git(['reset', '-q'], { allowFail: true }); // unstage everything, keep changes
  for (const p of config.protectedPaths) {
    const changed = git(['status', '--porcelain', '--', p]).stdout.trim();
    if (changed) {
      log(`reverting changes to protected path ${p}`);
      git(['checkout', '-q', ctx.baseSha, '--', p], { allowFail: true });
      git(['clean', '-q', '-fd', '--', p], { allowFail: true });
    }
  }
}

function hasChanges() {
  return git(['status', '--porcelain']).stdout.trim().length > 0;
}

// ---------------------------------------------------------------- claude runs

function claudeBaseArgs(maxTurns) {
  const c = config.claude;
  const args = ['--settings', path.join(LOOP_DIR, 'claude-settings.json'), '--max-turns', String(maxTurns)];
  if (c.permissionMode === 'bypassPermissions') args.push('--dangerously-skip-permissions');
  else args.push('--permission-mode', c.permissionMode, '--permission-prompts', 'none');
  if (c.model) args.push('--model', c.model);
  if (c.effort) args.push('--effort', c.effort);
  if (c.maxTaskUsd) args.push('--max-budget-usd', String(c.maxTaskUsd));
  return args.concat(c.extraArgs || []);
}

const RATE_LIMIT_RE = /rate.?limit|usage limit|limit reached|limit will reset|overloaded|429|quota|credit balance/i;

// Runs `claude -p` with stream-json output, writing every event to logFile.
function runClaude(prompt, { logFile, resume = null, maxTurns = config.claude.maxTurns, appendRules = true } = {}) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...claudeBaseArgs(maxTurns)];
    if (appendRules) args.push('--append-system-prompt-file', path.join(LOOP_DIR, 'prompts', 'autonomous-rules.md'));
    if (resume) args.push('--resume', resume);
    const out = fs.createWriteStream(logFile, { flags: 'a' });
    out.write(JSON.stringify({ type: 'runner', at: now(), resume, prompt: prompt.slice(0, 4000) }) + '\n');
    const child = spawn(config.claude.command, args, { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    currentChild = child;
    let buf = '';
    let result = null;
    let sessionId = resume;
    let stderr = '';
    child.stdout.on('data', (d) => {
      out.write(d);
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.session_id) sessionId = ev.session_id;
          if (ev.type === 'result') result = ev;
        } catch {}
      }
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      out.write(JSON.stringify({ type: 'stderr', text: d.toString() }) + '\n');
    });
    const timer = setTimeout(() => {
      log(`claude run exceeded ${config.claude.timeoutMinutes} min; interrupting`);
      child.kill('SIGINT');
      setTimeout(() => child.kill('SIGTERM'), 60000).unref();
    }, config.claude.timeoutMinutes * 60000);
    child.on('error', (e) => {
      stderr += String(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      currentChild = null;
      out.end();
      const text = `${result?.result || ''}\n${stderr}`;
      const isError = !result || result.is_error || code !== 0;
      resolve({
        code,
        result,
        sessionId: result?.session_id || sessionId,
        cost: Number(result?.total_cost_usd || 0),
        ok: !isError,
        rateLimited: isError && RATE_LIMIT_RE.test(text),
        error: isError ? (result?.subtype || '') + ' ' + tail(text, 30) : null,
      });
    });
  });
}

// Read-only review run that returns structured findings.
function runReview(promptFile, vars) {
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            file: { type: 'string' },
            line: { type: 'integer' },
            issue: { type: 'string' },
            fix: { type: 'string' },
          },
          required: ['severity', 'issue', 'fix'],
        },
      },
    },
    required: ['findings'],
  });
  const c = config.claude;
  const args = [
    '-p', render(promptFile, vars),
    '--output-format', 'json',
    '--json-schema', schema,
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--allowedTools', 'Read,Grep,Glob,Bash(git diff *),Bash(git status *),Bash(git log *),Bash(git show *),Bash(ls *)',
    '--max-turns', String(config.review.maxTurns),
    '--settings', path.join(LOOP_DIR, 'claude-settings.json'),
  ];
  if (c.model) args.push('--model', c.model);
  const r = run(c.command, args, { allowFail: true, timeoutMs: 60 * 60000 });
  try {
    const obj = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());
    return { findings: obj.structured_output?.findings || [], cost: Number(obj.total_cost_usd || 0), sessionId: obj.session_id, raw: obj, rateLimited: obj.is_error && RATE_LIMIT_RE.test(obj.result || '') };
  } catch {
    return { findings: [], cost: 0, error: tail(r.out, 20), rateLimited: RATE_LIMIT_RE.test(r.out) };
  }
}

// ---------------------------------------------------------------- verification

function runBeforeEach() {
  for (const step of config.beforeEach || []) {
    if (step.ifExists && !fs.existsSync(path.join(REPO, step.ifExists))) continue;
    const r = bash(step.run, { allowFail: true, timeoutMs: 15 * 60000 });
    if (!r.ok) log(`beforeEach "${step.run}" failed: ${tail(r.out, 10)}`);
  }
}

function verify(id, logFile) {
  runBeforeEach();
  for (const cmd of config.verify.commands) {
    log(`[${id}] verify: ${cmd}`);
    const r = bash(cmd, { allowFail: true, timeoutMs: config.verify.timeoutMinutes * 60000, env: { CI: 'true' } });
    fs.appendFileSync(logFile, JSON.stringify({ type: 'verify', cmd, ok: r.ok, output: tail(r.out, 400) }) + '\n');
    if (!r.ok) return { pass: false, cmd, output: tail(r.out, 200) + (r.timedOut ? '\n(TIMED OUT)' : '') };
  }
  return { pass: true };
}

// ---------------------------------------------------------------- one task

class TaskError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // failed | blocked
  }
}

async function waitOutRateLimit(what) {
  const mins = config.rateLimitSleepMinutes;
  log(`${what}: usage/rate limit hit; sleeping ${mins} min`);
  if (config.notify.onRateLimit) await notify(`${what}: Claude usage limit reached, waiting ${mins} min then continuing.`);
  const until = Date.now() + mins * 60000;
  while (Date.now() < until && !shuttingDown) await sleep(10000);
}

async function claudeStep(state, id, prompt, opts) {
  for (;;) {
    const r = await runClaude(prompt, opts);
    const t = taskState(state, id);
    if (r.sessionId && r.cost) {
      t.sessions[r.sessionId] = Math.max(t.sessions[r.sessionId] || 0, r.cost);
      recomputeCost(state);
      saveState(state);
    }
    if (r.rateLimited && !shuttingDown) {
      await waitOutRateLimit(id);
      if (shuttingDown) throw new TaskError('interrupted', 'shutdown during rate-limit wait');
      if (r.sessionId) {
        opts = { ...opts, resume: r.sessionId };
        prompt = `You were interrupted by a usage limit while working on task ${id}. Continue exactly where you left off and complete every remaining step of the procedure, including writing .loop/out/${id}.json.`;
      }
      continue;
    }
    if (shuttingDown) throw new TaskError('interrupted', 'runner shutting down');
    return r;
  }
}

async function fixUntilGreen(state, ctx, reason) {
  let v = verify(ctx.id, ctx.logFile);
  let round = 0;
  while (!v.pass) {
    if (round >= config.maxFixRounds) throw new TaskError('failed', `${reason}: checks still failing after ${round} fix rounds (${v.cmd})\n${tail(v.output, 40)}`);
    round++;
    log(`[${ctx.id}] checks failed (${v.cmd}); fix round ${round}`);
    const prompt = render('fix.md', { TASK_ID: ctx.id, COMMAND: v.cmd, OUTPUT: v.output });
    const r = await claudeStep(state, ctx.id, prompt, { logFile: ctx.logFile, resume: ctx.sessionId });
    if (r.sessionId) ctx.sessionId = r.sessionId;
    guardRepo(ctx);
    v = verify(ctx.id, ctx.logFile);
  }
}

async function reviewStep(state, ctx, kind) {
  const isSec = kind === 'security';
  const file = isSec ? 'security-review.md' : 'review.md';
  const blocking = isSec ? config.securityReview.blockingSeverities : config.review.blockingSeverities;
  git(['add', '-A', '-N']); // make new files visible to `git diff HEAD`
  let rv;
  for (;;) {
    rv = runReview(file, { TASK_ID: ctx.id, TASK_TITLE: ctx.task.title, TASK_TEXT: ctx.task.prompt, DONE_WHEN: ctx.task.doneWhen });
    if (rv.rateLimited && !shuttingDown) {
      await waitOutRateLimit(`${ctx.id} ${kind} review`);
      continue;
    }
    break;
  }
  git(['reset', '-q'], { allowFail: true });
  const t = taskState(state, ctx.id);
  if (rv.sessionId && rv.cost) {
    t.sessions[rv.sessionId] = rv.cost;
    recomputeCost(state);
    saveState(state);
  }
  if (rv.error) log(`[${ctx.id}] ${kind} review produced no parsable output: ${rv.error}`);
  fs.writeFileSync(path.join(OUT_DIR, `${ctx.id}-${kind}-review.json`), JSON.stringify(rv.findings, null, 2));
  const must = rv.findings.filter((f) => blocking.includes(f.severity));
  log(`[${ctx.id}] ${kind} review: ${rv.findings.length} findings, ${must.length} blocking`);
  if (!must.length) return;
  const list = must.map((f, i) => `${i + 1}. [${f.severity}] ${f.file || ''}${f.line ? ':' + f.line : ''} ${f.issue}\n   Fix: ${f.fix}`).join('\n');
  const r = await claudeStep(state, ctx.id, render('review-fix.md', { TASK_ID: ctx.id, KIND: kind, FINDINGS: list }), { logFile: ctx.logFile, resume: ctx.sessionId });
  if (r.sessionId) ctx.sessionId = r.sessionId;
  guardRepo(ctx);
  await fixUntilGreen(state, ctx, `after ${kind} review fixes`);
}

function readSummary(id) {
  const f = path.join(OUT_DIR, `${id}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function commitAndMerge(ctx, summary) {
  git(['add', '-A']);
  const staged = git(['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
  for (const f of staged) {
    if (/(^|\/)\.env(\.[^/]+)?$/.test(f) && !/\.example$/.test(f)) {
      log(`[${ctx.id}] refusing to commit secret file ${f}`);
      git(['rm', '-q', '--cached', f], { allowFail: true });
    }
  }
  const lines = [`${ctx.id}: ${ctx.task.title}`, '', summary?.summary || 'Implemented by the autonomous build loop.'];
  if (summary?.assumptions?.length) lines.push('', 'Assumptions:', ...summary.assumptions.map((a) => `- ${a}`));
  if (summary?.deferred?.length) lines.push('', 'Deferred:', ...summary.deferred.map((a) => `- ${a}`));
  if (config.commitTrailer) lines.push('', config.commitTrailer);
  const msgFile = path.join(STATE_DIR, 'commit-msg.txt');
  fs.writeFileSync(msgFile, lines.join('\n') + '\n');
  git(['commit', '-q', '--no-verify', '-F', msgFile]);
  const sha = git(['rev-parse', '--short', 'HEAD']).stdout.trim();
  const remote = hasRemote();
  const base = config.baseBranch;

  if (config.mergeMode === 'pr' && remote) {
    git(['push', '-q', '-u', 'origin', ctx.branch, '--force-with-lease']);
    const body = path.join(STATE_DIR, 'pr-body.md');
    const steps = (summary?.manual_test_steps || []).map((s) => `- ${s}`).join('\n');
    fs.writeFileSync(body, `${lines.slice(2).join('\n')}\n\n**How to try it**\n${steps || '- see task plan in docs/plans/' + ctx.id + '.md'}\n`);
    const existing = run('gh', ['pr', 'view', ctx.branch, '--json', 'number'], { allowFail: true });
    if (!existing.ok) run('gh', ['pr', 'create', '--base', base, '--head', ctx.branch, '--title', `${ctx.id}: ${ctx.task.title}`, '--body-file', body]);
    if (config.waitForCi) {
      const checks = run('gh', ['pr', 'checks', ctx.branch, '--watch', '--interval', '30'], { allowFail: true, timeoutMs: 90 * 60000 });
      if (!checks.ok && !/no checks/i.test(checks.out)) throw new TaskError('failed', `CI failed on PR for ${ctx.id}:\n${tail(checks.out, 40)}`);
    }
    run('gh', ['pr', 'merge', ctx.branch, '--merge', '--delete-branch']);
    git(['checkout', '-q', base]);
    git(['pull', '-q', '--ff-only', 'origin', base]);
  } else {
    git(['checkout', '-q', base]);
    git(['merge', '-q', '--no-ff', ctx.branch, '-m', `Merge ${ctx.id}: ${ctx.task.title}`]);
    if (config.mergeMode !== 'local' && remote) {
      // A failed push is not fatal: the merge is safe locally and the next task's push carries it.
      let pushed = false;
      for (let i = 0; i < 3 && !pushed; i++) {
        pushed = git(['push', '-q', 'origin', base], { allowFail: true, timeoutMs: 120000 }).ok;
        if (!pushed) spawnSync('sleep', ['10']);
      }
      if (!pushed) ctx.pushWarning = `could not push ${base} to origin; it will be retried after the next task`;
      git(['push', '-q', 'origin', ctx.branch], { allowFail: true, timeoutMs: 120000 });
    }
  }
  return sha;
}

function parkFailedWork(ctx, reason, attempt = 1) {
  if (!ctx.branch || currentBranch() !== ctx.branch) {
    // failed before/after the task branch was in use: just make sure we are clean on base
    try {
      cleanTree();
      git(['checkout', '-q', config.baseBranch], { allowFail: true });
    } catch {}
    return null;
  }
  try {
    guardRepo(ctx);
    if (hasChanges()) {
      git(['add', '-A']);
      git(['commit', '-q', '--no-verify', '-m', `WIP ${ctx.id} (${reason.split('\n')[0].slice(0, 60)})`], { allowFail: true });
    }
    const wip = `wip/${ctx.id.toLowerCase()}-a${attempt}-${stamp()}`;
    git(['branch', '-q', '-m', wip], { allowFail: true });
    if (hasRemote() && config.mergeMode !== 'local') git(['push', '-q', 'origin', wip], { allowFail: true });
    cleanTree();
    git(['checkout', '-q', config.baseBranch], { allowFail: true });
    return wip;
  } catch (e) {
    log(`could not park failed work: ${e.message}`);
    return null;
  }
}

async function runTask(state, tasks, id) {
  const task = tasks.get(id);
  const t = taskState(state, id);
  t.status = 'running';
  t.attempts += 1;
  t.startedAt = now();
  t.note = '';
  state.current = id;
  saveState(state);
  const logFile = path.join(LOG_DIR, `${id}-${stamp()}.jsonl`);
  t.lastLog = path.relative(REPO, logFile);
  log(`[${id}] start: ${task.title} (attempt ${t.attempts}) log=${t.lastLog}`);

  const ctx = { id, task, branch: null, baseSha: null, logFile, sessionId: null };
  try {
    Object.assign(ctx, prepareBranch(id, task.title));
    t.branch = ctx.branch;
    saveState(state);
    fs.rmSync(path.join(OUT_DIR, `${id}.json`), { force: true });
    runBeforeEach();
    const instructions = task.scaffold
      ? `Follow the procedure in .claude/skills/scaffold-module/SKILL.md (skip its "wait for approval" step) for: ${task.prompt}`
      : task.prompt;
    const prompt = render('task.md', { TASK_ID: id, TASK_TITLE: task.title, TASK_TEXT: instructions, DONE_WHEN: task.doneWhen || 'see task text' });
    const r = await claudeStep(state, id, prompt, { logFile });
    ctx.sessionId = r.sessionId;
    t.sessionId = r.sessionId;
    if (!r.ok) throw new TaskError('failed', `claude run failed: ${r.error}`);
    guardRepo(ctx);
    const summary0 = readSummary(id);
    if (summary0?.status === 'blocked') throw new TaskError('blocked', summary0.blocked_reason || 'agent reported the task as blocked');
    if (!hasChanges()) throw new TaskError('failed', 'the run finished without changing any files');

    await fixUntilGreen(state, ctx, 'initial implementation');
    if (config.review.enabled) for (let i = 0; i < config.review.rounds; i++) await reviewStep(state, ctx, 'code');
    if (config.securityReview.enabled && config.securityTasks.includes(id)) await reviewStep(state, ctx, 'security');

    const summary = readSummary(id);
    const sha = commitAndMerge(ctx, summary);
    t.status = 'done';
    t.finishedAt = now();
    t.commit = sha;
    t.summary = summary?.summary || '';
    state.current = null;
    recomputeCost(state);
    saveState(state);
    log(`[${id}] done in commit ${sha}; task cost ~$${t.costUsd.toFixed(2)}, total ~$${state.totalCostUsd}`);
    if (config.notify.onTaskDone) await notify(`✅ ${id} ${task.title} merged into ${config.baseBranch} (${sha}). ${t.summary.slice(0, 300)}`);
    if (ctx.pushWarning) await notify(`⚠️ ${id}: ${ctx.pushWarning}`);
  } catch (e) {
    const kind = e instanceof TaskError ? e.kind : 'failed';
    const reason = e.message || String(e);
    state.current = null;
    if (kind === 'interrupted') {
      t.status = 'pending';
      t.attempts = Math.max(0, t.attempts - 1);
      t.note = 'interrupted';
      cleanTree();
      git(['checkout', '-q', config.baseBranch], { allowFail: true });
      saveState(state);
      log(`[${id}] interrupted; will restart from scratch next time`);
      return;
    }
    const wip = parkFailedWork(ctx, reason, t.attempts);
    const retryable = kind === 'failed' && t.attempts < config.maxAttempts;
    t.status = retryable ? 'pending' : kind;
    t.note = `${reason.slice(0, 1500)}${wip ? `\nwork saved on branch ${wip}` : ''}`;
    saveState(state);
    log(`[${id}] ${kind}: ${reason.slice(0, 500)}`);
    if (!retryable && config.notify.onFailure) {
      await notify(`❌ ${id} ${task.title} ${kind}. ${reason.slice(0, 600)}${wip ? `\nWork saved on ${wip}.` : ''}\nFix it, then run: node loop/runner.mjs retry ${id} (or skip/done).`);
    }
  }
}

// ---------------------------------------------------------------- main loop

function nextTask(state, tasks) {
  for (const id of runOrder()) {
    const t = state.tasks[id];
    const status = t?.status || 'pending';
    if (status === 'done' || status === 'skipped') continue;
    if ((status === 'failed' || status === 'blocked') && !config.stopOnFailure) continue;
    return { id, status, task: tasks.get(id) };
  }
  return null;
}

async function waitForChange(state, reason) {
  log(`waiting: ${reason}`);
  while (!shuttingDown) {
    if (fs.existsSync(STOP_FILE)) return;
    if (drainCommands(state)) return;
    await sleep(30000);
  }
}

async function loop({ once = false, only = null } = {}) {
  ensureDirs();
  ensureLocalExcludes();
  acquireLock();
  inLoop = true;
  const tasks = parsePlan();
  const problems = validatePlan(tasks).filter((p) => !p.startsWith('warning'));
  if (problems.length) throw new Error('Plan/config problems:\n' + problems.join('\n'));
  const state = loadState();
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.status === 'running') {
      log(`[${id}] was running when the runner stopped; resetting`);
      t.status = 'pending';
      t.attempts = Math.max(0, t.attempts - 1);
      cleanTree();
    }
  }
  state.current = null;
  saveState(state);
  let lastPauseNotice = null;

  try {
    while (!shuttingDown) {
      drainCommands(state);
      if (fs.existsSync(STOP_FILE)) {
        fs.unlinkSync(STOP_FILE);
        log('STOP requested; exiting');
        break;
      }
      if (config.maxTotalUsd && state.totalCostUsd >= config.maxTotalUsd) {
        const msg = `total spend ~$${state.totalCostUsd} reached maxTotalUsd ($${config.maxTotalUsd}). Raise it in loop/config.json and restart.`;
        await notify(`⏸ ${msg}`);
        log(msg);
        break;
      }
      const pick = only ? { id: only, status: state.tasks[only]?.status || 'pending', task: tasks.get(only) } : nextTask(state, tasks);
      if (!pick) {
        await notify('🎉 All tasks in the run order are done.');
        break;
      }
      if (!pick.task) throw new Error(`Unknown task ${pick.id}`);
      const { id } = pick;

      if (pick.status === 'failed' || pick.status === 'blocked') {
        state.paused = { id, reason: `${id} is ${pick.status}` };
        saveState(state);
        if (once) break;
        await waitForChange(state, `${id} is ${pick.status}; run "retry ${id}", "skip ${id}" or "done ${id}"`);
        continue;
      }
      if (config.humanTasks.includes(id)) {
        taskState(state, id).status = 'needs-human';
        state.paused = { id, reason: `${id} is a human task` };
        saveState(state);
        if (lastPauseNotice !== id && config.notify.onPause) await notify(`🙋 ${id} ${pick.task.title} needs you. When finished run: node loop/runner.mjs done ${id}`);
        lastPauseNotice = id;
        if (once) break;
        await waitForChange(state, `${id} needs a human`);
        continue;
      }
      if (config.pauseBefore.includes(id) && !state.approvals.includes(id)) {
        state.paused = { id, reason: `checkpoint before ${id}` };
        saveState(state);
        if (lastPauseNotice !== id && config.notify.onPause) await notify(`⏸ Checkpoint before ${id} ${pick.task.title}. Review ${config.baseBranch}, then run: node loop/runner.mjs approve ${id}`);
        lastPauseNotice = id;
        if (once) break;
        await waitForChange(state, `checkpoint before ${id}`);
        continue;
      }
      state.paused = null;
      saveState(state);
      await runTask(state, tasks, id);
      if (once) break;
    }
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------- CLI commands

function queueCommand(cmd, id) {
  ensureDirs();
  if (id && !/^[A-Z]{1,3}-\d{2}$/.test(id)) throw new Error(`Task ID looks wrong: ${id}`);
  if (runnerAlive()) {
    fs.appendFileSync(COMMANDS_FILE, JSON.stringify({ cmd, id, at: now() }) + '\n');
    console.log(`Queued "${cmd} ${id}" for the running loop (applied within 30 s or after the current task).`);
  } else {
    const state = loadState();
    applyCommand(state, { cmd, id });
    saveState(state);
    console.log(`Applied "${cmd} ${id}".`);
  }
}

function printStatus() {
  const tasks = parsePlan();
  const state = loadState();
  const order = runOrder();
  const counts = {};
  const rows = [];
  for (const id of order) {
    const t = state.tasks[id] || { status: 'pending', attempts: 0, costUsd: 0 };
    counts[t.status] = (counts[t.status] || 0) + 1;
    if (t.status !== 'pending' || id === state.current) rows.push(`${id.padEnd(6)} ${t.status.padEnd(12)} tries=${t.attempts} $${(t.costUsd || 0).toFixed(2).padStart(7)}  ${(tasks.get(id)?.title || '').slice(0, 50)}`);
  }
  console.log(rows.join('\n') || '(nothing started yet)');
  console.log('\n' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ') + ` · of ${order.length} tasks`);
  console.log(`estimated spend: $${state.totalCostUsd || 0}${config.maxTotalUsd ? ` (cap $${config.maxTotalUsd})` : ''}`);
  console.log(`runner: ${runnerAlive() ? 'running' : 'not running'}${state.current ? ` · working on ${state.current}` : ''}`);
  if (state.paused) console.log(`paused: ${state.paused.reason}`);
  const failed = order.filter((id) => ['failed', 'blocked', 'needs-human'].includes(state.tasks[id]?.status));
  for (const id of failed) console.log(`\n${id} note:\n${state.tasks[id].note || ''}`);
  const nxt = nextTask(state, tasks);
  if (nxt) console.log(`\nnext: ${nxt.id} ${nxt.task?.title || ''}`);
}

function printPlan() {
  const tasks = parsePlan();
  const problems = validatePlan(tasks);
  runOrder().forEach((id, i) => {
    const t = tasks.get(id);
    const tags = [config.humanTasks.includes(id) && 'human', config.pauseBefore.includes(id) && 'checkpoint', config.securityTasks.includes(id) && 'security'].filter(Boolean);
    console.log(`${String(i + 1).padStart(3)}. ${id.padEnd(6)} ${t ? t.title : '??? missing'}${tags.length ? '  [' + tags.join(', ') + ']' : ''}`);
  });
  console.log(`\n${tasks.size} tasks in plan, ${runOrder().length} in run order.`);
  if (problems.length) console.log('\n' + problems.join('\n'));
}

async function watch() {
  const state = loadState();
  const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(LOG_DIR, f)) : [];
  if (!files.length) return console.log('No logs yet.');
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const file = state.current && state.tasks[state.current]?.lastLog ? path.join(REPO, state.tasks[state.current].lastLog) : files[0];
  console.log(`Following ${path.relative(REPO, file)} (Ctrl+C to stop)\n`);
  let pos = 0;
  let buf = '';
  const show = (line) => {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (ev.type === 'assistant') {
      for (const c of ev.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) console.log(c.text.trim());
        if (c.type === 'tool_use') {
          const inp = c.input || {};
          const brief = inp.command || inp.file_path || inp.pattern || inp.description || JSON.stringify(inp).slice(0, 120);
          console.log(`  → ${c.name}: ${String(brief).split('\n')[0].slice(0, 160)}`);
        }
      }
    } else if (ev.type === 'result') console.log(`\n== run finished: ${ev.subtype} · turns ${ev.num_turns} · ~$${ev.total_cost_usd}\n`);
    else if (ev.type === 'verify') console.log(`  ✓ verify "${ev.cmd}": ${ev.ok ? 'passed' : 'FAILED'}`);
    else if (ev.type === 'runner') console.log(`\n== ${ev.resume ? 'follow-up run' : 'task run'} started ${ev.at}`);
  };
  for (;;) {
    const size = fs.statSync(file).size;
    if (size > pos) {
      const fd = fs.openSync(file, 'r');
      const chunk = Buffer.alloc(size - pos);
      fs.readSync(fd, chunk, 0, chunk.length, pos);
      fs.closeSync(fd);
      pos = size;
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        show(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    await sleep(1000);
  }
}

function preflight() {
  const results = [];
  const check = (name, fn) => {
    try {
      const msg = fn();
      results.push(`✔ ${name}${msg ? ': ' + msg : ''}`);
    } catch (e) {
      results.push(`✘ ${name}: ${e.message.split('\n')[0]}`);
    }
  };
  check('node >= 22', () => {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 22) throw new Error(`found ${process.versions.node}`);
    return process.versions.node;
  });
  check('git repository', () => git(['rev-parse', '--show-toplevel']).stdout.trim());
  check('git identity', () => {
    const n = git(['config', 'user.name'], { allowFail: true }).stdout.trim();
    const e = git(['config', 'user.email'], { allowFail: true }).stdout.trim();
    if (!n || !e) throw new Error('set git config user.name and user.email');
    return `${n} <${e}>`;
  });
  check('origin remote reachable', () => {
    if (!hasRemote()) return 'no origin remote (mergeMode will act like "local")';
    git(['ls-remote', '-q', 'origin', 'HEAD'], { timeoutMs: 30000 });
    return git(['remote', 'get-url', 'origin']).stdout.trim();
  });
  check('claude CLI', () => run(config.claude.command, ['--version']).stdout.trim());
  check('claude authentication', () => {
    if (process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY set (pay-per-use API billing)';
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'CLAUDE_CODE_OAUTH_TOKEN set (subscription)';
    const r = run(config.claude.command, ['auth', 'status'], { allowFail: true });
    if (!r.ok) throw new Error('not logged in: set CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) or ANTHROPIC_API_KEY');
    return 'logged in';
  });
  check('pnpm', () => run('pnpm', ['--version']).stdout.trim());
  check('docker', () => run('docker', ['info', '--format', '{{.ServerVersion}}']).stdout.trim());
  check('jq (used by Claude Code hooks)', () => run('jq', ['--version']).stdout.trim());
  if (config.mergeMode === 'pr') check('gh CLI authenticated', () => run('gh', ['auth', 'status']).out.split('\n')[1] || 'ok');
  check('plan file', () => {
    const tasks = parsePlan();
    const problems = validatePlan(tasks);
    const errors = problems.filter((p) => !p.startsWith('warning'));
    if (errors.length) throw new Error(errors.join('; '));
    return `${tasks.size} tasks parsed, ${runOrder().length} in run order${problems.length ? ` (${problems.length} warnings, see "plan")` : ''}`;
  });
  check('PRD file', () => {
    if (!fs.existsSync(path.join(REPO, 'docs/PRD.md'))) throw new Error('docs/PRD.md missing: export the PRD doc as Markdown');
    return 'docs/PRD.md';
  });
  check('working tree clean', () => {
    const s = git(['status', '--porcelain']).stdout.trim();
    if (s) throw new Error('uncommitted changes present; commit them first (the loop discards leftovers)');
    return 'clean';
  });
  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('✘'))) process.exitCode = 1;
}

// ---------------------------------------------------------------- entry

function onSignal(sig) {
  if (!inLoop) process.exit(130);
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${sig} received; stopping after interrupting the current Claude run`);
  if (currentChild) {
    currentChild.kill('SIGINT');
    setTimeout(() => currentChild?.kill('SIGTERM'), 60000).unref();
  }
}
process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

const [cmd, arg] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'run':
      await loop();
      break;
    case 'once':
      await loop({ once: true, only: arg || null });
      break;
    case 'status':
      printStatus();
      break;
    case 'plan':
      printPlan();
      break;
    case 'check':
      preflight();
      break;
    case 'watch':
      await watch();
      break;
    case 'approve':
    case 'retry':
    case 'skip':
    case 'done':
      if (!arg) throw new Error(`usage: runner.mjs ${cmd} <TASK-ID>`);
      queueCommand(cmd, arg);
      break;
    case 'stop':
      ensureDirs();
      fs.writeFileSync(STOP_FILE, now());
      console.log('Stop requested: the loop exits after the current task (or within 30 s if idle).');
      break;
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (e) {
  log(`error: ${e.message}`);
  process.exitCode = 1;
}
