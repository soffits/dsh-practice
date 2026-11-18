/** Small helpers shared by the route files: JSON answers, strict input checks, the sign-in wrapper. */
import { viewerOf } from './people.js'

export const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
export const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } })
export const fail = (status, message) => Object.assign(new Error(message), { status })

export const LANG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/
export const SESSION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
export const ITEM = /^i\d{1,3}$/
export const TASK = /^[a-z0-9][a-z0-9_.-]{0,63}$/
export const LESSON = TASK
export const LESSON_ITEMS = /^[A-Za-z0-9_.-]{1,16}(?:,[A-Za-z0-9_.-]{1,16}){0,39}$/
export const CARD = /^c-[0-9a-f]{6,20}$/
export const ATTEMPT = SESSION
export const RATINGS = ['again', 'hard', 'good', 'easy']

const MAX_BODY = 256 * 1024

export async function body(request) {
  const text = await request.text()
  if (text.length > MAX_BODY) throw fail(413, 'Request too large.')
  try {
    const value = JSON.parse(text || '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object')
    return value
  } catch {
    throw fail(400, 'Send a JSON object.')
  }
}

/** A value that must match `pattern`, or a 400 naming the field. */
export function checked(value, pattern, field) {
  if (typeof value !== 'string' || !pattern.test(value)) throw fail(400, `Check ${field}.`)
  return value
}

/** An optional finite number in [min, max], or undefined. */
export function numeric(value, field, { min = 0, max = 1000 } = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw fail(400, `Check ${field}.`)
  return number
}

/**
 * Wrap a route: who is asking comes from `requestIdentity` per request; a person with no learner folder
 * name gets the route's `empty` answer (a state to show, not an error).
 */
export function guard({ people, identity, settings, log = () => {} }, fn, { empty } = {}) {
  return async request => {
    try {
      const viewer = await viewerOf(people, identity(), settings)
      if (viewer.unavailable) return json(503, { error: 'This page needs a sign-in plugin that provides requestIdentity, and none is running.' })
      if (viewer.learner === null) return empty ? json(200, empty(viewer)) : json(404, { error: 'No practice data for you here.' })
      return await fn(request, viewer)
    } catch (error) {
      if (!error.status) log(error)
      return json(error.status ?? 500, { error: error.status ? error.message : 'Something went wrong.' })
    }
  }
}

export const get = (path, fetch) => ({ path, methods: ['GET'], requestBody: 'buffered', fetch })
export const post = (path, fetch) => ({ path, methods: ['POST'], requestBody: 'buffered', fetch })
