import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PLURAL_FORM } from '../web/plural.js'

const WEB = new URL('../web/', import.meta.url)
const files = (await readdir(WEB)).filter(name => name.endsWith('.js'))
const sources = Object.fromEntries(await Promise.all([...files.map(name => readFile(new URL(name, WEB), 'utf8').then(text => [name, text])), readFile(new URL('../client.js', import.meta.url), 'utf8').then(text => ['client.js', text])]))
const all = Object.values(sources).join('\n')
const fixture = async name => new Set(JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')).exports)

test('every DSH component the page takes (P.*) exists in the DSH it supports', async () => {
  const exported = await fixture('dsh-client-ui-primitives-0.2.2-rc.1.json')
  const used = [...new Set([...all.matchAll(/\bP\.([A-Z][A-Za-z]+)\b/g)].map(match => match[1]))]
  assert.ok(used.length >= 4)
  assert.deepEqual(used.filter(name => !exported.has(name)), [])
})

test('every kit piece the page uses (K.*) is one the kit provides', async () => {
  const provided = await fixture('dsh-ui-kit-0.3.0.json')
  const used = [...new Set([...all.matchAll(/\bK\.([A-Za-z]+)\b/g)].map(match => match[1]))]
  assert.ok(used.length >= 8)
  assert.deepEqual(used.filter(name => !provided.has(name)), [])
})

test('every icon the page asks the kit for is bundled in it', async () => {
  const kit = JSON.parse(await readFile(new URL('../../dsh-plugin-sdk/ui/icons.json', import.meta.url), 'utf8').catch(() => 'null'))
  if (kit === null) return // the kit's source tree is not beside this one (CI)
  const names = new Set(kit.names)
  const used = [...all.matchAll(/icon: '([a-z0-9-]+)'/g)].map(match => match[1]).concat([...all.matchAll(/\['([a-z0-9-]+)', '(?:accent|violet|ok|warn|muted)'\]/g)].map(match => match[1]))
  assert.ok(used.length > 5)
  assert.deepEqual([...new Set(used)].filter(name => !names.has(name)), [])
})

test('every word the page asks for exists in every language, and no language is missing a key another has', async () => {
  const keys = new Set()
  const counted = new Set()
  for (const text of Object.values(sources)) {
    for (const match of text.matchAll(/'((?:ask|attempt|empty|finish|item|metric|progress|record|review|session|skill|status|task|today|trend|view|write|answer)\.[A-Za-z0-9._-]+)'/g)) keys.add(match[1])
    for (const match of text.matchAll(/\bt\('([a-z][\w.-]*)'/g)) keys.add(match[1])
    for (const match of text.matchAll(/counted\(t, '([a-z][\w.-]*)'/g)) counted.add(match[1])
  }
  for (const [prefix, names] of Object.entries({
    'metric.': ['duration_s', 'words', 'speech_rate_wpm', 'pauses_per_min', 'fillers_per_100_words', 'phonation_time_ratio', 'mean_length_of_run_words', 'response_time_share', 'articulation_rate_syll_per_s', 'median_sentence_range_st'],
    'record.': ['denied', 'no-device', 'busy', 'failed', 'insecure', 'no-microphone', 'no-recorder'],
    'trend.': ['up', 'down', 'flat', 'insufficient'],
    'attempt.state.': ['analysing', 'interrupted', 'failed', 'skipped', 'done'],
    'session.status.': ['finished', 'open', 'abandoned'],
    'skill.': ['speaking', 'writing', 'reading', 'listening', 'review', 'other'],
    'answer.': ['voice', 'text', 'objective', 'review', 'drill'],
    'view.': ['today', 'review', 'progress'],
  })) for (const name of names) keys.add(prefix + name)
  for (const key of counted) keys.delete(key)
  assert.ok(keys.size > 100)
  const tables = {}
  for (const tag of ['en', 'fr', 'zh']) tables[tag] = JSON.parse(await readFile(new URL(`../locale/${tag}.json`, import.meta.url), 'utf8')).ui
  // A counted entry has the forms its language's plural rules use, so languages differ in the suffixes but never in the base keys.
  const base = key => key.replace(PLURAL_FORM, '')
  const bases = table => new Set(Object.keys(table).map(base))
  for (const tag of Object.keys(tables)) {
    assert.deepEqual([...keys].filter(key => !(key in tables[tag])), [], tag)
    for (const key of counted) {
      assert.ok(`${key}.other` in tables[tag], `${tag} ${key}.other`)
      const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories
      assert.deepEqual(categories.filter(category => !(`${key}.${category}` in tables[tag])), [], `${tag} ${key} lacks a plural form`)
    }
  }
  for (const tag of ['fr', 'zh']) assert.deepEqual([...bases(tables.en)].filter(key => !bases(tables[tag]).has(key)), [], `${tag} lacks keys en has`)
  for (const tag of Object.keys(tables)) {
    const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort()
    for (const key of Object.keys(tables[tag])) assert.deepEqual(placeholders(tables[tag][key]), placeholders(tables.en[`${base(key)}.other`] ?? tables.en[key]), `${tag} ${key}`)
  }
})

test('the page names no assistant and no path of any machine', () => {
  assert.doesNotMatch(all, /\bClaude\b/)
  assert.doesNotMatch(all, /\/home\/|\.dsh\//)
})
