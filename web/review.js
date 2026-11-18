/** Due review cards, one at a time: see the prompt, say or type the answer, look, grade. */
import { read, write } from './api.js'
import { Btn, Empty, h, K, Problem, React, useEffect, useRef, useState } from './ui.js'

const RATINGS = ['again', 'hard', 'good', 'easy']

function Face({ card, revealed, t }) {
  return h('div', { className: 'pr-card' },
    h('div', { className: 'pr-cardMeta' }, card.category && h(K.Chip, { tone: 'muted' }, card.category), card.occurrences > 1 && h(K.Chip, { tone: 'warn' }, t('review.seen', { n: card.occurrences }))),
    h('p', { className: 'pr-cardPrompt' }, card.prompt),
    card.hint && h('p', { className: 'pr-note' }, card.hint),
    revealed && h('div', { className: 'pr-cardAnswer' },
      h('p', { className: 'pr-cardAnswerText' }, card.answer),
      card.full && card.full !== card.answer && h('p', { className: 'pr-note' }, card.full),
      card.you_wrote && h('p', { className: 'pr-note' }, t('review.youWrote', { text: card.you_wrote }))))
}

/**
 * @param {object} o
 * @param {string} o.lang
 * @param {string | null} o.session - the open session cards are graded into, if any
 * @param {number} o.version - bumps whenever the data changed; the queue is read again then
 */
export function Review({ lang, session, version, t }) {
  const [queue, setQueue] = useState(null)
  const [gone, setGone] = useState(() => new Set())
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [round, setRound] = useState({ done: 0, total: 0 })
  const field = useRef(null)

  useEffect(() => {
    let live = true
    read('review', { lang }).then(body => {
      if (!live) return
      setQueue(body)
      setGone(new Set())
      setRound(previous => (previous.done >= previous.total ? (body.due_total > 0 ? { done: 0, total: body.due_total } : previous) : { done: previous.done, total: previous.done + body.due_total }))
    }, error => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [lang, version])

  const cards = (queue?.cards ?? []).filter(card => !gone.has(card.id))
  const card = cards[0]

  const grade = async rating => {
    if (!card || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await write('review/grade', { lang, session: session ?? undefined, grades: [{ card: card.id, rating, answer: typed || undefined }] })
      setGone(previous => new Set(previous).add(card.id))
      setRound(previous => ({ ...previous, done: previous.done + 1 }))
      setRevealed(false)
      setTyped('')
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = event => {
      if (!card || event.target.closest?.('textarea, input:not([type=checkbox])') && event.key !== 'Enter') return
      if (!revealed && (event.key === ' ' || event.key === 'Enter') && !event.target.closest?.('button')) { event.preventDefault(); setRevealed(true) }
      else if (revealed && /^[1-4]$/.test(event.key)) grade(RATINGS[Number(event.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (queue === null) return problem ? h(Problem, null, problem) : h('p', { className: 'pr-empty', role: 'status' }, t('loading'))
  if (!card) {
    return h(Empty, { icon: 'circle-check', title: round.done > 0 ? t('review.finished', { n: round.done }) : t('review.none') }, t('review.noneNote'))
  }
  return h('div', { className: 'pr-review' },
    h('div', { className: 'pr-reviewHead' },
      h('span', { className: 'pr-meta' }, t('review.progress', { done: round.done, total: round.total })),
      h(K.Progress, { value: round.done, max: Math.max(1, round.total), tone: 'accent', label: t('review.progress', { done: round.done, total: round.total }) })),
    h(Face, { card, revealed, t }),
    !revealed && h('input', { ref: field, className: 'pr-input', value: typed, placeholder: t('review.typePlaceholder'), 'aria-label': t('review.typePlaceholder'), onChange: event => setTyped(event.target.value), onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); setRevealed(true) } } }),
    !revealed && h('div', { className: 'pr-controls' }, h(Btn, { variant: 'primary', size: 'md', onClick: () => setRevealed(true) }, t('review.show'))),
    revealed && h('div', { className: 'pr-rate', role: 'group', 'aria-label': t('review.rate') },
      RATINGS.map((rating, i) => h(Btn, { key: rating, variant: rating === 'good' ? 'primary' : 'outline', size: 'md', disabled: busy, className: `pr-rateBtn pr-rate-${rating}`, onClick: () => grade(rating) },
        h('span', null, t(`review.${rating}`)), h('kbd', null, i + 1)))),
    h(Problem, null, problem))
}
