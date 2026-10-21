# CoreX-Badges

Static SVG badges and seven-day charts generated from the public bStats API for the CoreX plugin family. The published files can be embedded on Modrinth and other sites that do not allow custom JavaScript.

## Projects

| Project | Platform | bStats ID | Output directory |
| --- | --- | ---: | --- |
| CoreChatX | Paper/Purpur | `32163` | `corechatx/` |
| CoreChatX | Velocity | `32164` | `corechatx/` |
| CoreArmorX | Paper/Purpur | `33070` | `corearmorx/` |
| CoreToolsX | Paper/Purpur | `33071` | `coretoolsx/` |
| CoreExtractionX | Paper/Purpur | `33072` | `coreextractionx/` |
| CoreCaseX | Paper/Purpur | `33073` | `corecasex/` |
| CoreStructuresX | Paper/Purpur | `33074` | `corestructuresx/` |

Each platform produces:

- `<platform>-servers.svg`
- `<platform>-players.svg`
- `<platform>-record-servers.svg`
- `<platform>-record-players.svg`
- `<platform>-chart.svg`

Each project also receives `bstats-summary.json`. The generator creates the root `index.html` catalogue from the same project definitions.

## CoreChatX integration badges

CoreChatX additionally produces these badges:

| File in `corechatx/` | bStats project | Custom chart ID | Counted category |
| --- | ---: | --- | --- |
| `paper-discord.svg` | `32163` | `discord_integration` | `Enabled` |
| `paper-telegram.svg` | `32163` | `telegram_integration` | `Enabled` |
| `velocity-discord.svg` | `32164` | `discord_integration` | `Enabled` |

These badges count reporting plugin instances with the integration configured and enabled,
not verified connections or message volume. `Disabled` and `Managed by Velocity` do not
contribute to the badge count, so Paper proxy backends are not counted as independent
Discord integrations. Telegram remains Paper-owned; there is no Velocity Telegram badge.

An unregistered chart, failed request, invalid response or chart without reporting servers
produces a grey `N/A` badge. A chart that reports disabled/proxy-managed instances but no
enabled instances produces a numeric `0`. Optional integration failures do not stop the
existing server/player badges; their mandatory API failures still fail generation.

The JSON summary adds `platforms.<platform>.integrations.<integration>` with `chartId`,
`status` (`available`, `no-data`, `unavailable`), `enabledServers` and `reportedServers`.
`enabledServers` is `null` when no count is available. Failed fetches or invalid responses
also include an `error`. The corresponding path is added under `files.discordBadge` or
`files.telegramBadge`; existing fields and artifact paths remain unchanged.

To embed a badge, use a URL such as
`https://icewolf23x.github.io/CoreX-Badges/corechatx/paper-discord.svg`.
The plugin maintainer must first register each custom chart as `Simple Pie` on bStats with
the exact ID above and deploy a CoreChatX version that reports it. See the
[bStats custom-chart setup](https://bstats.org/docs/custom-charts).

## Generate locally

Node.js 24 is used by GitHub Actions. Generate into a disposable directory with:

```powershell
$env:BADGE_OUTPUT_DIR = "output"
node scripts/generate-bstats-badges.mjs
```

The scheduled GitHub Actions workflow regenerates and deploys the complete catalogue every six hours.

Run the dependency-free offline tests and syntax check with:

```powershell
node --check scripts/generate-bstats-badges.mjs
node --test scripts/generate-bstats-badges.test.mjs
```

The workflow runs these tests on Node.js 24 before generating the Pages artifacts.

Published site: <https://icewolf23x.github.io/CoreX-Badges/>

<!-- Scheduled workflow activity refresh: 2026-09-24 -->
