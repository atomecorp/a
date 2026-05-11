#!/usr/bin/env node
import { createLogger } from "../core/logger.mjs";
import { detectPlatform } from "../platform/detect.mjs";
import { listModeIds, resolveMode, runOrchestrator } from "../core/orchestrator.mjs";

function printHelp() {
  const modes = listModeIds();
  // eslint-disable-next-line no-console
  console.log(`Usage: ./run.sh [options]\n\nOptions:\n  --mode <id>      Select setup mode\n  --audit          Shortcut for --mode audit-only\n  --help           Show this help\n\nKnown modes:\n  ${modes.join("\n  ")}\n\nPass-through flags:\n  --server         Run only Fastify in dev-minimal mode\n  --tauri          Run only Tauri in dev-minimal mode`);
}

function parseArgs(argv) {
  const args = [...argv];
  let mode;
  let help = false;

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--help" || current === "-h") {
      help = true;
      continue;
    }
    if (current === "--audit") {
      mode = "audit-only";
      continue;
    }
    if (current === "--mode") {
      mode = args[i + 1];
      i += 1;
    }
  }

  return { mode, help, passthroughArgs: args };
}

function main() {
  const logger = createLogger();
  const { mode: requestedMode, help, passthroughArgs } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const platform = detectPlatform();
  logger.info(`Detected platform: ${platform.id}`);

  if (platform.id === "windows-native") {
    logger.error("Native Windows execution is disabled. Open a WSL terminal and run ./run.sh.");
    process.exit(1);
  }

  const mode = resolveMode(requestedMode);
  logger.info(`Selected mode: ${mode}`);

  const result = runOrchestrator({ mode, logger, platform, passthroughArgs });
  if (result.status !== "ok") {
    logger.error("Setup run failed");
    process.exit(1);
  }

  logger.success("Setup run completed successfully");
}

try {
  main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
