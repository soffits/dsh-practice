import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLocales, tables, wordsIn } from '../src/locales.js'

test('the shipped locale folder gives complete tables for en, fr and zh, and a regional tag falls back to its language', async () => {
  const all = tables(await readLocales(fileURLToPath(new URL('../locale/', import.meta.url))))
  assert.deepEqual(Object.keys(all).sort(), ['en', 'fr', 'zh'])
  assert.equal(all.fr['view.today'], 'Aujourd\'hui')
  assert.equal(Object.keys(all.zh).length, Object.keys(all.en).length)
})

test('the served words are read from the folder on every call, so an update that adds words shows them at once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'practice-words-'))
  try {
    await writeFile(join(dir, 'en.json'), JSON.stringify({ ui: { 'view.today': 'Today' } }))
    const words = wordsIn(dir)
    assert.deepEqual((await words()).en, { 'view.today': 'Today' })
    await writeFile(join(dir, 'en.json'), JSON.stringify({ ui: { 'view.today': 'Today', 'view.lessons': 'Lessons' } }))
    assert.equal((await words()).en['view.lessons'], 'Lessons')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
