/** The page's browser modules (web/*.js and *.css) served by exact routes under /api/practice/web, with a content tag so a changed file is fetched again and an unchanged one is not. */
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PREFIX } from './routes.js'

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
const NAME = /^[a-z0-9-]+\.(js|css)$/

export function webRoutes(dir) {
  const names = readdirSync(dir).filter(name => NAME.test(name))
  return names.map(name => ({
    path: `${PREFIX}/web/${name}`,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const content = await readFile(join(dir, name))
      const tag = `"${createHash('sha1').update(content).digest('hex').slice(0, 16)}"`
      const headers = { etag: tag, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff' }
      if (request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers })
      return new Response(content, { status: 200, headers: { ...headers, 'content-type': TYPES[name.slice(name.lastIndexOf('.'))] } })
    },
  }))
}
