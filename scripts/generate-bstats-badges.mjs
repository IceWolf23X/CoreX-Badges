import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_ROOT = process.env.BADGE_OUTPUT_DIR || ".";

const BSTATS_API = "https://bstats.org/api/v1";

const CHART_DAYS = 7;

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

function normalizeTimestamp(value) {
  const number = toFiniteNumber(value);

  if (number === null) {
    return null;
  }

  // bStats usually returns millisecond timestamps.
  // This keeps the script safe if an endpoint ever returns seconds instead.
  if (number > 0 && number < 1_000_000_000_000) {
    return number * 1000;
  }

  return number;
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
      const timestamp = normalizeTimestamp(point[0]);
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

function filterRecentPoints(points, latestTimestamp, days) {
  const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
  const filtered = points.filter((point) => point.timestamp >= cutoff);

  // If the project is very new or the API returns sparse data, avoid an empty chart.
  return filtered.length >= 2 ? filtered : points;
}

function downsamplePoints(points, maxPoints = 220) {
  if (points.length <= maxPoints) {
    return points;
  }

  if (maxPoints < 3) {
    return points.slice(0, maxPoints);
  }

  const result = [points[0]];
  const bucketSize = (points.length - 2) / (maxPoints - 2);

  for (let i = 0; i < maxPoints - 2; i++) {
    const start = 1 + Math.floor(i * bucketSize);
    const end = 1 + Math.floor((i + 1) * bucketSize);
    const bucket = points.slice(start, Math.max(start + 1, end));

    const maxPoint = bucket.reduce((best, point) => {
      return point.value > best.value ? point : best;
    }, bucket[0]);

    result.push(maxPoint);
  }

  result.push(points.at(-1));

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function niceMaxValue(value) {
  if (value <= 10) {
    return 10;
  }

  if (value <= 50) {
    return Math.ceil(value / 10) * 10;
  }

  if (value <= 100) {
    return Math.ceil(value / 20) * 20;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  let niceNormalized;

  if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }

  return niceNormalized * magnitude;
}

function createLinePath(points, xScale, yScale) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xScale(point.timestamp).toFixed(2)},${yScale(point.value).toFixed(2)}`;
    })
    .join(" ");
}

function createAreaPath(points, xScale, yScale, chartBottom) {
  if (points.length === 0) {
    return "";
  }

  const first = points[0];
  const last = points.at(-1);
  const linePath = createLinePath(points, xScale, yScale);

  return [
    `M${xScale(first.timestamp).toFixed(2)},${chartBottom.toFixed(2)}`,
    linePath.replace(/^M/, "L"),
    `L${xScale(last.timestamp).toFixed(2)},${chartBottom.toFixed(2)}`,
    "Z"
  ].join(" ");
}

function createChartSvg({
  title,
  serverPoints,
  playerPoints,
  currentServers,
  currentPlayers
}) {
  const width = 980;
  const height = 360;

  const padding = {
    top: 58,
    right: 34,
    bottom: 76,
    left: 58
  };

  const chartLeft = padding.left;
  const chartRight = width - padding.right;
  const chartTop = padding.top;
  const chartBottom = height - padding.bottom;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  const sampledServers = downsamplePoints(serverPoints, 220);
  const sampledPlayers = downsamplePoints(playerPoints, 220);

  const allPoints = [...sampledServers, ...sampledPlayers];

  if (allPoints.length === 0) {
    throw new Error(`Cannot create chart "${title}" without data points`);
  }

  const minTimestamp = Math.min(...allPoints.map((point) => point.timestamp));
  const maxTimestamp = Math.max(...allPoints.map((point) => point.timestamp));

  const maxValueRaw = Math.max(1, ...allPoints.map((point) => point.value));
  const maxValue = niceMaxValue(maxValueRaw);

  const xScale = (timestamp) => {
    if (maxTimestamp === minTimestamp) {
      return chartLeft + chartWidth / 2;
    }

    return chartLeft + ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp)) * chartWidth;
  };

  const yScale = (value) => {
    return chartBottom - (value / maxValue) * chartHeight;
  };

  const serverPath = createLinePath(sampledServers, xScale, yScale);
  const playerLinePath = createLinePath(sampledPlayers, xScale, yScale);
  const playerAreaPath = createAreaPath(sampledPlayers, xScale, yScale, chartBottom);

  const yTickCount = 4;
  const yGrid = Array.from({ length: yTickCount + 1 }, (_, index) => {
    const value = Math.round((maxValue / yTickCount) * index);
    const y = yScale(value);

    return `
      <line x1="${chartLeft}" y1="${y.toFixed(2)}" x2="${chartRight}" y2="${y.toFixed(2)}" stroke="#343946" stroke-width="1"/>
      <text
        x="${chartLeft - 12}"
        y="${(y + 4).toFixed(2)}"
        text-anchor="end"
        fill="#a1a1aa"
        font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
        font-size="12"
      >${value}</text>
    `;
  }).join("");

  const xTickCount = 5;
  const xGrid = Array.from({ length: xTickCount }, (_, index) => {
    const ratio = xTickCount === 1 ? 0 : index / (xTickCount - 1);
    const timestamp = minTimestamp + (maxTimestamp - minTimestamp) * ratio;
    const x = xScale(timestamp);

    return `
      <line x1="${x.toFixed(2)}" y1="${chartTop}" x2="${x.toFixed(2)}" y2="${chartBottom}" stroke="#292e3a" stroke-width="1"/>
      <text
        x="${x.toFixed(2)}"
        y="${chartBottom + 30}"
        text-anchor="middle"
        fill="#a1a1aa"
        font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
        font-size="12"
      >${escapeXml(formatShortDate(timestamp))}</text>
    `;
  }).join("");

  const safeTitle = escapeXml(title);
  const safeServers = escapeXml(formatNumber(currentServers));
  const safePlayers = escapeXml(formatNumber(currentPlayers));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle} bStats chart">
  <title>${safeTitle} bStats chart</title>

  <defs>
    <linearGradient id="playersFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fb7185" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="#ef4444" stop-opacity="0.28"/>
    </linearGradient>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <clipPath id="chartClip">
      <rect x="${chartLeft}" y="${chartTop}" width="${chartWidth}" height="${chartHeight}"/>
    </clipPath>
  </defs>

  <rect width="${width}" height="${height}" fill="#18181b"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="#20232a" stroke="#343946" stroke-width="1"/>

  <text
    x="${width / 2}"
    y="36"
    text-anchor="middle"
    fill="#f4f4f5"
    font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
    font-size="22"
    font-weight="700"
  >${safeTitle}</text>

  <g>
    ${yGrid}
    ${xGrid}
  </g>

  <g clip-path="url(#chartClip)">
    <path d="${playerAreaPath}" fill="url(#playersFill)"/>
    <path d="${playerLinePath}" fill="none" stroke="#fb7185" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

    <path d="${serverPath}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#softGlow)"/>
  </g>

  <rect x="${chartLeft}" y="${chartTop}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#4b5563" stroke-width="1"/>

  <g transform="translate(${width / 2 - 128}, ${height - 30})">
    <circle cx="0" cy="0" r="8" fill="#38bdf8" stroke="#7dd3fc" stroke-width="2"/>
    <text
      x="16"
      y="4"
      fill="#f4f4f5"
      font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
      font-size="13"
    >${safeServers} Servers</text>

    <circle cx="130" cy="0" r="8" fill="#fb7185" stroke="#fecdd3" stroke-width="2"/>
    <text
      x="146"
      y="4"
      fill="#f4f4f5"
      font-family="Verdana, Geneva, DejaVu Sans, sans-serif"
      font-size="13"
    >${safePlayers} Players</text>
  </g>
</svg>
`;
}

