# Changelog

## 0.1.3

- `@deepseek-ai/schemastery` is a peer dependency (DSH provides it) instead of a pinned dependency, so a package manager no longer moves a private copy of it when versions change under a running DSH, which stopped the plugin from loading after an in-place update.

## 0.1.2

- A practice or jobs folder deleted while DSH runs is created again and watched again, so open pages keep updating and uploads keep working without a restart.
- Counts use each language's plural forms ("1 card due", "2 cards due"; French and Chinese too).
- A browser's WebM recording gets its duration (copied with ffmpeg when it is available), so the player no longer shows 0:00 / 0:00.
- The release goes out through a tag workflow with npm trusted publishing.

## 0.1.1

- The empty state's button no longer sits against the text above it.

## 0.1.0

First release: the Today, Review and Progress views, the speaking recorder with prep and response timers and a speech-analysis summary, writing and result entry, finishing a session, "Ask" buttons that open a conversation about an item, live updates from the practice folder, and English, French and Chinese words.
