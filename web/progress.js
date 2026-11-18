/** Progress: how practice has gone, per skill, in speaking signals, sound streaks, recurring errors and sessions. Trends compare a learner with herself; nothing here is a score. */
import { read } from './api.js'
import { AttemptCard } from './attempt.js'
import { TREND_SIGNALS, metricText, short, when } from './format.js'
import { Empty, h, K, P, Problem, React, Section, SkillTile, Stat, useEffect, useState } from './ui.js'

const SKILLS = ['speaking', 'writing', 'listening', 'reading']
const SKILL_METRICS = { speaking: TREND_SIGNALS, writing: ['words', 'errors_per_100_words'], listening: ['accuracy'], reading: ['accuracy'] }

function Trend({ name, metric, t }) {
  const values = (metric.series ?? []).map(point => point.value)
  const better = metric.better
  const improving = (metric.direction === 'up' && better === 'higher') || (metric.direction === 'down' && better === 'lower')
  return h('li', { className: 'pr-trend' },
    h('span', { className: 'pr-trendName' }, t(`metric.${name}`)),
    values.length >= 2 ? h(K.Spark, { values, tone: improving ? 'ok' : 'accent', height: 28, label: t(`metric.${name}`), area: true }) : h('span', { className: 'pr-trendGap' }),
    h('span', { className: 'pr-trendValue' }, metricText(name, metric.last ?? values.at(-1))),
    h('span', { className: 'pr-trendDir', 'data-tone': improving ? 'ok' : undefined }, t(`trend.${metric.direction ?? 'insufficient'}`)),
    metric.same_task?.previous_mean != null && h('span', { className: 'pr-note pr-trendSame' }, t('trend.sameTask', { value: metricText(name, metric.same_task.previous_mean) })))
}

function SkillCard({ skill, data, t }) {
  const metrics = SKILL_METRICS[skill].filter(name => data.metrics?.[name]?.series?.length > 0)
  const last = when(data.last_attempt)
  const estimate = data.estimates?.at(-1)
  return h('section', { className: 'pr-skill' },
    h('header', { className: 'pr-skillHead' },
      h(SkillTile, { skill, size: 'sm' }),
      h('div', null, h('strong', null, t(`skill.${skill}`)), h('span', { className: 'pr-meta' }, data.attempts ? t('progress.attempts', { n: data.attempts }) : t('progress.notYet'))),
      last && h('span', { className: 'pr-meta pr-skillLast' }, h(K.TimeAgo, { at: data.last_attempt }))),
    estimate && h('p', { className: 'pr-note' }, t('progress.estimate', { range: estimate.low === estimate.high ? short(estimate.low) : `${short(estimate.low)}–${short(estimate.high)}` })),
    metrics.length > 0
      ? h('ul', { className: 'pr-trends' }, metrics.map(name => h(Trend, { key: name, name, metric: data.metrics[name], t })))
      : data.attempts > 0 && h('p', { className: 'pr-note' }, t('progress.few')))
}

function Sounds({ sounds, t }) {
  if (!sounds?.length) return h('p', { className: 'pr-note' }, t('progress.noSounds'))
  return h('ul', { className: 'pr-sounds' }, sounds.map(sound => h('li', { key: `${sound.expected}${sound.heard}`, className: 'pr-sound' },
    h('span', { className: 'pr-ipa' }, `${sound.expected} → ${sound.heard}`),
    h('span', { className: 'pr-meta' }, t('progress.flagged', { n: sound.times_flagged })),
    h(K.Chip, { icon: 'circle-check', tone: sound.clean_streak > 0 ? 'ok' : 'muted' }, t('progress.streak', { n: sound.clean_streak })))))
}

function Recurring({ errors, t }) {
  const rows = errors?.recurring ?? []
  if (!rows.length) return h('p', { className: 'pr-note' }, t('progress.noErrors'))
  return h('ul', { className: 'pr-errors' }, rows.slice(0, 6).map(row => h('li', { key: row.pattern, className: 'pr-errorRow' },
    h('strong', null, row.pattern), h(K.Chip, { tone: 'muted' }, t('progress.times', { n: row.count })),
    row.examples?.[0] && h('span', { className: 'pr-note' }, [row.examples[0].wrong, row.examples[0].right].filter(Boolean).join(' → ')))))
}

export function Progress({ lang, learner, version, t }) {
  const [data, setData] = useState(null)
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    let live = true
    read('progress', { lang }).then(body => { if (live) { setData(body); setProblem(null) } }, error => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [lang, version])
  if (problem) return h(Problem, null, problem)
  if (!data) return h('p', { className: 'pr-empty', role: 'status' }, t('loading'))
  const { progress, facts, sessions, recent } = data
  if (!facts?.sessions_finished && !recent.length) return h(Empty, { icon: 'chart-line', title: t('progress.empty') }, t('progress.emptyNote'))
  const debt = progress.speaking_debt
  return h('div', { className: 'pr-progress' },
    h('div', { className: 'pr-stats' },
      h(Stat, { value: facts?.sessions_finished ?? 0, label: t('progress.sessions') }),
      h(Stat, { value: facts?.days_practised ?? 0, label: t('progress.days') }),
      h(Stat, { value: short(facts?.focused_minutes ?? 0, 0), label: t('progress.minutes') }),
      h(Stat, { value: `${progress.cards?.mature ?? 0}/${progress.cards?.total ?? 0}`, label: t('progress.cards') }),
      debt && h(Stat, { value: debt.voice_answers_last_14_days ?? 0, label: t('progress.voice14'), tone: debt.owed ? 'warn' : 'ok' })),
    h(Section, { title: t('progress.skills') }, h('div', { className: 'pr-skills' }, SKILLS.map(skill => h(SkillCard, { key: skill, skill, data: progress.skills?.[skill] ?? {}, t })))),
    h(Section, { title: t('progress.sounds'), aside: h('span', { className: 'pr-note' }, t('progress.soundsNote')) }, h(Sounds, { sounds: progress.sounds, t })),
    h(Section, { title: t('progress.errors') }, h(Recurring, { errors: progress.errors, t })),
    sessions.length > 0 && h(Section, { title: t('progress.recentSessions') }, h('ul', { className: 'pr-sessions' }, sessions.map(session => {
      const date = when(session.finished ?? session.started)
      return h('li', { key: session.id, className: 'pr-sessionRow' },
        h('span', null, date && h(K.TimeAgo, { at: session.finished ?? session.started })),
        h(P.Tag, { tone: session.status === 'finished' ? 'success' : 'quiet' }, t(`session.status.${session.status}`)),
        session.focused_minutes != null && h('span', { className: 'pr-meta' }, t('minutes', { n: short(session.focused_minutes) })),
        session.points != null && h('span', { className: 'pr-meta' }, t('finish.points', { n: short(session.points) })))
    }))),
    recent.length > 0 && h(Section, { title: t('progress.recentAttempts') }, h('div', { className: 'pr-attempts' }, recent.map(attempt => h(AttemptCard, { key: attempt.id, attempt, title: t(`skill.${attempt.skill}`), lang, learner, t })))))
}

