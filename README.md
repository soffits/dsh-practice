# @soffits/dsh-practice

A language-practice page for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), over the [`practice`](https://github.com/soffits/language-practice) command line. It is the part of a practice session that needs no chat turn: you see today's plan, answer due review cards, record a speaking answer in the browser and see its analysis when it lands, type a writing answer, finish the session and watch your progress. Anything that needs a tutor (a prompt, feedback, a plan) is one button that opens a conversation with the assistant about that item.

- **Today**: the plan for the time you have, then the open session's tasks one by one. A speaking task shows its prompt with the preparation and answer timers from the exam format, records from the microphone (or takes an audio file), lets you listen back, and sends the clip to `practice attempt add --audio`. The speech-check summary (pace, pauses, fillers, flagged sounds, transcript) appears on the answer when the analysis finishes; a long clip takes a minute or two and the page shows progress meanwhile. Writing answers have a word counter against the task's limits; reading and listening sets take a result. Finishing a session asks the points ledger once and shows what it answered.
- **Lessons**: for a beginner whose profile has foundations (lesson tracks of the `practice` tool): every lesson by unit, each with its short explanation, every item to hear at normal and slow speed, the whole lesson as one listen-and-repeat file, a record button per item or for all of them (sent for read-aloud analysis; feedback is labelled low reliability where the speech tool has not calibrated the language), and a button that marks it done. The next lesson is also a task of today's session. The view only shows when the language has foundations set up.
- **Review**: due cards one at a time, with answer reveal and Again / Hard / Good / Easy (keys 1 to 4). Cards with audio (hear, say, number dictation, which-of-two, words with an example) have play buttons for the normal and slow clips and choice buttons for minimal pairs.
- **Progress**: sessions, days and minutes practised, trends per skill, speaking signals over time, sound streaks, recurring mistakes, recent sessions and answers. Trends compare a learner with herself; nothing is a score.

The page keeps no copy of your practice data: every read and write is a `practice` call, and open pages follow the practice folder through file-system change notices, so what the assistant or a script writes shows up at once. Labels are in English, French and Chinese (one file per language in `locale/`). It works on a phone screen.

## Install

The plugin needs the `practice` command on the machine DSH runs on. It lives in [soffits/language-practice](https://github.com/soffits/language-practice); the page itself has no data of its own.

```sh
uv tool install git+https://github.com/soffits/language-practice
```

That is enough for planning, writing practice and review cards. For voice answers also install [speech-check](https://github.com/soffits/speech-check) (`uv tool install git+https://github.com/soffits/speech-check`, then `speech-check setup` to download its models). If you have your own command that speaks the same interface, point `command` at it (see the settings below). It also needs DSH with [@soffits/dsh-ui-kit](https://github.com/soffits/dsh-ui-kit) and [@soffits/dsh-ui-actions](https://github.com/soffits/dsh-ui-actions) (the "Ask" buttons are hidden without the second). For several people, a sign-in plugin that provides `requestIdentity` (such as [@soffits/dsh-oidc](https://github.com/soffits/dsh-oidc)).

```sh
dsh plugin --profile web add @soffits/dsh-practice
```

Then set the row in your profile patch:

```yaml
- id: practice
  config:
    command: [practice]
    root: ~/data/practice            # the folder with one folder per learner (the command's PRACTICE_ROOT)
```

| Setting | What it does |
|---|---|
| `command` | The practice command as an argument list. |
| `root` | The folder that holds one folder per learner. It is watched. Empty: DSH's `PRACTICE_ROOT`. |
| `dataDir` | Where uploads and analyses in progress are kept until they finish (`<dataDir>/jobs`). Created when missing, and watched again if it is deleted while the plugin runs. |
| `people`, `peopleFile`, `peopleKey` | Verified sign-in id (an OIDC subject) → person id, inline or from a JSON file. With a mapping, anyone not in it has no learner. |
| `learners` | Person id → learner id, when it differs from the person id. |
| `owner` | The person id when no mapping is set (a DSH only one person uses). |
| `maxClipMB` | The largest recording the page accepts (60). |

A person's learner folder is `<root>/<learner id>`. Someone with no practice data sees an empty state with a button to ask the assistant to set it up; nothing is created by opening the page.

## Recording

The page records with `MediaRecorder` and asks the browser which type it can write: WebM/Opus in Chrome, Edge, Firefox and Safari 18.4 and later, MP4/AAC in older Safari and on iPhones before iOS 18.4. The server takes any of them (speech-check reads whatever ffmpeg reads). A browser writes WebM with no duration in it, so with `ffmpeg` on the PATH the server copies the clip into a fresh file that has one (no re-encoding), and the player shows its length and can seek. Browsers only give the microphone to secure pages, so DSH must be served over https (or from localhost). Where recording is not possible, the page says why and lets you choose an audio file instead.

A clip is streamed to the server and analysed by a detached `practice attempt add --audio` job, so a slow analysis never blocks the page and survives a DSH restart. The attempt is saved at once and shows as analysing; if the analysis is cut off, the page offers to run it again.

## Develop

```sh
npm install
npm run check
npm test
```

Server tests use a stand-in for the `practice` command (`test/fixtures/fake-practice.mjs`), so nothing needs the real tool. `AGENTS.md` and `docs/decisions.md` hold the design notes.

## Licence

MIT
