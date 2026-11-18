/**
 * Foundations lessons: a tiny explanation, every item to hear (normal and slow) and repeat, the whole lesson as one
 * listen-and-repeat file, and marking it done. The same body is a task of today's session and a page of the Lessons view.
 */
import { read, upload, write } from './api.js'
import { Clip, PlayButton, clipUrl, play, useStopOnUnmount } from './player.js'
import { closeStream, reasonOf, recordingBlocker, startRecording } from './recorder.js'
import { Btn, Empty, Glyph, h, K, P, Problem, React, Section, useCallback, useEffect, useRef, useState } from './ui.js'

/** What to show for an item: its text (both words of a minimal pair). */
const shown = item => item.pair ? item.pair.join(' / ') : (item.show ?? item.say)

/** Recording a repeat of some of a lesson's items: one at a time, sent when stopped, analysed in a job. */
function useRepeat({ lang, lesson, session, item, onSent, t }) {
  const [active, setActive] = useState(null)
  const [sending, setSending] = useState(false)
  const [level, setLevel] = useState(0)
  const [problem, setProblem] = useState(null)
  const recording = useRef(null)
  const began = useRef(0)
  const blocker = recordingBlocker()

  const cancel = useCallback(() => { recording.current?.cancel(); recording.current = null; setActive(null) }, [])
  useEffect(() => cancel, [cancel])

  const finish = async items => {
    const current = recording.current
    if (!current) return
    recording.current = null
    setActive(null)
    setSending(true)
    try {
      const blob = await current.stop()
      if (!blob || blob.size === 0) throw new Error(t('record.failed'))
      const minutes = Math.max(0.1, Math.round((performance.now() - began.current) / 6000) / 10)
      await upload(blob, { lang, session, item, lesson, lesson_items: items.join(','), minutes })
      onSent()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setSending(false)
    }
  }

  const toggle = async items => {
    setProblem(null)
    if (active) { await finish(active); return }
    try {
      recording.current = await startRecording({ onLevel: setLevel })
      began.current = performance.now()
      setActive(items)
    } catch (error) {
      setProblem(t(`record.${reasonOf(error)}`))
    }
  }
  return { active, sending, level, problem, blocker, toggle }
}

function RepeatButton({ repeat, items, label, big = false, t }) {
  const mine = repeat.active && repeat.active.join(',') === items.join(',')
  const other = repeat.active && !mine
  return h(Btn, {
    variant: mine ? 'primary' : big ? 'primary' : 'outline', size: big ? 'md' : 'sm', className: mine ? 'pr-stop' : undefined,
    disabled: repeat.blocker !== null || repeat.sending || other, onClick: () => repeat.toggle(items), 'aria-pressed': Boolean(mine),
  }, mine ? h(Glyph.stop, { size: 14 }) : h(Glyph.mic, { size: 14 }), mine ? t('lesson.stop') : label)
}

function RepeatResult({ attempt, t }) {
  const repeat = attempt.repeat
  const failed = attempt.status === 'failed'
  const working = attempt.status === 'pending'
  return h('li', { className: 'pr-repeat', 'data-state': failed ? 'failed' : working ? 'working' : 'ok' },
    h('div', { className: 'pr-repeatHead' },
      h('span', { className: 'pr-meta' }, h(K.TimeAgo, { at: attempt.created }), attempt.items?.length ? ` · ${t('lesson.itemsRepeated', { items: attempt.items.join(', ') })}` : ''),
      working && h(P.Tag, { tone: 'info' }, t('lesson.analysing')),
      failed && h(P.Tag, { tone: 'warning' }, t('attempt.state.failed')),
      repeat && h(P.Tag, { tone: 'quiet' }, t('lesson.matched', { matched: repeat.matched ?? 0, total: repeat.words_in_reference ?? 0 }))),
    working && h('div', { className: 'pr-indeterminate', 'aria-hidden': true }, h('span')),
    repeat?.flagged?.length > 0 && h('ul', { className: 'pr-flagged' }, repeat.flagged.slice(0, 5).map(word =>
      h('li', { key: word.word }, h('strong', null, word.word), ' ', t('lesson.flagged', { expected: word.expected ?? '', heard: word.heard ?? '' })))),
    (repeat || failed) && h('p', { className: 'pr-note' }, t(failed ? 'lesson.failedNote' : 'lesson.lowReliability')))
}

