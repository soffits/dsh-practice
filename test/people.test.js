import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPeople, viewerOf } from '../src/people.js'
import { scratch } from './helpers.js'

const identity = id => ({ current: () => (id === null ? null : { id, name: 'Ana A' }) })

test('without a mapping everyone is the owner, practising in the owner\'s learner folder', async () => {
  const people = createPeople({})
  assert.deepEqual(await viewerOf(people, undefined, { owner: 'owner', learners: {} }), { person: 'owner', name: null, learner: 'owner' })
  assert.equal((await viewerOf(people, undefined, { owner: 'owner', learners: { owner: 'ana' } })).learner, 'ana')
})

test('a mapped person gets their own learner id, or the one the learners setting names', async () => {
  const people = createPeople({ people: { 'sub-1': 'Ana' } })
  assert.equal((await viewerOf(people, identity('sub-1'), { owner: 'owner', learners: {} })).learner, 'ana')
  assert.equal((await viewerOf(people, identity('sub-1'), { owner: 'owner', learners: { ana: 'ana-2' } })).learner, 'ana-2')
})

test('someone nobody mapped has no learner, and a learner id that is not a safe folder name is refused', async () => {
  const people = createPeople({ people: { 'sub-1': 'ana' } })
  assert.equal((await viewerOf(people, identity('sub-2'), { owner: 'owner', learners: {} })).learner, null)
  assert.equal((await viewerOf(people, identity(null), { owner: 'owner', learners: {} })).learner, null)
  for (const bad of ['../x', 'a/b', '.hidden', '', '-rf']) {
    assert.equal((await viewerOf(people, identity('sub-1'), { owner: 'owner', learners: { ana: bad } })).learner, null, bad)
  }
})

test('a mapping with no identity provider is reported as unavailable, not as everyone', async () => {
  const people = createPeople({ people: { 'sub-1': 'ana' } })
  assert.deepEqual(await viewerOf(people, undefined, { owner: 'owner', learners: {} }), { unavailable: true })
})

test('the people file is read under its key, re-read when it changes, and a broken one maps nobody', async () => {
  const dir = await scratch()
  const file = join(dir, 'people.json')
  const warnings = []
  const people = createPeople({ peopleFile: file, peopleKey: 'users' }, { warn: message => warnings.push(message) })
  await writeFile(file, JSON.stringify({ users: { 'sub-9': 'Bo' } }))
  assert.equal(await people.personFor('sub-9'), 'bo')
  await writeFile(file, '{ nope')
  assert.equal(await people.personFor('sub-9'), undefined)
  assert.equal(warnings.length, 1)
})
