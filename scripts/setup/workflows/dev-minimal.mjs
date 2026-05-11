import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runPreflight } from "../steps/preflight.mjs";

function runCommand(logger, command, args, options = {}) {
  logger.info(`Executing: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
  }
}

function ensureJsDependencies(logger) {
  const hasNodeModules = fs.existsSync(path.resolve(process.cwd(), "node_modules"));
  const hasLockFile = fs.existsSync(path.resolve(process.cwd(), "package-lock.json"));

  if (hasNodeModules) {
    logger.info("node_modules already present, skipping install");
    return;
  }

  if (hasLockFile) {
    logger.info("Installing dependencies with npm ci");
    runCommand(logger, "npm", ["ci"]);
    return;
  }

  logger.warn("package-lock.json missing, installing dependencies with npm install");
  runCommand(logger, "npm", ["install"]);
}

export function runDevMinimalWorkflow(context) {
  const { logger, platform, passthroughArgs } = context;
  logger.info("Running dev-minimal workflow");

  const preflight = runPreflight({ logger, platform });
  if (!preflight.ok) {
    return {
      status: "failed",
      preflight
    };
  }

  ensureJsDependencies(logger);

  const hasServerOnly = passthroughArgs.includes("--server");
  const hasTauriOnly = passthroughArgs.includes("--tauri");

  if (hasServerOnly) {
    runCommand(logger, "bash", ["scripts/run_fastify.sh"]);
  } else if (hasTauriOnly) {
    runCommand(logger, "bash", ["scripts/run_tauri.sh"]);
  } else {
    // Keep process behavior simple and explicit for now.
    runCommand(logger, "npm", ["run", "scan:components"]);
    runCommand(logger, "bash", ["scripts/run_fastify.sh"]);
  }

  return {
    status: "ok",
    preflight
  };
}
