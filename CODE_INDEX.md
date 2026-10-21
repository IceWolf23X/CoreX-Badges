# CoreX-Badges code index

## Generator

- `scripts/generate-bstats-badges.mjs` — Node.js entry point and public artifact contract. Defines all CoreX projects and bStats IDs, fetches the `Servers` and `Players` series with transient-failure retries, computes current and record values, writes four numeric badges plus one seven-day chart per platform, writes one JSON summary per project, and builds the root Pages catalogue. CoreChatX also gets Paper Discord/Telegram and Velocity Discord badges from the `Enabled` simple-pie category, additive `integrations` summary metadata and catalogue images; missing/empty/invalid optional data produces `N/A`. Exports generation/rendering/parsing seams for offline tests and executes the networked CLI only when run directly.
- `scripts/generate-bstats-badges.test.mjs` — Node.js built-in offline tests for integration category counts, measured zero versus unavailable data, malformed payloads, optional HTTP failures, SVG values, and CoreChatX artifact/JSON/catalogue contracts. Uses local fetch fixtures and task-owned temporary output; no external requests.

## Automation

- `.github/workflows/deploy-pages.yml` — scheduled, manual, and push-triggered GitHub Pages deployment. Uses Node.js 24, runs offline generator tests, generates `_site/`, uploads the Pages artifact, and deploys it.

## Documentation

- `README.md` — supported projects, platform IDs, output naming contract, CoreChatX integration chart IDs/counting/unavailable semantics and JSON additions, local generation/test commands, schedule, and public Pages URL.
- `CODE_INDEX.md` — compact technical map of the maintained repository.
- `.gitignore` — excludes the documented local and workflow generation directories.

Generated badge directories, `_site/`, local output directories, Git metadata, and dependency caches are intentionally excluded from source control.
