# CoreX-Badges code index

## Generator

- `scripts/generate-bstats-badges.mjs` — Node.js entry point and public artifact contract. Defines all CoreX projects and bStats IDs, fetches the `Servers` and `Players` series, computes current and record values, writes four numeric badges plus one seven-day chart per platform, writes one JSON summary per project, and builds the root Pages catalogue.

## Automation

- `.github/workflows/deploy-pages.yml` — scheduled, manual, and push-triggered GitHub Pages deployment. Uses Node.js 24, generates `_site/`, uploads the Pages artifact, and deploys it.

## Documentation

- `README.md` — supported projects, platform IDs, output naming contract, local generation command, schedule, and public Pages URL.
- `CODE_INDEX.md` — compact technical map of the maintained repository.
- `.gitignore` — excludes the documented local and workflow generation directories.

Generated badge directories, `_site/`, local output directories, Git metadata, and dependency caches are intentionally excluded from source control.
