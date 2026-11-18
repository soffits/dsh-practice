/*
 * Browser half of dsh-practice: the Practice entry in the sidebar and its page in the main column.
 * The page itself (today's plan, the recorder, review, progress) lives in browser modules the Host
 * half serves under /api/practice/web/ (page.js and what it imports), loaded when the page first
 * opens; its words come from the plugin's locale/ folder.
 *
 * Plain JavaScript in DSH's Client module format (no build step); React and DSH's components come
 * from the page's module table. A link with ?practice=today|review|progress opens the panel on that view.
 */
window.__ModuleLoader__.load({
  id: '@soffits/dsh-practice',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const { useState, useEffect } = React

    const NS = 'dsh-practice'
    const PANEL = 'dsh-practice'
    const LINK = 'practice'
    const STYLE_ID = 'dsh-practice-style'
    const SOURCE = '@soffits/dsh-practice'
    const web = name => new URL(`api/practice/web/${name}`, document.baseURI).href

    /** DSH's locale store, set in apply before anything renders, so the page renders again when the viewer switches language. */
    let localeStore
    const subscribeLocale = listener => localeStore.subscribe(listener)
    const activeLanguage = () => localeStore.getSnapshot().active

    /** The kit and the actions service arrive through the client's service injection; the page waits for the kit. */
    let kit = null
    let actions = null
    let sourceName = () => ''
    let ui = null
    const listeners = new Set()
    const changed = () => { for (const listener of listeners) listener() }
    const subscribe = listener => { listeners.add(listener); return () => { listeners.delete(listener) } }
    const kitNow = () => kit

    let modules
    /** The page's modules, loaded once and handed this page's React, DSH's components and the kit. */
    const load = () => {
      modules ??= Promise.all([import(web('ui.js')), import(web('page.js'))]).then(([uiModule, page]) => {
        ui = uiModule
        ui.init(React, { primitives, kit })
        ui.setActions(actions, () => sourceName())
        return page
      })
      return modules
    }

    let linkedView = null
    const takeLink = () => {
      const params = new URLSearchParams(location.search)
      const value = params.get(LINK)
      if (value === null) return
      linkedView = value
      params.delete(LINK)
      const query = params.toString()
      history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
    }

    function PracticePage({ translate }) {
      const language = React.useSyncExternalStore(subscribeLocale, activeLanguage)
      const t = React.useMemo(() => Object.assign((...args) => translate(...args), { language }), [translate, language])
      const ready = React.useSyncExternalStore(subscribe, kitNow) !== null
      const [page, setPage] = useState(null)
      const [error, setError] = useState(null)
      const [initialView] = useState(() => { const view = linkedView; linkedView = null; return view })
      useEffect(() => {
        if (!ready) return undefined
        let live = true
        load().then(module => { if (live) setPage(module) }, reason => { modules = undefined; if (live) setError(reason.message) })
        return () => { live = false }
      }, [ready])
      return h('div', { className: 'pr-root' },
        page !== null && h(page.Page, { t, initialView }),
        error && h('p', { className: 'pr-error', role: 'alert', style: { padding: 24 } }, error))
    }

    function SidebarIcon({ size }) {
      const current = React.useSyncExternalStore(subscribe, kitNow)
      return current === null ? null : h(current.Icon, { name: 'graduation-cap', size })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeStore = ctx.locale
        const t = ctx.locale.bind(NS)
        sourceName = () => t('panel')

        ctx.inject(['uiKit'], scope => {
          scope.effect(() => {
            kit = scope.uiKit
            changed()
            return () => { kit = null; changed() }
          }, 'practice: kit')
        })
        ctx.inject(['uiActions'], scope => {
          scope.effect(() => {
            actions = scope.uiActions
            ui?.setActions(actions, () => sourceName())
            const off = actions.registerSource({ id: SOURCE, name: () => sourceName(), icon: SidebarIcon })
            return () => { off(); actions = null; ui?.setActions(null, () => sourceName()) }
          }, 'practice: ask')
        })

        // The words register first, so neither the entry nor the page ever shows a bare key.
        ctx.effect(() => {
          let live = true
          let disposers = []
          fetch(new URL('api/practice/words', document.baseURI))
            .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then(({ tables }) => { if (live) disposers = Object.entries(tables).map(([tag, table]) => ctx.locale.register(NS, tag, table)) })
            .catch(error => console.warn('[practice] words unavailable: %s', error.message))
          return () => { live = false; for (const dispose of disposers) dispose() }
        }, 'practice: dictionaries')

        ctx.effect(() => {
          if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return () => {}
          const tag = document.createElement('link')
          tag.id = STYLE_ID
          tag.rel = 'stylesheet'
          tag.href = web('panel.css')
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'practice: styles')

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => ({ translate: t }) }, PracticePage))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 13, locale: NS, label: () => t('panel') }, SidebarIcon))

        // A link to a view opens this panel once it is registered.
        ctx.effect(() => {
          takeLink()
          if (linkedView === null) return () => {}
          let tries = 0
          const timer = setInterval(() => {
            const layout = ctx.get('layout')
            try {
              layout?.selectPanel(PANEL)
              if (layout) clearInterval(timer)
            } catch {
              // The main slot entry is not registered yet.
            }
            if (++tries > 50) clearInterval(timer)
          }, 100)
          return () => clearInterval(timer)
        }, 'practice: link')
      },
    }
  },
})
