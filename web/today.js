/** The Today view: before a session, today's plan and a way to start it; during one, its items to do, and finishing it. */
import { read, write } from './api.js'
import { nextItem, sessionProgress, short } from './format.js'
import { counted } from './plural.js'
import { itemSkill, itemTitle, TaskCard } from './task.js'
import { ask, Btn, canAsk, Empty, Glyph, h, K, P, Problem, React, Section, SkillTile, TILE, useEffect, useState } from './ui.js'

const MINUTES = [10, 15, 20, 30, 45]

function StatusChips({ status, t }) {
  const days = status.speaking_debt?.days_since_voice_answer
  return h('div', { className: 'pr-chips' },
    status.cards?.due_today > 0 && h(K.Chip, { icon: 'rotate-ccw', tone: 'accent' }, counted(t, 'status.due', status.cards.due_today)),
    status.speaking_debt?.owed && h(K.Chip, { icon: 'timer', tone: 'warn' }, days == null ? t('status.noVoice') : counted(t, 'status.voiceDays', days)),
    status.step != null && h(K.Chip, { icon: 'graduation-cap', tone: 'muted' }, t('status.step', { n: status.step })))
}

function PlanRow({ item, t }) {
  return h('li', { className: 'pr-planRow' },
    h(SkillTile, { skill: itemSkill(item), size: 'sm' }),
    h('span', { className: 'pr-taskTitle' },
      h('strong', null, itemTitle(item, t)),
      h('span', { className: 'pr-meta' }, [t(`answer.${item.answer ?? item.kind}`), item.variant === 'mini' ? t('item.mini') : null].filter(Boolean).join(' · '))),
    h('span', { className: 'pr-planMinutes' }, item.minutes ? t('minutes', { n: item.minutes }) : ''))
}

function Start({ data, lang, t, learner, onStarted }) {
  const [minutes, setMinutes] = useState(null)
  const [plan, setPlan] = useState(data.plan)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  useEffect(() => setPlan(data.plan), [data.plan])
  const chosen = minutes ?? plan?.minutes_available ?? 20

  const pick = async value => {
    setMinutes(value)
    try { setPlan(await read('plan', { lang, minutes: value })) } catch (error) { setProblem(error.message) }
  }
  const start = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await write('session/start', { lang, minutes: chosen })
      onStarted()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }
  const items = plan?.items ?? []
  return h(Section, { title: t('today.title'), aside: h(StatusChips, { status: data.status, t }) },
    h('div', { className: 'pr-minutes', role: 'group', 'aria-label': t('today.minutes') },
      MINUTES.map(value => h(P.Pill, { key: value, active: chosen === value, 'aria-pressed': chosen === value, onClick: () => pick(value) }, t('minutes', { n: value })))),
    items.length === 0
      ? h(Empty, { icon: 'circle-check', title: t('today.nothing') }, t('today.nothingNote'))
      : h('ul', { className: 'pr-plan' }, items.map(item => h(PlanRow, { key: item.id, item, t }))),
    plan?.smallest_step && h('p', { className: 'pr-note' }, t('today.smallest', { task: itemTitle(plan.smallest_step, t) })),
    h('div', { className: 'pr-controls' },
      h(Btn, { variant: 'primary', size: 'md', onClick: start, disabled: busy || items.length === 0 }, t('today.start')),
      canAsk() && h(Btn, { variant: 'ghost', onClick: () => ask({ title: t('ask.planTitle'), lines: [], context: { learner, lang } }, t('ask.planWrite')) }, h(Glyph.chat, { size: 14 }), t('ask.plan'))),
    h(Problem, null, problem))
}

/** The result of a finished session: points for what was done, with whatever the ledger answered. */
export function Finished({ session, t, onClose }) {
  const points = session.points ?? {}
  const balance = points.response?.summary?.balance
  const recorded = points.status === 'earned'
  return h('div', { className: 'pr-finished', role: 'status' },
    h(K.Tile, { icon: 'sparkles', tone: 'ok', size: TILE.lg }),
    h('div', { className: 'pr-finishedBody' },
      h('h2', null, t('finish.done')),
      points.points > 0 && h('p', { className: 'pr-points' }, t('finish.points', { n: short(points.points) })),
      h('p', { className: 'pr-note' }, recorded ? (balance != null ? t('finish.balance', { n: short(balance) }) : t('finish.recorded')) : t(points.status === 'failed' ? 'finish.later' : 'finish.saved')),
      (points.trophies ?? []).length > 0 && h('div', { className: 'pr-chips' }, points.trophies.map(name => h(P.Tag, { key: name, tone: 'success' }, name)))),
    h(Btn, { variant: 'ghost', onClick: onClose }, t('close')))
}

