import { test } from 'node:test'
import assert from 'node:assert/strict'
import { counted } from '../web/plural.js'

const table = {
  en: { 'a.one': '{n} card', 'a.other': '{n} cards' },
  fr: { 'a.one': '{n} carte', 'a.many': '{n} de cartes', 'a.other': '{n} cartes' },
  zh: { 'a.other': '{n} 张' },
}
const translator = (language, words = language) => Object.assign((key, vars = {}) => (table[words][key] ?? key).replace('{n}', vars.n), { language })

test('a count takes the form its language\'s plural rules choose, and falls back to the general form', () => {
  assert.equal(counted(translator('en'), 'a', 1), '1 card')
  assert.equal(counted(translator('en'), 'a', 2), '2 cards')
  assert.equal(counted(translator('en'), 'a', 0), '0 cards')
  assert.equal(counted(translator('fr'), 'a', 0), '0 carte')
  assert.equal(counted(translator('fr'), 'a', 1.5), '1.5 carte')
  assert.equal(counted(translator('fr'), 'a', 3), '3 cartes')
  assert.equal(counted(translator('fr'), 'a', 1000000), '1000000 de cartes')
  assert.equal(counted(translator('zh'), 'a', 1), '1 张')
  assert.equal(counted(translator('', 'en'), 'a', 1), '1 card')
  assert.equal(counted(translator('not a tag', 'zh'), 'a', 1), '1 张')
})