async function writeChart(outputDir, fileName, chartOptions) {
  const svg = createChartSvg(chartOptions);
  const filePath = path.join(outputDir, fileName);

  await writeFile(filePath, svg, "utf8");
  console.log(`Generated ${filePath}`);
}

async function generateProject(project) {
  const projectOutputDir = path.join(OUTPUT_ROOT, project.slug);

  await mkdir(projectOutputDir, { recursive: true });

  const summary = {
    project: project.displayName,
    slug: project.slug,
    generatedAt: new Date().toISOString(),
    chartDays: CHART_DAYS,
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

    const latestTimestamp = Math.max(
      serverPoints.at(-1).timestamp,
      playerPoints.at(-1).timestamp
    );

    const chartServerPoints = filterRecentPoints(
      serverPoints,
      latestTimestamp,
      CHART_DAYS
    );

    const chartPlayerPoints = filterRecentPoints(
      playerPoints,
      latestTimestamp,
      CHART_DAYS
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
    console.log(`Chart server points: ${chartServerPoints.length}`);
    console.log(`Chart player points: ${chartPlayerPoints.length}`);

    summary.platforms[platform.key] = {
      label: platform.label,
      bstatsUrl: platform.bstatsUrl,
      files: {
        serversBadge: `${platform.key}-servers.svg`,
        playersBadge: `${platform.key}-players.svg`,
        recordServersBadge: `${platform.key}-record-servers.svg`,
        recordPlayersBadge: `${platform.key}-record-players.svg`,
        chart: `${platform.key}-chart.svg`
      },
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
      },
      chart: {
        days: CHART_DAYS,
        serverPoints: chartServerPoints.length,
        playerPoints: chartPlayerPoints.length
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

    await writeChart(
      projectOutputDir,
      `${platform.key}-chart.svg`,
      {
        title: `${project.displayName} ${platform.label}`,
        serverPoints: chartServerPoints,
        playerPoints: chartPlayerPoints,
        currentServers,
        currentPlayers
      }
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
  console.log("All bStats badges and charts generated successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
