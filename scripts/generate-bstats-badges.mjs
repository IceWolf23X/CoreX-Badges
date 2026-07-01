import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_ROOT = process.env.BADGE_OUTPUT_DIR || ".";

const BSTATS_API = "https://bstats.org/api/v1";

const PROJECTS = [
  {
    slug: "corechatx",
    displayName: "CoreChatX",
    platforms: [
      {
        key: "paper",
        label: "Paper/Purpur",
        pluginId: 32163,
        bstatsUrl: "https://bstats.org/plugin/bukkit/CoreChatX-paper",
        minimumRecords: {
          servers: 5,
          players: 69
        },
        colors: {
          servers: "#22c55e",
          players: "#3b82f6",
          recordServers: "#f97316",
          recordPlayers: "#ec4899"
        }
      },
      {
        key: "velocity",
        label: "Velocity",
        pluginId: 32164,
        bstatsUrl: "https://bstats.org/plugin/velocity/CoreChatX-velocity",
        minimumRecords: {
          servers: 1,
          players: 69
        },
        colors: {
          servers: "#8b5cf6",
          players: "#06b6d4",
          recordServers: "#f97316",
          recordPlayers: "#ec4899"
        }
      }
    ]
  }
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CoreX-bStats-badge-generator"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.json();
}

function normalizeChartEntries(charts) {
  if (Array.isArray(charts)) {
    return charts.map((chart) => [
      String(chart.id ?? chart.chartId ?? chart.name ?? chart.title),
      chart
    ]);
  }

  return Object.entries(charts);
}

