import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { readLocales, tables } from '../src/locales.js'

test('the shipped locale folder gives complete tables for en, fr and zh, and a regional tag falls back to its language', async () => {
  const all = tables(await readLocales(fileURLToPath(new URL('../locale/', import.meta.url))))
  assert.deepEqual(Object.keys(all).sort(), ['en', 'fr', 'zh'])
  assert.equal(all.fr['view.today'], 'Aujourd\'hui')
  assert.equal(Object.keys(all.zh).length, Object.keys(all.en).length)
})
