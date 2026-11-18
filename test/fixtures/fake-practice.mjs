#!/usr/bin/env node
// A stand-in for the `practice` command: logs its arguments and answers canned JSON, so tests need no real tool.
// FAKE_PRACTICE_LOG: file to append each call's argv to. FAKE_PRACTICE_SLEEP_MS: delay for attempt add/analyze.
// FAKE_PRACTICE_FAIL: a message; every call fails with it. FAKE_PRACTICE_TOUCH: a file to write when attempt add runs.
import { appendFileSync, writeFileSync } from 'node:fs'
const argv = process.argv.slice(2)
if (process.env.FAKE_PRACTICE_LOG) appendFileSync(process.env.FAKE_PRACTICE_LOG, `${JSON.stringify({ argv, cwd: process.cwd(), root: process.env.PRACTICE_ROOT })}\n`)
if (process.env.FAKE_PRACTICE_FAIL) {
  process.stderr.write(`${JSON.stringify({ error: process.env.FAKE_PRACTICE_FAIL })}\n`)
  process.exit(1)
}
const value = flag => { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1] }
const rest = argv.filter((word, i) => !word.startsWith('--') && !(i > 0 && ['--learner', '--lang', '--limit', '--minutes', '--session', '--item', '--task', '--variant', '--audio', '--text-file', '--correct', '--total', '--focus'].includes(argv[i - 1])))
const [command, action, third] = rest
const lang = value('--lang') ?? 'en'
const out = body => process.stdout.write(`${JSON.stringify(body)}\n`)
const sleep = ms => new Promise(done => setTimeout(done, ms))
const attempt = id => ({ id, session: 's1', item: 'i1', skill: 'speaking', task: 'celpip.speaking.1', variant: 'full', kind: 'voice', created: '2026-01-01T00:00:00+00:00', minutes: 2, prompt: null, metrics: { speech_rate_wpm: 120 }, errors: [], speech: { status: 'ok' }, answer_text: 'hello', feedback: null, speech_summary: 'Clear.', folder: `${process.env.PRACTICE_ROOT}/${value('--learner')}/${lang}/attempts/${id}` })
const session = { id: 's1', lang, status: 'open', started: '2026-01-01T00:00:00+00:00', plan: { items: [{ id: 'i1', kind: 'task', task: 'celpip.speaking.1', skill: 'speaking', name: 'Giving Advice', state: 'todo', prep_s: 30, response_s: 90 }] }, attempts: ['s1-a1'], cards_reviewed: 0 }
switch (command) {
  case 'facts': out({ languages: { en: { sessions_finished: 1 }, fr: { sessions_finished: 0 } } }); break
  case 'status': out({ lang, open_sessions: process.env.FAKE_PRACTICE_NO_SESSION ? [] : ['s1'], cards: { due_now: 2 }, speaking_debt: { owed: true } }); break
  case 'plan': out({ lang, minutes_available: Number(value('--minutes') ?? 20), items: [{ id: 'i1', kind: 'task', task: 'celpip.speaking.1' }] }); break
  case 'session': out(action === 'list' ? { sessions: [{ id: 's0' }, { id: 's1' }] } : { ...session, status: action === 'finish' ? 'finished' : 'open' }); break
  case 'review': out(action === 'due' ? { lang, due_total: 1, shown: 1, cards: [{ id: 'c-abc123', kind: 'cloze', prompt: 'a ____ b', answer: 'x' }] } : { graded: [{ card: third, rating: 'good' }], due_remaining: 0 }); break
  case 'progress': out({ lang, skills: {}, sounds: [] }); break
  case 'attempt':
    if (action === 'list') out({ attempts: [{ id: 's1-a1' }, { id: 's1-a2' }] })
    else if (action === 'show') out(attempt(third))
    else {
      if (process.env.FAKE_PRACTICE_SLEEP_MS) await sleep(Number(process.env.FAKE_PRACTICE_SLEEP_MS))
      if (process.env.FAKE_PRACTICE_TOUCH) writeFileSync(process.env.FAKE_PRACTICE_TOUCH, 'x')
      out({ attempt: attempt('s1-a3'), speech: { status: 'ok' } })
    }
    break
  default: process.stderr.write(`${JSON.stringify({ error: `unknown ${command}` })}\n`); process.exit(1)
}
