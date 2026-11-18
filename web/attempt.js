/** One recorded or written answer: what was sent, how its analysis is going, what came out, and the way to ask the tutor about it. */
import { write, url } from './api.js'
import { SPEAKING_SIGNALS, metricText, short, when } from './format.js'
import { ask, Btn, canAsk, Glyph, h, K, P, Problem, React, SkillTile, useState } from './ui.js'


/** How an attempt stands: what the card says and which tone it gets. */
export function stateOf(attempt) {
  if (attempt.analysing === 'running') return { id: 'analysing', tone: 'accent' }
  if (attempt.analysing === 'interrupted') return { id: 'interrupted', tone: 'warn' }
  if (attempt.speech?.status === 'failed') return { id: 'failed', tone: 'warn' }
  if (attempt.kind === 'voice' && attempt.speech?.status === 'skipped') return { id: 'skipped', tone: 'muted' }
  return { id: 'done', tone: 'ok' }
}

function Signals({ metrics, t }) {
  const shown = SPEAKING_SIGNALS.filter(name => Number.isFinite(metrics?.[name]))
  if (shown.length === 0) return null
  return h('dl', { className: 'pr-signals' }, shown.map(name => h('div', { key: name, className: 'pr-signal' },
    h('dt', null, t(`metric.${name}`)),
    h('dd', null, metricText(name, metrics[name])))))
}

function Analysing({ attempt, t }) {
  const now = K.useNow(1000)
  const started = when(attempt.created)
  const seconds = started ? Math.max(0, Math.floor((now - started.getTime()) / 1000)) : 0
  return h('div', { className: 'pr-working', role: 'status' },
    h('div', { className: 'pr-indeterminate', 'aria-hidden': true }, h('span')),
    h('p', null, t('attempt.analysing', { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` })),
    h('p', { className: 'pr-note' }, t('attempt.analysingNote')))
}

/**
 * @param {object} o
 * @param {object} o.attempt - `attempt show` plus `analysing`
 * @param {string} o.title - the task's name
 * @param {string} o.lang
 * @param {string} o.learner
 * @param {(key: string, params?: object) => string} o.t
 * @param {() => void} [o.onChanged] - after an action that changes data
 */
export function AttemptCard({ attempt, title, lang, learner, t, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const state = stateOf(attempt)
  const created = when(attempt.created)
  const voice = attempt.kind === 'voice'

  const retry = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await write('attempt/analyze', { lang, attempt: attempt.id })
      onChanged?.()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }

  const askAbout = () => ask({
    title: t('ask.attemptTitle', { task: title }),
    lines: [attempt.speech_summary?.split('\n')[0], attempt.metrics?.words ? t('attempt.words', { n: attempt.metrics.words }) : null],
    context: { learner, lang, attempt: attempt.id, session: attempt.session },
  }, t(attempt.feedback ? 'ask.attemptMore' : 'ask.attemptFeedback'))

  return h('article', { className: 'pr-attempt', 'data-state': state.id },
    h('header', { className: 'pr-attemptHead' },
      h(SkillTile, { skill: attempt.skill, size: 'sm' }),
      h('div', { className: 'pr-attemptTitle' },
        h('strong', null, title),
        h('span', { className: 'pr-meta' }, [created && h(K.TimeAgo, { key: 't', at: attempt.created }), attempt.minutes ? t('minutes', { n: short(attempt.minutes) }) : null].filter(Boolean).flatMap((part, i) => (i ? [' · ', part] : [part])))),
      h(P.Tag, { tone: { ok: 'success', accent: 'info', warn: 'warning', muted: 'quiet' }[state.tone] }, t(`attempt.state.${state.id}`))),
    state.id === 'analysing' && h(Analysing, { attempt, t }),
    state.id === 'interrupted' && h('div', { className: 'pr-working' }, h('p', null, t('attempt.interrupted')), h(Btn, { variant: 'outline', onClick: retry, disabled: busy }, t('attempt.retry'))),
    state.id === 'failed' && h('div', { className: 'pr-working' },
      h('p', null, t('attempt.failed')),
      attempt.speech?.error && h('p', { className: 'pr-note' }, attempt.speech.error),
      h(Btn, { variant: 'outline', onClick: retry, disabled: busy }, t('attempt.retry'))),
    voice && state.id === 'done' && h(Signals, { metrics: attempt.metrics, t }),
    voice && attempt.audio_file && h('audio', { className: 'pr-audio', controls: true, preload: 'none', src: url('attempt/clip', { lang, id: attempt.id }), 'aria-label': t('attempt.listen') }),
    !voice && attempt.kind === 'text' && h('p', { className: 'pr-note' }, attempt.word_count != null ? t('attempt.words', { n: attempt.word_count }) : null),
    attempt.kind === 'objective' && attempt.objective && h('p', { className: 'pr-note' }, t('attempt.objective', { correct: attempt.objective.correct, total: attempt.objective.total })),
    attempt.speech?.warnings?.length > 0 && h('p', { className: 'pr-note' }, attempt.speech.warnings.join(' · ')),
    attempt.answer_text && h('details', { className: 'pr-details' }, h('summary', null, t(voice ? 'attempt.transcript' : 'attempt.answer')), h('p', { className: 'pr-text' }, attempt.answer_text)),
    voice && attempt.speech_summary && h('details', { className: 'pr-details' }, h('summary', null, t('attempt.summary')), h('p', { className: 'pr-text' }, attempt.speech_summary)),
    attempt.feedback && h('div', { className: 'pr-feedback' }, h('h3', null, t('attempt.feedback')), h('p', { className: 'pr-text' }, attempt.feedback)),
    h(Problem, null, problem),
    canAsk() && h('footer', { className: 'pr-attemptFoot' },
      h(Btn, { variant: 'ghost', onClick: askAbout }, h(Glyph.chat, { size: 14 }), t(attempt.feedback ? 'ask.more' : 'ask.feedback'))))
}

