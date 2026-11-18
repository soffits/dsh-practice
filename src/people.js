/**
 * Who is asking, and which learner folder that person practises in.
 *
 * The caller comes from a `requestIdentity` service (dsh-oidc provides one): `current()` returns
 * `{ id, name? }` for the verified person behind an `/api` request, or null. The verified id maps
 * to a person id through `people` (and `peopleFile`); the person's learner id is `learners[person]`
 * or, by default, the person id itself. Without any mapping (a DSH only its owner uses) everyone
 * DSH lets in is the owner. A person nobody mapped, or whose learner id is not a safe folder name,
 * has no learner and the page shows an empty state.
 */
import { readFile, stat } from 'node:fs/promises'

export const LEARNER_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

export const personKey = value => (typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '')
export const expandHome = (path, home) => (typeof path === 'string' && (path === '~' || path.startsWith('~/')) ? home + path.slice(1) : path)

/** The verified id → person id mapping, re-read when the file changes. */
export function createPeople({ people = {}, peopleFile = '', peopleKey = '' }, { warn = () => {} } = {}) {
  const inline = Object.entries(people)
  const enabled = inline.length > 0 || peopleFile !== ''
  let cached = { tag: undefined, entries: [] }

  async function fromFile() {
    if (peopleFile === '') return []
    let tag
    try {
      const info = await stat(peopleFile)
      tag = `${info.size}:${info.mtimeMs}`
    } catch (error) {
      tag = `error:${error.code}`
    }
    if (tag === cached.tag) return cached.entries
    let entries = []
    try {
      let value = JSON.parse(await readFile(peopleFile, 'utf8'))
      if (peopleKey !== '') value = value?.[peopleKey]
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(peopleKey ? `no object at key ${peopleKey}` : 'not a JSON object')
      entries = Object.entries(value).filter(([, person]) => typeof person === 'string')
    } catch (error) {
      warn(`people file ${peopleFile}: ${error.message}; nobody is mapped from it`)
    }
    cached = { tag, entries }
    return entries
  }

  return {
    enabled,
    async personFor(userId) {
      if (typeof userId !== 'string' || userId === '') return undefined
      const person = new Map([...(await fromFile()), ...inline]).get(userId)
      return person === undefined ? undefined : personKey(person)
    },
  }
}

/**
 * The viewer of this request: `{ person, name, learner }` (learner null: no practice folder for them),
 * or `{ unavailable: true }` when a mapping is configured but no identity provider runs.
 * @param {ReturnType<typeof createPeople>} people
 * @param {{ current?: () => ({ id?: string, name?: string } | null) } | undefined} identityService
 * @param {{ owner: string, learners: Record<string, string> }} settings - owner: the person an unmapped DSH acts as; learners: person → learner id
 */
export async function viewerOf(people, identityService, { owner, learners }) {
  let person = owner
  let name = null
  if (people.enabled) {
    if (typeof identityService?.current !== 'function') return { unavailable: true }
    const identity = identityService.current()
    person = await people.personFor(identity?.id)
    name = typeof identity?.name === 'string' ? identity.name.slice(0, 80) : null
  }
  if (person === undefined) return { person: null, name, learner: null }
  const learner = learners[person] ?? person
  return { person, name, learner: LEARNER_ID.test(learner) ? learner : null }
}
