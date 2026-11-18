import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newestFirst } from '../web/reads.js'

test('an older read lands first and shows; the newer one then replaces it', () => {
  const reads = newestFirst()
  const opening = reads.start()
  const refresh = reads.start()
  assert.ok(opening.fresh())
  opening.show()
  assert.ok(refresh.fresh())
  refresh.show()
  assert.ok(!opening.fresh())
})

test('an older read that lands after a newer one was shown is dropped', () => {
  const reads = newestFirst()
  const opening = reads.start()
  const refresh = reads.start()
  refresh.show()
  assert.ok(!opening.fresh())
  assert.ok(reads.start().fresh())
})
