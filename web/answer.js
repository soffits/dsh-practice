/** Answers that are not spoken: an essay or email typed here, and a score for a reading or listening set done elsewhere. */
import { write } from './api.js'
import { countUnits } from './format.js'
import { Prompt } from './speaking.js'
import { ask, Btn, canAsk, Glyph, h, K, Problem, React, useEffect, useRef, useState } from './ui.js'

const draftKey = (session, item) => `dsh-practice:draft:${session}:${item}`

function useDraft(session, item) {
  const key = draftKey(session, item)
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(key) ?? '' } catch { return '' } })
  useEffect(() => { try { text ? sessionStorage.setItem(key, text) : sessionStorage.removeItem(key) } catch { /* private mode */ } }, [key, text])
  return [text, setText]
}

export function WritingPanel({ item, session, lang, learner, t, onSent }) {
  const [text, setText] = useDraft(session, item.id)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const began = useRef(null)
  const words = countUnits(text)
  const range = item.variant === 'mini' ? null : item.words
  const within = !range ? null : words >= range.min && words <= range.max
  const tone = within === null || words === 0 ? 'muted' : within ? 'ok' : words < range.min ? 'warn' : 'warn'

  const send = async () => {
    setBusy(true)
    setProblem(null)
    const minutes = began.current ? Math.max(0.1, Math.round((performance.now() - began.current) / 6000) / 10) : undefined
    try {
      await write('attempt/text', { lang, session, item: item.id, task: item.task, variant: item.variant, text, minutes })
      setText('')
      began.current = null
      onSent()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'pr-write' },
    h(Prompt, { item, t, learner, lang, session }),
    h('textarea', {
      className: 'pr-textarea', value: text, rows: 10, spellCheck: true, 'aria-label': t('write.label'), placeholder: t('write.placeholder'),
      onChange: event => { began.current ??= performance.now(); setText(event.target.value) },
    }),
    h('div', { className: 'pr-writeFoot' },
      h(K.Chip, { tone }, range ? t('write.count', { n: words, min: range.min, max: range.max }) : t('write.countPlain', { n: words })),
      h(Btn, { variant: 'primary', size: 'md', onClick: send, disabled: busy || text.trim() === '' }, h(Glyph.send, { size: 14 }), t(busy ? 'write.sending' : 'write.send'))),
    h(Problem, null, problem))
}

export function ObjectivePanel({ item, session, lang, learner, t, onSent }) {
  const [correct, setCorrect] = useState('')
  const [total, setTotal] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const ready = correct !== '' && total !== '' && Number(correct) >= 0 && Number(total) > 0 && Number(correct) <= Number(total)

  const askSet = () => ask({
    title: t('ask.setTitle', { task: item.name }),
    lines: [item.hint],
    context: { learner, lang, session, item: item.id, task: item.task },
  }, t('ask.setWrite', { task: item.name }))

  const save = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await write('attempt/objective', { lang, session, item: item.id, task: item.task, variant: item.variant, correct: Number(correct), total: Number(total), minutes: item.minutes })
      setCorrect('')
      setTotal('')
      onSent()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'pr-objective' },
    h('p', null, t('task.objectiveIntro')),
    item.hint && h('p', { className: 'pr-note' }, item.hint),
    canAsk() && h('div', { className: 'pr-controls' }, h(Btn, { variant: 'outline', onClick: askSet }, h(Glyph.chat, { size: 14 }), t('task.askSet'))),
    h('div', { className: 'pr-scoreRow' },
      h('label', null, h('span', null, t('task.correct')), h('input', { type: 'number', inputMode: 'numeric', min: 0, value: correct, onChange: event => setCorrect(event.target.value) })),
      h('span', { className: 'pr-of' }, t('task.of')),
      h('label', null, h('span', null, t('task.total')), h('input', { type: 'number', inputMode: 'numeric', min: 1, value: total, onChange: event => setTotal(event.target.value) })),
      h(Btn, { variant: 'primary', size: 'md', onClick: save, disabled: busy || !ready }, t('task.saveResult'))),
    h(Problem, null, problem))
}

/** A review block points at the Review tab; any other kind of item is something to do with the tutor. */
export function OtherPanel({ item, learner, lang, session, t, goReview }) {
  const askHelp = () => ask({ title: t('ask.otherTitle', { task: item.name ?? item.kind }), lines: [item.hint], context: { learner, lang, session, item: item.id } }, t('ask.otherWrite'))
  return h('div', { className: 'pr-other' },
    item.hint && h('p', null, item.hint),
    h('div', { className: 'pr-controls' },
      item.kind === 'review' && h(Btn, { variant: 'primary', size: 'md', onClick: goReview }, t('task.goReview')),
      item.kind !== 'review' && canAsk() && h(Btn, { variant: 'outline', onClick: askHelp }, h(Glyph.chat, { size: 14 }), t('task.askHelp'))))
}

