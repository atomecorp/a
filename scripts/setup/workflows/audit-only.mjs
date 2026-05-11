import fs from "node:fs";
import path from "node:path";
import { runPreflight } from "../steps/preflight.mjs";

export function runAuditOnlyWorkflow(context) {
  const { logger, platform } = context;
  logger.info("Running audit-only workflow");

  const preflight = runPreflight({ logger, platform });
  const hasPackageJson = fs.existsSync(path.resolve(process.cwd(), "package.json"));
  const hasNodeModules = fs.existsSync(path.resolve(process.cwd(), "node_modules"));
  const hasLockFile = fs.existsSync(path.resolve(process.cwd(), "package-lock.json"));

  logger.info(`package.json: ${hasPackageJson ? "present" : "missing"}`);
  logger.info(`node_modules: ${hasNodeModules ? "present" : "missing"}`);
  logger.info(`package-lock.json: ${hasLockFile ? "present" : "missing"}`);

  return {
    status: preflight.ok ? "ok" : "failed",
    preflight,
    inventory: {
      hasPackageJson,
      hasNodeModules,
      hasLockFile
    }
  };
}
