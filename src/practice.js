/**
 * The `practice` command line, the only way this plugin reads or writes practice data.
 * Every call is `execFile` (never a shell) with `--json`; a failure carries the CLI's own message.
 */
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

const TIMEOUT_MS = 60 * 1000
const MAX_OUTPUT = 32 * 1024 * 1024

export class PracticeError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.status = status
  }
}

/**
 * @param {object} o
 * @param {string[]} o.command - the CLI as an argument list
 * @param {string} o.root - PRACTICE_ROOT: one folder per learner
 * @param {NodeJS.ProcessEnv} o.env
 */
export function createPractice({ command, root, env }) {
  const [file, ...head] = command
  const childEnv = { ...env, PRACTICE_ROOT: root }

  /** The argument list of one call, for the CLI itself and for jobs that run it detached. */
  const argv = (learner, args) => [...head, '--learner', learner, '--json', ...args.map(String)]

  /** Run one command for a learner; resolves to the parsed JSON. */
  function run(learner, args) {
    return new Promise((resolve, reject) => {
      execFile(file, argv(learner, args), { env: childEnv, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return reject(new PracticeError(messageOf(stderr) ?? (error.code === 'ENOENT' ? `The practice command (${file}) was not found.` : error.message)))
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new PracticeError('The practice command answered something that is not JSON.', 502))
        }
      })
    })
  }

  /** Whether the learner has any practice data at all (a folder with learner.json), so a missing one is an empty state, not an error. */
  const exists = learner => stat(join(root, learner, 'learner.json')).then(info => info.isFile(), () => false)

  return { run, argv, exists, file, env: childEnv, root }
}

/** The CLI prints `{"error": "..."}` on stderr; anything else is shown cut short. */
export function messageOf(stderr) {
  const text = String(stderr ?? '').trim()
  if (text === '') return null
  try {
    const value = JSON.parse(text.split('\n').filter(Boolean).at(-1))
    if (typeof value?.error === 'string') return value.error
  } catch { /* not JSON */ }
  return text.slice(-300)
}
