import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

/** The least of a Cordis context that `apply` touches. */
function fakeContext() {
  const warnings = []
  const registered = []
  const ctx = {
    logger: () => ({ warn: message => warnings.push(message), info: () => {} }),
    connection: { fetch: { register: route => registered.push(route) } },
    effect: () => {},
    get: () => undefined,
  }
  return { ctx, warnings, registered }
}

test('without a practice root the words are still served, so the sidebar entry has its label', async () => {
  const saved = process.env.PRACTICE_ROOT
  delete process.env.PRACTICE_ROOT
  try {
    const { ctx, warnings, registered } = fakeContext()
    apply(ctx, { root: '' })
    assert.match(warnings[0], /no practice root/)
    assert.deepEqual(registered.map(route => route.path), ['/api/practice/words'])
    const response = await registered[0].fetch(new Request('https://dsh.example/api/practice/words'))
    assert.equal(response.status, 200)
    const { tables } = await response.json()
    assert.equal(tables.en.panel, 'Practice')
    assert.ok(tables.zh.panel)
  } finally {
    if (saved !== undefined) process.env.PRACTICE_ROOT = saved
  }
})
