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

## Generate locally

Node.js 24 is used by GitHub Actions. Generate into a disposable directory with:

```powershell
$env:BADGE_OUTPUT_DIR = "output"
node scripts/generate-bstats-badges.mjs
```

The scheduled GitHub Actions workflow regenerates and deploys the complete catalogue every six hours.

Published site: <https://icewolf23x.github.io/CoreX-Badges/>