async function getChartValues(pluginId, wantedChartName) {
  const charts = await fetchJson(`${BSTATS_API}/plugins/${pluginId}/charts`);
  const chartEntries = normalizeChartEntries(charts);

  const normalizedWanted = wantedChartName.toLowerCase();

  const match = chartEntries.find(([chartId, chart]) => {
    const candidates = [
      chartId,
      chart.title,
      chart.name,
      chart.id,
      chart.chartId
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return candidates.includes(normalizedWanted);
  });

  if (!match) {
    const availableCharts = chartEntries
      .map(([chartId, chart]) => {
        const title = chart?.title ? ` (${chart.title})` : "";
        return `${chartId}${title}`;
      })
      .join(", ");

    throw new Error(
      `Chart "${wantedChartName}" not found for plugin ${pluginId}. Available charts: ${availableCharts}`
    );
  }

  const [chartId] = match;

  const rawData = await fetchJson(
    `${BSTATS_API}/plugins/${pluginId}/charts/${chartId}/data?maxElements=100000`
  );

  const points = rawData
    .map((point) => {
      const timestamp = toFiniteNumber(point[0]);
      const value = toFiniteNumber(point[1]);

      if (timestamp === null || value === null) {
        return null;
      }

      return {
        timestamp,
        value
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (points.length === 0) {
    throw new Error(
      `No valid data points found for chart "${chartId}" of plugin ${pluginId}`
    );
  }

  return points;
}

function createBadgeSvg(label, value, color) {
  const normalizedLabel = label.toUpperCase();
  const normalizedValue = formatNumber(value);

  const fontSize = 11;
  const letterSpacing = 1;
  const horizontalPadding = 16;
  const valueHorizontalPadding = 14;
  const height = 28;

  // Deliberately generous estimate to avoid clipping with uppercase bold text.
  const approxCharWidth = fontSize * 0.78;

  const labelWidth = Math.ceil(
    normalizedLabel.length * approxCharWidth +
      Math.max(0, normalizedLabel.length - 1) * letterSpacing +
      horizontalPadding * 2
  );

  const valueWidth = Math.ceil(
    normalizedValue.length * approxCharWidth +
      valueHorizontalPadding * 2
  );

  const width = labelWidth + valueWidth;

  const labelCenter = labelWidth / 2;
  const valueCenter = labelWidth + valueWidth / 2;

  const safeLabel = escapeXml(normalizedLabel);
  const safeValue = escapeXml(normalizedValue);
  const safeColor = escapeXml(color);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeLabel}: ${safeValue}">
  <title>${safeLabel}: ${safeValue}</title>

  <rect width="${width}" height="${height}" fill="#18181b"/>
  <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${safeColor}"/>

  <text
    x="${labelCenter}"
    y="50%"
    text-anchor="middle"
    dominant-baseline="middle"
    fill="#ffffff"
    font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    letter-spacing="${letterSpacing}"
  >${safeLabel}</text>

  <text
    x="${valueCenter}"
    y="50%"
    text-anchor="middle"
    dominant-baseline="middle"
    fill="#ffffff"
    font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
  >${safeValue}</text>
</svg>
`;
}

async function writeBadge(outputDir, fileName, label, value, color) {
  const svg = createBadgeSvg(label, value, color);
  const filePath = path.join(outputDir, fileName);

  await writeFile(filePath, svg, "utf8");
  console.log(`Generated ${filePath}: ${label} = ${value}`);
}

async function generateProject(project) {
  const projectOutputDir = path.join(OUTPUT_ROOT, project.slug);

  await mkdir(projectOutputDir, { recursive: true });

  const summary = {
    project: project.displayName,
    slug: project.slug,
    generatedAt: new Date().toISOString(),
    platforms: {}
  };

  for (const platform of project.platforms) {
    console.log("");
    console.log(`Fetching bStats data for ${project.displayName} / ${platform.label}...`);

    const serverPoints = await getChartValues(platform.pluginId, "Servers");
    const playerPoints = await getChartValues(platform.pluginId, "Players");

    const currentServers = serverPoints.at(-1).value;
    const currentPlayers = playerPoints.at(-1).value;

    const apiRecordServers = Math.max(
      0,
      ...serverPoints.map((point) => point.value)
    );

    const apiRecordPlayers = Math.max(
      0,
      ...playerPoints.map((point) => point.value)
    );

    const minimumRecordServers = platform.minimumRecords?.servers ?? null;
    const minimumRecordPlayers = platform.minimumRecords?.players ?? null;

    const recordServers = Math.max(
      apiRecordServers,
      minimumRecordServers ?? 0
    );

    const recordPlayers = Math.max(
      apiRecordPlayers,
      minimumRecordPlayers ?? 0
    );

    const latestServerPoint = new Date(serverPoints.at(-1).timestamp).toISOString();
    const latestPlayerPoint = new Date(playerPoints.at(-1).timestamp).toISOString();

    console.log(`${project.displayName} / ${platform.label}`);
    console.log(`Current servers: ${currentServers}`);
    console.log(`Current players: ${currentPlayers}`);
    console.log(`API record servers: ${apiRecordServers}`);
    console.log(`API record players: ${apiRecordPlayers}`);
    console.log(`Minimum record servers: ${minimumRecordServers}`);
    console.log(`Minimum record players: ${minimumRecordPlayers}`);
    console.log(`Final record servers: ${recordServers}`);
    console.log(`Final record players: ${recordPlayers}`);
    console.log(`Latest server point: ${latestServerPoint}`);
    console.log(`Latest player point: ${latestPlayerPoint}`);

    summary.platforms[platform.key] = {
      label: platform.label,
      pluginId: platform.pluginId,
      bstatsUrl: platform.bstatsUrl,
      servers: {
        current: currentServers,
        apiRecord: apiRecordServers,
        minimumRecord: minimumRecordServers,
        record: recordServers,
        latestPoint: latestServerPoint
      },
      players: {
        current: currentPlayers,
        apiRecord: apiRecordPlayers,
        minimumRecord: minimumRecordPlayers,
        record: recordPlayers,
        latestPoint: latestPlayerPoint
      }
    };

    await writeBadge(
      projectOutputDir,
      `${platform.key}-servers.svg`,
      `${platform.label} Servers`,
      currentServers,
      platform.colors.servers
    );

    await writeBadge(
      projectOutputDir,
      `${platform.key}-players.svg`,
      `${platform.label} Players`,
      currentPlayers,
      platform.colors.players
    );

    await writeBadge(
      projectOutputDir,
      `${platform.key}-record-servers.svg`,
      `${platform.label} Record Servers`,
      recordServers,
      platform.colors.recordServers
    );

    await writeBadge(
      projectOutputDir,
      `${platform.key}-record-players.svg`,
      `${platform.label} Record Players`,
      recordPlayers,
      platform.colors.recordPlayers
    );
  }

  await writeFile(
    path.join(projectOutputDir, "bstats-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log("");
  console.log(`Generated summary for ${project.displayName}.`);
}

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });

  for (const project of PROJECTS) {
    await generateProject(project);
  }

  console.log("");
  console.log("All bStats badges generated successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
