/**
 * Answering a speaking task aloud: the prompt, the preparation and response timers from the task's
 * format, the recorder, a listen-back, and sending the clip to be analysed.
 *
 * idle -> (prep) -> recording -> recorded -> sending -> idle. A browser that cannot record here
 * (a plain http page, no microphone API, an old browser) still lets the person choose an audio file.
 */
import { upload } from './api.js'
import { clock } from './format.js'
import { closeStream, openMicrophone, reasonOf, recordingBlocker, startRecording } from './recorder.js'
import { ask, Btn, canAsk, Glyph, h, K, Problem, React, useCallback, useEffect, useRef, useState } from './ui.js'

const TICK_MS = 200

/** A countdown over `seconds` that calls `onZero` once; returns the seconds left and the seconds spent. */
function useTimer(running, seconds, onZero) {
  const [spent, setSpent] = useState(0)
  const zero = useRef(onZero)
  zero.current = onZero
  useEffect(() => {
    if (!running) { setSpent(0); return undefined }
    const began = performance.now()
    let fired = false
    const timer = setInterval(() => {
      const elapsed = (performance.now() - began) / 1000
      setSpent(elapsed)
      if (seconds && elapsed >= seconds && !fired) { fired = true; clearInterval(timer); zero.current() }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [running, seconds])
  return { spent, left: seconds ? Math.max(0, seconds - spent) : null }
}

function Dial({ left, total, tone, label, children }) {
  return h('div', { className: 'pr-dial' },
    h(K.Ring, { value: total ? left : 0, max: total || 1, size: 132, tone }, h('span', { className: 'pr-dialTime' }, children)),
    h('span', { className: 'pr-dialLabel' }, label))
}

export function Prompt({ item, t, learner, lang, session }) {
  const askPrompt = () => ask({
    title: t('ask.promptTitle', { task: item.name }),
    lines: [item.hint],
    context: { learner, lang, session, item: item.id, task: item.task },
  }, t('ask.promptWrite', { task: item.name }))
  return h('div', { className: 'pr-prompt' },
    item.prompt
      ? h('p', { className: 'pr-promptText' }, item.prompt)
      : h('div', { className: 'pr-promptNone' },
        h('p', null, t('task.noPrompt')),
        canAsk() && h(Btn, { variant: 'outline', onClick: askPrompt }, h(Glyph.chat, { size: 14 }), t('task.askPrompt'))),
    item.hint && h('p', { className: 'pr-note' }, item.hint))
}

/**
 * @param {object} o
 * @param {object} o.item - a plan item: name, prompt, hint, prep_s, response_s, minutes, task, variant, id
 * @param {string} o.session
 * @param {string} o.lang
 * @param {(key: string, params?: object) => string} o.t
 * @param {() => void} o.onSent
 */
export function SpeakingPanel({ item, session, lang, learner, t, onSent }) {
  const [phase, setPhase] = useState('idle')
  const [problem, setProblem] = useState(null)
  const [level, setLevel] = useState(0)
  const [clip, setClip] = useState(null)
  const [progress, setProgress] = useState(0)
  const stream = useRef(null)
  const span = useRef({ from: 0, to: 0 })
  const recording = useRef(null)
  const blocker = recordingBlocker()
  const prep = item.prep_s ?? 0
  const limit = item.response_s ?? 0

  const clipUrl = React.useMemo(() => (clip ? URL.createObjectURL(clip.blob) : null), [clip])
  useEffect(() => () => { if (clipUrl) URL.revokeObjectURL(clipUrl) }, [clipUrl])
  useEffect(() => () => { closeStream(stream.current); recording.current?.cancel() }, [])

  const begin = useCallback(async () => {
    setProblem(null)
    try {
      recording.current = await startRecording({ stream: stream.current ?? undefined, onLevel: setLevel })
      stream.current = null
      setPhase('recording')
    } catch (error) {
      closeStream(stream.current)
      stream.current = null
      setProblem(t(`record.${reasonOf(error)}`))
      setPhase('idle')
    }
  }, [t])

  const finish = useCallback(async () => {
    const active = recording.current
    if (!active) return
    recording.current = null
    const blob = await active.stop().catch(() => null)
    span.current.to = performance.now()
    if (!blob || blob.size === 0) { setProblem(t('record.failed')); setPhase('idle'); return }
    setClip({ blob, name: null })
    setPhase('recorded')
  }, [t])

  const prepTimer = useTimer(phase === 'prep', prep, begin)
  const talkTimer = useTimer(phase === 'recording', limit, finish)

  const start = async () => {
    setProblem(null)
    try {
      stream.current = await openMicrophone()
    } catch (error) {
      setProblem(t(`record.${reasonOf(error)}`))
      return
    }
    span.current = { from: performance.now(), to: 0 }
    if (prep > 0) setPhase('prep')
    else await begin()
  }

  const cancel = () => {
    closeStream(stream.current)
    stream.current = null
    recording.current?.cancel()
    recording.current = null
    setPhase('idle')
  }

  const again = () => { setClip(null); setPhase('idle'); setProblem(null) }

  const chooseFile = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setClip({ blob: file, name: file.name })
    setPhase('recorded')
  }

  const send = async () => {
    setPhase('sending')
    setProgress(0)
    setProblem(null)
    const minutes = clip.name || !span.current.to ? undefined : Math.max(0.1, Math.round((span.current.to - span.current.from) / 6000) / 10)
    try {
      await upload(clip.blob, { lang, session, item: item.id, task: item.task, variant: item.variant, minutes }, setProgress)
      setClip(null)
      setPhase('idle')
      onSent()
    } catch (error) {
      setProblem(error.message)
      setPhase('recorded')
    }
  }

  const picker = h('label', { className: `pr-pick ${K.TOUCH}` }, h(Glyph.file, { size: 14 }), t('record.chooseFile'),
    h('input', { type: 'file', accept: 'audio/*', onChange: chooseFile, hidden: true }))

  return h('div', { className: 'pr-speak' },
    h(Prompt, { item, t, learner, lang, session }),
    h('div', { className: 'pr-timers' },
      prep > 0 && h(K.Chip, { icon: 'hourglass', tone: 'muted' }, t('task.prep', { time: clock(prep) })),
      limit > 0 && h(K.Chip, { icon: 'timer', tone: 'accent' }, t('task.response', { time: clock(limit) }))),
    phase === 'idle' && h('div', { className: 'pr-controls' },
      blocker === null
        ? h(Btn, { variant: 'primary', size: 'md', className: 'pr-big', onClick: start }, h(Glyph.mic, { size: 18 }), t(prep > 0 ? 'record.startPrep' : 'record.start'))
        : h('p', { className: 'pr-note', role: 'status' }, t(`record.${blocker}`)),
      picker),
    phase === 'prep' && h('div', { className: 'pr-live' },
      h(Dial, { left: prepTimer.left, total: prep, tone: 'warn', label: t('record.preparing') }, clock(prepTimer.left)),
      h('div', { className: 'pr-controls' },
        h(Btn, { variant: 'primary', size: 'md', onClick: begin }, h(Glyph.record, { size: 14 }), t('record.skipPrep')),
        h(Btn, { variant: 'ghost', onClick: cancel }, t('cancel')))),
    phase === 'recording' && h('div', { className: 'pr-live' },
      h(Dial, { left: talkTimer.left ?? 0, total: limit, tone: 'accent', label: t('record.recording') }, limit ? clock(talkTimer.left) : clock(talkTimer.spent)),
      h('div', { className: 'pr-level', role: 'img', 'aria-label': t('record.level') }, h('span', { style: { transform: `scaleX(${level})` } })),
      h('div', { className: 'pr-controls' },
        h(Btn, { variant: 'primary', size: 'md', className: 'pr-stop', onClick: finish }, h(Glyph.stop, { size: 14 }), t('record.stop')),
        h(Btn, { variant: 'ghost', onClick: cancel }, t('cancel')))),
    (phase === 'recorded' || phase === 'sending') && clip && h('div', { className: 'pr-playback' },
      clip.name && h('p', { className: 'pr-note' }, clip.name),
      h('audio', { controls: true, src: clipUrl, className: 'pr-audio', 'aria-label': t('record.listen') }),
      phase === 'sending' && h('div', { className: 'pr-uploadBar', role: 'progressbar', 'aria-valuenow': Math.round(progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: `${Math.round(progress * 100)}%` } })),
      h('div', { className: 'pr-controls' },
        h(Btn, { variant: 'primary', size: 'md', onClick: send, disabled: phase === 'sending' }, h(Glyph.send, { size: 14 }), t(phase === 'sending' ? 'record.sending' : 'record.send')),
        h(Btn, { variant: 'ghost', onClick: again, disabled: phase === 'sending' }, t('record.again')))),
    h(Problem, null, problem))
}
