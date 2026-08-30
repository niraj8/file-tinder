#!/usr/bin/env bun
import { stat } from "node:fs/promises";
import { parseArgs, USAGE } from "./src/cli";
import { startServer } from "./src/server";
import type { RunningServer } from "./src/server";

/**
 * How long to wait after the tab says it is going away before shutting down. A reload
 * is indistinguishable from a close at that moment, so this has to be long enough for
 * the reloaded page to come back and say otherwise.
 */
const QUIT_GRACE_MS = 15_000;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

let options;
try {
  options = parseArgs(argv);
} catch (error) {
  console.error(`file-tinder: ${(error as Error).message}\n\n${USAGE}`);
  process.exit(1);
}

const folderStat = await stat(options.folder).catch(() => null);
if (!folderStat?.isDirectory()) {
  console.error(`file-tinder: ${options.folder} is not a folder`);
  process.exit(1);
}

let server: RunningServer;
let shuttingDown = false;
let pendingShutdown: ReturnType<typeof setTimeout> | null = null;

async function shutdown(): Promise<never> {
  shuttingDown = true;
  await server.stop();
  process.exit(0);
}

/**
 * The tab reports its own disappearance, but a reload looks identical from here, so
 * wait for the reloaded page to ask for something before believing it.
 */
function onTabClosed(): void {
  if (shuttingDown || pendingShutdown !== null) return;
  pendingShutdown = setTimeout(() => void shutdown(), QUIT_GRACE_MS);
}

function onActivity(): void {
  if (pendingShutdown === null) return;
  clearTimeout(pendingShutdown);
  pendingShutdown = null;
}

try {
  server = startServer(options, { onQuit: onTabClosed, onActivity });
} catch (error) {
  console.error(`file-tinder: could not start a server — ${(error as Error).message}`);
  process.exit(1);
}

const url = `http://localhost:${server.port}`;
console.log(`file-tinder  ${options.folder}\n${url}\n\nCtrl-C to stop.`);
Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