/** The whole lesson as one file: made on first use, then played. */
function ListenAll({ lang, lesson, t }) {
  const [state, setState] = useState('idle')
  const [problem, setProblem] = useState(null)
  const handle = useStopOnUnmount()
  const press = async () => {
    if (state === 'playing') { handle.current?.stop(); return }
    setState('loading')
    setProblem(null)
    try {
      const { file } = await read('lesson/listen', { lang, id: lesson.id })
      const started = play(clipUrl(lang, file))
      handle.current = started
      setState('playing')
      started.ended.then(() => setState('idle'))
    } catch (error) {
      setProblem(error.message)
      setState('idle')
    }
  }
  return h(React.Fragment, null,
    h(Btn, { variant: 'primary', size: 'md', onClick: press, disabled: state === 'loading', 'aria-pressed': state === 'playing' },
      state === 'playing' ? h(Glyph.stop, { size: 14 }) : h(Glyph.speaker, { size: 16 }), t(state === 'loading' ? 'lesson.making' : state === 'playing' ? 'lesson.stop' : 'lesson.playAll')),
    h(Problem, null, problem))
}

/**
 * @param {object} o
 * @param {object} o.lesson - `lesson show`
 * @param {string | undefined} o.session - the open session, when this lesson is one of its items
 * @param {string | undefined} o.item - that plan item's id
 * @param {object[]} o.jobs - the recordings under analysis for this language
 * @param {() => void} o.onChanged
 */
