# dsh-practice

A DSH plugin: the language-practice page over the `practice` command line.

- `index.js`: the Host row, its config schema and wiring. `src/routes.js` holds the `/api/practice/*` routes (each decided per request from `requestIdentity`, `src/people.js`); `src/practice.js` is the command adapter (execFile, never a shell, free text always as `--flag=value`); `src/jobs.js` runs slow calls detached in a job folder and announces them by an `exit` file; `src/audio.js` is the streamed upload and the range playback; `src/changes.js` watches the practice root and the jobs folder (inotify) for the events stream; `src/web.js` serves `web/` by exact routes with content tags.
- `client.js`: the sidebar entry, the words (`/api/practice/strings`, from `locale/`) and the styles; it loads the page from `web/` (`page.js` and what it imports, `ui.js` first). `web/format.js` and `web/recorder.js` hold the pure parts (formatting, the MIME ladder, blockers), tested in Node. `test/fixtures/` holds export lists `test/page.test.js` checks the page's DSH and kit names against.

Rules: the plugin never keeps a copy of practice data, and every write goes through the command. Nothing about a particular home or person goes in code, docs or tests (no names, paths, learner data). Views follow changes through the events stream, never a polling timer. After UI changes look at the page at 390 and 1280 px, in light and dark, in two languages. `npm run check`, `npm test`. Conventional Commits, squash merges, semver from commit types.
