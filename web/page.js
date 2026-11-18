/** The practice page: header, language and view switches, and the one state every view reads. It re-reads whenever the change stream says the data moved. */
import { read } from './api.js'
import { newestFirst } from './reads.js'
import { Today, Finished } from './today.js'
import { Lessons } from './lesson.js'
import { Review } from './review.js'
import { Progress } from './progress.js'
import { ask, Btn, canAsk, Empty, Glyph, h, K, P, Problem, React, useCallback, useEffect, useRef, useState } from './ui.js'

const LANG_KEY = 'dsh-practice:lang'
const VIEWS = ['today', 'lessons', 'review', 'progress']

const storedLang = () => { try { return localStorage.getItem(LANG_KEY) ?? undefined } catch { return undefined } }
const rememberLang = lang => { try { localStorage.setItem(LANG_KEY, lang) } catch { /* private mode */ } }

function NothingYet({ data, t }) {
  const setup = () => ask({ title: t('ask.setupTitle'), lines: [], context: { learner: data.learner?.id } }, t('ask.setupWrite'))
  return h(Empty, { icon: 'graduation-cap', title: t(data.learner ? 'empty.title' : 'empty.noLearnerTitle') },
    t(data.learner ? 'empty.note' : 'empty.noLearnerNote'),
    data.learner && canAsk() && h('div', { className: 'pr-controls pr-centered' }, h(Btn, { variant: 'primary', size: 'md', onClick: setup }, h(Glyph.chat, { size: 14 }), t('empty.ask'))))
}

/** @param {{ t: Function, initialView?: string }} props */
export function Page({ t, initialView }) {
  const [view, setView] = useState(VIEWS.includes(initialView) ? initialView : 'today')
  const [lang, setLang] = useState(storedLang)
  const [data, setData] = useState(null)
  const [problem, setProblem] = useState(null)
  const [version, setVersion] = useState(0)
  const [finished, setFinished] = useState(null)
  const bump = useCallback(() => setVersion(value => value + 1), [])
  const stream = K.useEventStream('api/practice/events', bump)
  useEffect(() => { if (stream === 'live') bump() }, [stream, bump])

  // Every read is shown as soon as it lands unless a newer one already was: the read on opening shows at once, and
  // the one the stream asks for when it connects (or after a change) only refreshes it. A read for a language the
  // page has since left is dropped. When the page asked for no language (or one not set up), it takes the one the
  // answer is for, and that answer already is the read for it.
  const reads = useRef(null)
  reads.current ??= newestFirst()
  const adopted = useRef(null)
  const langNow = useRef(lang)
  langNow.current = lang
  useEffect(() => {
    if (adopted.current !== null && adopted.current === lang) {
      adopted.current = null
      return
    }
    const ticket = reads.current.start()
    const fresh = () => lang === langNow.current && ticket.fresh()
    read('state', { lang }).then(body => {
      if (!fresh()) return
      ticket.show()
      setData(body)
      setProblem(null)
      if (body.lang && body.lang !== lang) {
        adopted.current = body.lang
        langNow.current = body.lang
        setLang(body.lang)
      }
    }, error => { if (fresh()) setProblem(error.message) })
  }, [lang, version])

  const choose = value => { rememberLang(value); setLang(value); setFinished(null) }
  const ready = data?.lang && data.learner?.exists
  const due = data?.status?.cards?.due_today ?? 0
  const shownViews = VIEWS.filter(id => id !== 'lessons' || data?.status?.foundations)
  const tabs = shownViews.map(id => ({
    value: id, id: `pr-tab-${id}`, panelId: 'pr-panel',
    label: h(React.Fragment, null, t(`view.${id}`), id === 'review' && due > 0 && h('span', { className: 'pr-tabCount' }, due)),
  }))

  return h('div', { className: 'pr-page' },
    h('div', { className: 'pr-head' },
      h('h1', null, t('title')),
      h('span', { className: 'pr-headLive' }, h(K.LiveStatus, { status: stream })),
      ready && data.languages.length > 1 && h('div', { className: 'pr-langs', role: 'group', 'aria-label': t('language') },
        data.languages.map(code => h(P.Pill, { key: code, active: code === data.lang, 'aria-pressed': code === data.lang, onClick: () => choose(code) }, code.toUpperCase()))),
      ready && h('div', { className: 'pr-tabs' }, h(P.SegmentedTabs, { items: tabs, value: view, label: t('views'), size: 'sm', onChange: setView }))),
    h('div', { className: 'pr-scroll', id: 'pr-panel' },
      h('div', { className: 'pr-content' },
        problem && h(Problem, null, t('error', { message: problem })),
        !data && !problem && h('p', { className: 'pr-empty', role: 'status' }, t('loading')),
        data && !ready && h(NothingYet, { data, t }),
        ready && view === 'today' && h(React.Fragment, null,
          finished && h(Finished, { session: finished, t, onClose: () => setFinished(null) }),
          h(Today, { data, t, reload: bump, goReview: () => setView('review'), onFinished: session => { setFinished(session); bump() } })),
        ready && view === 'lessons' && h(Lessons, { lang: data.lang, version, t }),
        ready && view === 'review' && h(Review, { lang: data.lang, session: data.session?.id ?? null, version, t }),
        ready && view === 'progress' && h(Progress, { lang: data.lang, learner: data.learner.id, version, t }))))
}