export function LessonBody({ lang, lesson, session, item, t, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [finished, setFinished] = useState(null)
  const repeat = useRepeat({ lang, lesson: lesson.id, session, item, onSent: onChanged, t })
  useEffect(() => setFinished(null), [lesson.id])
  const allItems = lesson.items.map(entry => entry.id)
  const ready = lesson.audio_status?.status === 'ok' || lesson.items.some(entry => entry.audio.some(clip => clip.file))

  const done = async () => {
    setBusy(true)
    setProblem(null)
    try {
      setFinished(await write('lesson/done', { lang, lesson: lesson.id, session }))
      onChanged()
    } catch (error) {
      setProblem(error.message)
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'pr-lesson' },
    h('div', { className: 'pr-lessonHead' },
      h('h3', null, lesson.title),
      h(K.Chip, { icon: 'timer', tone: 'muted' }, t('minutes', { n: lesson.minutes }))),
    h('p', { className: 'pr-promptText pr-explain' }, lesson.explain),
    !ready && h('p', { className: 'pr-note', role: 'status' }, t('lesson.noAudio')),
    h('div', { className: 'pr-controls' },
      ready && h(ListenAll, { lang, lesson, t }),
      h(RepeatButton, { repeat, items: allItems, label: t('lesson.repeatAll'), big: true, t })),
    repeat.active && h('div', { className: 'pr-level', role: 'img', 'aria-label': t('record.level') }, h('span', { style: { transform: `scaleX(${repeat.level})` } })),
    repeat.sending && h('p', { className: 'pr-note', role: 'status' }, t('record.sending')),
    repeat.blocker && h('p', { className: 'pr-note', role: 'status' }, t(`record.${repeat.blocker}`)),
    h(Problem, null, repeat.problem),
    h('ul', { className: 'pr-lessonItems' }, lesson.items.map(entry => h('li', { key: entry.id, className: 'pr-lessonItem' },
      h('span', { className: 'pr-itemText' },
        h('span', { className: 'pr-itemShow', lang }, shown(entry)),
        entry.gloss && h('span', { className: 'pr-itemGloss' }, entry.gloss),
        entry.hint && h('span', { className: 'pr-note' }, entry.hint)),
      h('span', { className: 'pr-itemActions' },
        entry.pair
          ? entry.audio.map(clip => h(PlayButton, { key: clip.text, lang, file: clip.file, text: clip.text, label: clip.text }))
          : entry.audio.map(clip => h(Clip, { key: clip.text, lang, audio: clip, t })),
        h(RepeatButton, { repeat, items: [entry.id], label: t('lesson.say'), t }))))),
    lesson.attempts?.length > 0 && h('div', { className: 'pr-repeats' },
      h('h4', null, t('lesson.howItSounded')),
      h('ul', { className: 'pr-repeatList' }, [...lesson.attempts].reverse().map(attempt => h(RepeatResult, { key: attempt.id, attempt, t })))),
    h('div', { className: 'pr-controls' },
      h(Btn, { variant: lesson.times_done > 0 || finished ? 'outline' : 'primary', size: 'md', onClick: done, disabled: busy }, h(Glyph.check, { size: 14 }), t(lesson.times_done > 0 ? 'lesson.doneAgain' : 'lesson.done')),
      finished && h(K.Chip, { icon: 'circle-check', tone: 'ok' }, t('lesson.finished', { n: finished.cards_added })),
      lesson.cards > 0 && !finished && h('span', { className: 'pr-note' }, t('lesson.cardsNote', { n: lesson.cards }))),
    h(Problem, null, problem))
}

/** One lesson of the open session, read when its card is opened. */
export function LessonPanel({ item, session, lang, t, onSent }) {
  const [lesson, setLesson] = useState(null)
  const [problem, setProblem] = useState(null)
  const [stamp, setStamp] = useState(0)
  useEffect(() => {
    let live = true
    read('lesson', { lang, id: item.lesson }).then(body => { if (live) { setLesson(body); setProblem(null) } }, error => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [lang, item.lesson, stamp])
  if (!lesson) return problem ? h(Problem, null, problem) : h('p', { className: 'pr-empty', role: 'status' }, t('loading'))
  return h(LessonBody, { lang, lesson, session, item: item.id, t, onChanged: () => { setStamp(value => value + 1); onSent() } })
}

/** The Lessons view: every lesson by unit with what is done; the next one is open. */
export function Lessons({ lang, version, t }) {
  const [list, setList] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    let live = true
    read('lessons', { lang }).then(body => { if (live) { setList(body); setProblem(null) } }, error => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [lang, version])

  const target = openId ?? list?.status?.next_lesson ?? list?.lessons?.[0]?.id ?? null
  useEffect(() => {
    if (!target) return undefined
    let live = true
    read('lesson', { lang, id: target }).then(body => { if (live) setLesson(body) }, error => { if (live) setProblem(error.message) })
    return () => { live = false }
  }, [lang, target, version])

  if (!list) return problem ? h(Problem, null, problem) : h('p', { className: 'pr-empty', role: 'status' }, t('loading'))
  if (list.lessons.length === 0) return h(Empty, { icon: 'graduation-cap', title: t('lesson.none') }, t('lesson.noneNote'))
  const units = list.status?.units ?? []
  const titleOf = unit => units.find(entry => entry.id === unit)?.title ?? unit
  const order = [...new Set(list.lessons.map(entry => entry.unit))]
  const body = lesson && lesson.id === target && h(Section, null, h(LessonBody, { lang, lesson, t, onChanged: () => setOpenId(target) }))
  return h('div', { className: 'pr-lessons' },
    h(Problem, null, problem),
    body,
    h(Section, { title: t('lesson.title'), aside: list.status && h(K.Chip, { icon: 'graduation-cap', tone: list.status.complete ? 'ok' : 'muted' }, t('status.lessons', { done: list.status.lessons_done, total: list.status.lessons_total })) },
      h('div', { className: 'pr-units' }, order.map(unit => {
        const rows = list.lessons.filter(entry => entry.unit === unit)
        return h('div', { key: unit, className: 'pr-unit' },
          h('h3', null, titleOf(unit), h('span', { className: 'pr-meta' }, ` ${rows.filter(row => row.done).length}/${rows.length}`)),
          h('ul', { className: 'pr-lessonList' }, rows.map(row => h('li', { key: row.id },
            h('button', { type: 'button', className: `pr-lessonRow ${K.TOUCH}`, 'data-current': row.id === target ? 'true' : undefined, 'aria-current': row.id === target ? 'true' : undefined, onClick: () => { setOpenId(row.id); setLesson(null); document.querySelector('.pr-scroll')?.scrollTo({ top: 0 }) } },
              h('span', { className: 'pr-lessonRowTitle' }, row.title),
              h('span', { className: 'pr-meta' }, t('minutes', { n: row.minutes })),
              row.done ? h(P.Tag, { tone: 'success' }, h(Glyph.check, { size: 12 }), ` ${t('item.done')}`) : null)))))
      }))),
  )
}
