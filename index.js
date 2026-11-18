/**
 * DeepSeek Harness Host plugin: the language-practice page.
 *
 * A thin page over the `practice` command line (the language-practice project, or anything that
 * answers the same JSON): today's plan, due review cards, a speaking recorder whose clips go to
 * `practice attempt add --audio`, writing answers, finishing a session and progress. The plugin
 * keeps no practice data of its own: every read and write goes through the command, and open pages
 * follow the practice folder through file-system change notices.
 */
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { createChanges } from './src/changes.js'
import { createJobs, personHash } from './src/jobs.js'
import { readLocales, tables } from './src/locales.js'
import { createPeople, expandHome, personKey } from './src/people.js'
import { createPractice } from './src/practice.js'
import { createRoutes } from './src/routes.js'
import { webRoutes } from './src/web.js'

export const name = 'dsh-practice'
export const inject = ['connection']

export const Config = z.object({
  command: z.array(z.string()).default(['practice'])
    .description('The practice command, as an argument list. A leading ~/ means the home folder.'),
  root: z.string().default('')
    .description('The folder with one folder per learner (the command\'s PRACTICE_ROOT). It is watched, so open pages update as soon as anything is written. Empty: the PRACTICE_ROOT of DSH\'s environment.'),
  dataDir: z.string().default('~/.dsh/practice')
    .description('Where uploads and running analyses are kept until they finish: <dataDir>/jobs.'),
  people: z.dict(z.string()).default({})
    .description('Verified user id (from the sign-in plugin, such as an OIDC sub) → person id. With any mapping configured, a request from someone not listed has no learner.'),
  peopleFile: z.string().default('')
    .description('A JSON file with more of the same mapping, re-read when it changes.'),
  peopleKey: z.string().default('')
    .description('The top-level key in peopleFile that holds the mapping.'),
  learners: z.dict(z.string()).default({})
    .description('Person id → learner id, when it differs from the person id (the learner id is the folder name under root).'),
  owner: z.string().default('owner')
    .description('The person id used when no mapping is configured (a DSH only its owner uses).'),
  maxClipMB: z.natural().min(1).max(500).default(60)
    .description('The largest recording the page may upload, in megabytes.'),
})

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config) {
  const logger = ctx.logger('practice')
  const home = homedir()
  const absolute = path => {
    const expanded = expandHome(path, home)
    return isAbsolute(expanded) ? expanded : resolve(expanded)
  }
  const root = absolute(config.root || process.env.PRACTICE_ROOT || '')
  if (root === '' || root === resolve('')) {
    logger.warn('no practice root: set `root` (or PRACTICE_ROOT); the page stays empty')
    return
  }
  const command = (config.command?.length ? config.command : ['practice']).map((part, i) => (i === 0 && part.startsWith('~/') ? absolute(part) : part))
  // A command named without a path is looked up on PATH, with the home's own bin folder added.
  const env = { ...process.env, PATH: [process.env.PATH, join(home, '.local', 'bin')].filter(Boolean).join(delimiter) }
  const practice = createPractice({ command, root, env })
  const dataDir = absolute(config.dataDir || '~/.dsh/practice')
  const jobsDir = join(dataDir, 'jobs')
  const jobs = createJobs({ dir: jobsDir, practice, beforePrepare: () => changes.ensure() })
  const changes = createChanges({ root, jobsDir, onJobExit: (hash, id) => { jobs.reap(hash, id).catch(error => logger.warn(`job ${id}: ${error.message}`)) }, onRearm: () => { logger.warn('a watched folder was missing and is watched again'); jobs.reapAll().catch(() => {}) } })
  const people = createPeople({ people: config.people ?? {}, peopleFile: config.peopleFile ? absolute(config.peopleFile) : '', peopleKey: config.peopleKey ?? '' }, { warn: message => logger.warn(message) })
  const strings = readLocales(fileURLToPath(new URL('./locale/', import.meta.url))).then(tables)
  const lower = map => Object.fromEntries(Object.entries(map ?? {}).map(([key, value]) => [personKey(key), value]))
  const routes = createRoutes({
    practice, jobs, changes, people,
    strings: () => strings,
    identity: () => ctx.get('requestIdentity'),
    settings: { owner: personKey(config.owner || 'owner'), learners: lower(config.learners) },
    maxClipBytes: (config.maxClipMB ?? 60) * 1024 * 1024,
    log: error => logger.warn(error.message),
  })
  for (const route of [...routes, ...webRoutes(fileURLToPath(new URL('./web/', import.meta.url)))]) ctx.connection.fetch.register(route)
  changes.start().then(() => jobs.reapAll()).catch(error => logger.warn(`could not watch ${root}: ${error.message}`))
  ctx.on('dispose', () => changes.stop())
  logger.info(`practice via ${command.join(' ')}, watching ${root} (${people.enabled ? 'per person' : 'single owner'})`)
}
