import fs from "node:fs";
import path from "node:path";
import { readState, writeState } from "./state-store.mjs";
import { runAuditOnlyWorkflow } from "../workflows/audit-only.mjs";
import { runDevMinimalWorkflow } from "../workflows/dev-minimal.mjs";

function readModes() {
  const modesPath = path.resolve(process.cwd(), "scripts", "setup", "config", "modes.json");
  return JSON.parse(fs.readFileSync(modesPath, "utf8"));
}

export function listModeIds() {
  const config = readModes();
  return config.modes.map((mode) => mode.id);
}

export function resolveMode(requestedMode) {
  const config = readModes();
  const known = new Set(config.modes.map((mode) => mode.id));
  const mode = requestedMode || config.defaultMode;

  if (!known.has(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  return mode;
}

export function runOrchestrator({ mode, logger, platform, passthroughArgs }) {
  const startedAt = new Date().toISOString();
  const previousState = readState();

  let result;
  if (mode === "audit-only") {
    result = runAuditOnlyWorkflow({ logger, platform, passthroughArgs });
  } else {
    result = runDevMinimalWorkflow({ logger, platform, passthroughArgs });
  }

  const nextState = {
    ...previousState,
    lastRun: {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode,
      platform,
      status: result.status
    }
  };

  const statePath = writeState(nextState);
  logger.info(`State written to ${statePath}`);

  return result;
}
