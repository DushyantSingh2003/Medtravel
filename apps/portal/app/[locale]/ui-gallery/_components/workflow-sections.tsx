'use client';

import {
  ChatPanel,
  KanbanBoard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StageTracker,
  StatCard,
  StatusBadge,
  Timeline,
  intlLocale,
  moveCard,
  type ChatMessage,
  type KanbanCard,
} from '@medtravel/ui';
import { CASE_STAGES, type CaseStage, type Locale } from '@medtravel/contracts';
import { CalendarCheck, FileCheck2, Plane, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Section } from './section';

interface BoardCard extends KanbanCard {
  title: string;
  patient: string;
  stage: CaseStage;
}

export function WorkflowSections({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const stages = useTranslations('stages');
  const [current, setCurrent] = useState<CaseStage>('visa');
  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }),
    [locale],
  );
  const stamp = (iso: string) => when.format(new Date(iso));

  const stageLabels = Object.fromEntries(
    CASE_STAGES.map((stage) => [stage, stages(stage)]),
  ) as Record<CaseStage, string>;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      author: { name: 'Asha Verma' },
      own: false,
      body: t('chat.m1'),
      dateTime: '2026-03-02T09:30:00Z',
      timeLabel: stamp('2026-03-02T09:30:00Z'),
    },
    {
      id: 'm2',
      author: { name: t('chat.you') },
      own: true,
      body: t('chat.m2'),
      dateTime: '2026-03-02T09:32:00Z',
      timeLabel: stamp('2026-03-02T09:32:00Z'),
    },
    {
      id: 'm3',
      author: { name: 'Asha Verma' },
      own: false,
      body: t('chat.m3'),
      dateTime: '2026-03-02T09:35:00Z',
      timeLabel: stamp('2026-03-02T09:35:00Z'),
      attachments: [{ id: 'a1', name: 'invitation-letter.pdf', size: 245_760, href: '#' }],
    },
  ]);

  const [cards, setCards] = useState<BoardCard[]>([
    {
      id: 'k1',
      columnId: 'qualification',
      title: 'CASE-2026-000101',
      patient: 'Asha Verma',
      stage: 'qualification',
    },
    {
      id: 'k2',
      columnId: 'qualification',
      title: 'CASE-2026-000102',
      patient: 'محمد علي',
      stage: 'qualification',
    },
    {
      id: 'k3',
      columnId: 'medical_review',
      title: 'CASE-2026-000103',
      patient: 'Elena Petrova',
      stage: 'medical_review',
    },
    {
      id: 'k4',
      columnId: 'visa',
      title: 'CASE-2026-000104',
      patient: 'Omar Al-Farsi',
      stage: 'visa',
    },
  ]);
  const columns = (['qualification', 'medical_review', 'hospital_opinions', 'visa'] as const).map(
    (id) => ({ id, title: stages(id) }),
  );

  return (
    <>
      <Section
        id="stage-tracker"
        title={t('sections.stageTracker')}
        description={t('descriptions.stageTracker')}
      >
        <div className="space-y-4">
          <div className="max-w-xs">
            <Select value={current} onValueChange={(value) => setCurrent(value as CaseStage)}>
              <SelectTrigger aria-label={t('tracker.choose')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stages(stage)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <StageTracker
            current={current}
            labels={{
              title: t('tracker.title'),
              stages: stageLabels,
              done: t('tracker.done'),
              current: t('tracker.current'),
              upcoming: t('tracker.upcoming'),
            }}
          />
        </div>
      </Section>

      <Section
        id="timeline"
        title={t('sections.timeline')}
        description={t('descriptions.timeline')}
      >
        <Timeline
          label={t('timeline.label')}
          items={[
            {
              id: 't1',
              title: t('timeline.created'),
              dateTime: '2026-03-01T04:00:00Z',
              timeLabel: stamp('2026-03-01T04:00:00Z'),
              icon: <Users />,
            },
            {
              id: 't2',
              title: t('timeline.documents'),
              description: t('timeline.documentsBody'),
              dateTime: '2026-03-02T05:10:00Z',
              timeLabel: stamp('2026-03-02T05:10:00Z'),
              icon: <FileCheck2 />,
            },
            {
              id: 't3',
              title: t('timeline.quote'),
              dateTime: '2026-03-04T10:45:00Z',
              timeLabel: stamp('2026-03-04T10:45:00Z'),
              tone: 'success',
              icon: <Wallet />,
            },
            {
              id: 't4',
              title: t('timeline.visa'),
              description: t('timeline.visaBody'),
              dateTime: '2026-03-09T08:00:00Z',
              timeLabel: stamp('2026-03-09T08:00:00Z'),
              tone: 'warning',
              icon: <CalendarCheck />,
            },
            {
              id: 't5',
              title: t('timeline.travel'),
              dateTime: '2026-03-12T06:20:00Z',
              timeLabel: stamp('2026-03-12T06:20:00Z'),
              icon: <Plane />,
            },
          ]}
        />
      </Section>

      <Section
        id="chat-panel"
        title={t('sections.chatPanel')}
        description={t('descriptions.chatPanel')}
      >
        <ChatPanel
          className="max-w-xl"
          locale={locale}
          messages={messages}
          labels={{
            log: t('chat.log'),
            placeholder: t('chat.placeholder'),
            send: t('chat.send'),
            attach: t('chat.attach'),
            removeAttachment: t('chat.removeAttachment'),
            empty: t('chat.empty'),
            sendFailed: t('chat.sendFailed'),
            rejected: {
              empty: (name) => t('uploader.rejected.empty', { name }),
              too_large: (name) => t('uploader.rejected.tooLarge', { name }),
              wrong_type: (name) => t('uploader.rejected.wrongType', { name }),
              too_many: (name) => t('uploader.rejected.tooMany', { name }),
              duplicate: (name) => t('uploader.rejected.duplicate', { name }),
            },
          }}
          onSend={({ text, files }) => {
            const now = new Date();
            setMessages((list) => [
              ...list,
              {
                id: `m${list.length + 1}`,
                author: { name: t('chat.you') },
                own: true,
                body: text,
                dateTime: now.toISOString(),
                timeLabel: when.format(now),
                attachments: files.map((file, index) => ({
                  id: `f${list.length}-${index}`,
                  name: file.name,
                  size: file.size,
                })),
              },
            ]);
          }}
        />
      </Section>

      <Section
        id="stat-card"
        title={t('sections.statCard')}
        description={t('descriptions.statCard')}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('stats.newLeads')}
            value={new Intl.NumberFormat(intlLocale(locale)).format(1284)}
            icon={<Users />}
            delta={{ value: '+12%', trend: 'up', srLabel: t('stats.up12') }}
          />
          <StatCard
            label={t('stats.revenue')}
            value={new Intl.NumberFormat(intlLocale(locale), {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }).format(482_500)}
            icon={<Wallet />}
            delta={{ value: '-3%', trend: 'down', srLabel: t('stats.down3') }}
          />
          <StatCard
            label={t('stats.responseTime')}
            value={t('stats.minutes', { count: 14 })}
            delta={{ value: '-2', trend: 'down', upIsGood: false, srLabel: t('stats.faster') }}
          />
          <StatCard label={t('stats.loading')} value="" loading />
        </div>
      </Section>

      <Section
        id="kanban-board"
        title={t('sections.kanbanBoard')}
        description={t('descriptions.kanbanBoard')}
      >
        <KanbanBoard
          columns={columns}
          cards={cards}
          cardName={(card) => `${card.title} ${card.patient}`}
          onMove={(move) => setCards((list) => moveCard(list, move))}
          renderCard={(card) => (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{card.title}</p>
              <p className="text-sm text-muted-foreground">
                <bdi>{card.patient}</bdi>
              </p>
              <StatusBadge status={card.stage} label={stages(card.stage)} />
            </div>
          )}
          labels={{
            board: t('kanban.board'),
            instructions: t('kanban.instructions'),
            emptyColumn: t('kanban.empty'),
            cardRole: t('kanban.cardRole'),
            pickedUp: (card) => t('kanban.pickedUp', { card }),
            movedTo: (card, column, position) => t('kanban.movedTo', { card, column, position }),
            dropped: (card, column, position) => t('kanban.dropped', { card, column, position }),
            cancelled: (card) => t('kanban.cancelled', { card }),
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">{t('kanban.hint')}</p>
      </Section>
    </>
  );
}
