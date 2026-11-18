/** One plan item of the open session: its header and, when opened, the panel that fits how it is answered. */
import { AttemptCard } from './attempt.js'
import { ObjectivePanel, OtherPanel, WritingPanel } from './answer.js'
import { SpeakingPanel } from './speaking.js'
import { Glyph, P, SkillTile, h, K } from './ui.js'

/** The panel for an item by how it is answered. */
function Panel(props) {
  const { item } = props
  if (item.kind === 'task' && item.answer === 'voice') return h(SpeakingPanel, props)
  if (item.kind === 'task' && item.answer === 'text') return h(WritingPanel, props)
  if (item.kind === 'task' && item.answer === 'objective') return h(ObjectivePanel, props)
  return h(OtherPanel, props)
}

export const itemTitle = (item, t) => item.name ?? (item.kind === 'review' ? t('item.review') : item.kind === 'drill' ? t('item.drill') : item.task ?? item.kind)
export const itemSkill = item => item.skill ?? (item.kind === 'review' ? 'review' : null)

/**
 * @param {object} o
 * @param {object} o.item - a plan item with `state` and `attempts`
 * @param {boolean} o.open
 * @param {() => void} o.onToggle
 * @param {object[]} o.attempts - the attempts of this item
 */
export function TaskCard({ item, open, onToggle, attempts, session, lang, learner, t, onSent, onChanged, goReview, names }) {
  const done = item.state === 'done'
  const title = itemTitle(item, t)
  return h('section', { className: 'pr-task', 'data-open': open ? 'true' : undefined, 'data-done': done ? 'true' : undefined },
    h('button', { type: 'button', className: `pr-taskHead ${K.TOUCH}`, onClick: onToggle, 'aria-expanded': open },
      h(SkillTile, { skill: itemSkill(item), size: 'sm' }),
      h('span', { className: 'pr-taskTitle' },
        h('strong', null, title),
        h('span', { className: 'pr-meta' }, [item.minutes ? t('minutes', { n: item.minutes }) : null, item.variant === 'mini' ? t('item.mini') : null, t(`skill.${itemSkill(item) ?? 'other'}`)].filter(Boolean).join(' · '))),
      done ? h(P.Tag, { tone: 'success' }, h(Glyph.check, { size: 12 }), ` ${t('item.done')}`) : h(P.Tag, { tone: 'quiet' }, t('item.todo')),
      h('span', { className: 'pr-chevron', 'aria-hidden': true }, open ? '▾' : '▸')),
    open && h('div', { className: 'pr-taskBody' },
      h(Panel, { item, session, lang, learner, t, onSent, goReview }),
      attempts.length > 0 && h('div', { className: 'pr-attempts' }, attempts.map(attempt => h(AttemptCard, { key: attempt.id, attempt, title, lang, learner, t, onChanged })))),
    !open && attempts.length > 0 && h('div', { className: 'pr-attempts pr-attemptsClosed' }, attempts.map(attempt => h(AttemptCard, { key: attempt.id, attempt, title, lang, learner, t, onChanged }))))
}