/** A recording whose job failed or lost its process: what happened, and a way to clear it. */
function JobProblems({ jobs, t, onDismissed }) {
  const dismiss = async id => { try { await write('job/dismiss', { id }) } finally { onDismissed() } }
  return jobs.filter(job => job.state !== 'running').map(job => h('div', { key: job.id, className: 'pr-jobProblem', role: 'alert' },
    h('p', null, job.state === 'failed' ? t('job.failed', { error: job.error }) : t('job.lost')),
    h(Btn, { variant: 'ghost', onClick: () => dismiss(job.id) }, t('job.dismiss'))))
}

function FinishBar({ session, lang, t, onFinished, onAbandoned }) {
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [sure, setSure] = useState(false)
  const finish = async () => {
    setBusy(true)
    setProblem(null)
    try {
      onFinished(await write('session/finish', { lang, session: session.id, minutes: minutes === '' ? undefined : Number(minutes) }))
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }
  const abandon = async () => {
    try { await write('session/abandon', { lang, session: session.id }); onAbandoned() } catch (error) { setProblem(error.message) }
  }
  return h('div', { className: 'pr-finishBar' },
    h('label', { className: 'pr-minutesField' }, h('span', null, t('finish.minutes')),
      h('input', { type: 'number', inputMode: 'decimal', min: 0, max: 600, step: 1, value: minutes, placeholder: t('finish.auto'), onChange: event => setMinutes(event.target.value) })),
    h(Btn, { variant: 'primary', size: 'md', onClick: finish, disabled: busy }, t('finish.button')),
    sure
      ? h(Btn, { variant: 'ghost', onClick: abandon }, t('finish.abandonSure'))
      : h(Btn, { variant: 'ghost', onClick: () => setSure(true) }, t('finish.abandon')),
    h('p', { className: 'pr-note pr-finishNote' }, t('finish.note')),
    h(Problem, null, problem))
}

/**
 * @param {object} o
 * @param {object} o.data - the state answer
 * @param {(key: string, params?: object) => string} o.t
 * @param {() => void} o.reload
 * @param {() => void} o.goReview
 * @param {(session: object) => void} o.onFinished
 */
export function Today({ data, t, reload, goReview, onFinished }) {
  const { session, lang, attempts } = data
  const learner = data.learner.id
  const [opened, setOpened] = useState(null)
  const next = nextItem(session)
  const current = opened ?? next?.id ?? null
  useEffect(() => { setOpened(null) }, [session?.id])

  if (!session) return h(Start, { data, lang, t, learner, onStarted: reload })
  const { done, total } = sessionProgress(session)
  const byItem = item => attempts.filter(attempt => attempt.item === item.id || (!attempt.item && attempt.task === item.task))
  return h('div', { className: 'pr-session' },
    h(Section, {
      title: t('session.title'),
      aside: h('div', { className: 'pr-chips' }, h(StatusChips, { status: data.status, t }), h(K.Chip, { icon: 'list-checks', tone: done === total ? 'ok' : 'muted' }, t('session.progress', { done, total }))),
    },
    h(K.Segments, { items: session.plan.items.map(item => ({ key: item.id, state: item.state === 'done' ? 'done' : item.id === current ? 'current' : 'todo' })), label: t('session.progress', { done, total }) }),
    h(JobProblems, { jobs: data.jobs ?? [], t, onDismissed: reload }),
    h('div', { className: 'pr-tasks' }, session.plan.items.map(item => h(TaskCard, {
      key: item.id, item, open: current === item.id, onToggle: () => setOpened(current === item.id ? '' : item.id),
      attempts: byItem(item), session: session.id, lang, learner, t, onSent: reload, onChanged: reload, goReview,
    })))),
    h(Section, { title: t('finish.title') }, h(FinishBar, { session, lang, t, onFinished, onAbandoned: reload })))
}

