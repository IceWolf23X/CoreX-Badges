import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PROJECTS,
  createBadgeSvg,
  createIndexHtml,
  generateProject,
  getIntegrationUsage,
  parseIntegrationUsage
} from "./generate-bstats-badges.mjs";

/** Counts enabled integrations without adding disabled or proxy-managed backend instances. */
test("counts only Enabled and distinguishes a measured zero from missing data", () => {
  assert.deepEqual(parseIntegrationUsage([
    { name: "Enabled", y: 4 },
    { name: "Disabled", y: 8 },
    { name: "Managed by Velocity", y: 12 }
  ]), { status: "available", enabledServers: 4, reportedServers: 24 });
  assert.deepEqual(parseIntegrationUsage([{ name: "Disabled", y: 7 }]), {
    status: "available", enabledServers: 0, reportedServers: 7
  });
  assert.deepEqual(parseIntegrationUsage([]), {
    status: "no-data", enabledServers: null, reportedServers: 0
  });
  assert.deepEqual(parseIntegrationUsage([{ name: "Enabled", y: 0 }]), {
    status: "no-data", enabledServers: null, reportedServers: 0
  });
});

/** Rejects incompatible or malformed API values instead of publishing a fabricated zero. */
test("rejects invalid category counts and unknown categories", () => {
  for (const payload of [
    null, {}, [["Enabled", 4]], [{ name: "Enabled", y: "4" }],
    [{ name: "Enabled", y: -1 }], [{ name: "Enabled", y: 0.5 }],
    [{ name: "Enabled", y: null }], [{ name: "unknown", y: 3 }]
  ]) {
    assert.throws(() => parseIntegrationUsage(payload));
  }
});

/** Keeps an unregistered custom chart optional without suppressing mandatory server/player failures. */
test("returns unavailable for a missing custom chart", async (context) => {
  const urls = [];
  // Simulate the public API's not-found response without retry delays or external traffic.
  context.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return new Response("Not found", { status: 404 });
  });
  context.mock.method(console, "warn", () => {});
  const usage = await getIntegrationUsage(32163, "discord_integration");
  assert.equal(usage.status, "unavailable");
  assert.equal(usage.enabledServers, null);
  assert.equal(usage.reportedServers, null);
  assert.match(usage.error, /404/);
  assert.deepEqual(urls, ["https://bstats.org/api/v1/plugins/32163/charts/discord_integration/data"]);
});

/** Renders unavailable metrics explicitly while retaining ordinary numeric badge formatting. */
test("renders N/A and numeric zero as different badge values", () => {
  assert.match(createBadgeSvg("Discord servers", null, "#5865f2"), /DISCORD SERVERS: N\/A/);
  assert.match(createBadgeSvg("Discord servers", 0, "#5865f2"), /DISCORD SERVERS: 0/);
  assert.match(createBadgeSvg("Discord servers", 1234, "#5865f2"), /DISCORD SERVERS: 1,234/);
});

/** Generates the real CoreChatX artifact contract from deterministic public-API fixtures. */
test("generates three integration badges, summary metadata and catalogue links", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "corex-badges-test-"));
  // Delete only the newly created, verified task-owned temporary output directory.
  context.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("corex-badges-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  // Route each public endpoint to a local fixture; unexpected requests are test failures.
  context.mock.method(globalThis, "fetch", async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/charts")) {
      return Response.json({ servers: { title: "Servers" }, players: { title: "Players" } });
    }
    if (/\/charts\/(servers|players)\/data$/.test(pathname)) {
      return Response.json([[1_790_000_000_000, 2], [1_790_001_800_000, 3]]);
    }
    if (pathname.endsWith("/discord_integration/data")) {
      return Response.json([{ name: "Enabled", y: 4 }, { name: "Managed by Velocity", y: 9 }]);
    }
    if (pathname.endsWith("/telegram_integration/data")) {
      return Response.json([]);
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  });
  context.mock.method(console, "log", () => {});
  const project = PROJECTS.find(({ slug }) => slug === "corechatx");
  await generateProject(project, directory);
  const files = await readdir(path.join(directory, "corechatx"));
  assert.equal(files.length, 14);
  for (const name of ["paper-discord.svg", "paper-telegram.svg", "velocity-discord.svg"]) {
    assert.ok(files.includes(name));
  }
  assert.ok(!files.includes("velocity-telegram.svg"));
  assert.match(await readFile(path.join(directory, "corechatx/paper-discord.svg"), "utf8"), /DISCORD SERVERS: 4/);
  assert.match(await readFile(path.join(directory, "corechatx/paper-telegram.svg"), "utf8"), /TELEGRAM SERVERS: N\/A/);
  const summary = JSON.parse(await readFile(path.join(directory, "corechatx/bstats-summary.json"), "utf8"));
  assert.equal(summary.platforms.paper.servers.current, 3);
  assert.equal(summary.platforms.paper.servers.record, 5);
  assert.equal(summary.platforms.paper.integrations.discord.enabledServers, 4);
  assert.equal(summary.platforms.paper.integrations.telegram.status, "no-data");
  assert.equal(summary.platforms.paper.files.discordBadge, "paper-discord.svg");
  assert.equal(summary.platforms.velocity.integrations.discord.chartId, "discord_integration");
  const html = createIndexHtml(PROJECTS);
  assert.match(html, /corechatx\/paper-discord\.svg/);
  assert.match(html, /corechatx\/paper-telegram\.svg/);
  assert.match(html, /corechatx\/velocity-discord\.svg/);
  assert.doesNotMatch(html, /velocity-telegram\.svg|corearmorx\/paper-discord\.svg/);
});
