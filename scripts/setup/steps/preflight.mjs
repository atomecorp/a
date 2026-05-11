import { spawnSync } from "node:child_process";

function hasCommand(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { stdio: "ignore", shell: false });
  return result.status === 0;
}

function readNodeMajor() {
  const version = process.versions.node || "0.0.0";
  return Number.parseInt(version.split(".")[0], 10) || 0;
}

export function runPreflight({ logger, platform }) {
  const checks = [];

  const nodeMajor = readNodeMajor();
  checks.push({
    id: "node",
    ok: nodeMajor >= 20,
    message: `Node.js detected: ${process.version} (required >= 20)`
  });

  checks.push({
    id: "npm",
    ok: hasCommand("npm"),
    message: "npm command must be available"
  });

  checks.push({
    id: "git",
    ok: hasCommand("git"),
    message: "git command should be available"
  });

  if (platform.id === "windows-native") {
    checks.push({
      id: "wsl",
      ok: false,
      message: "Windows native execution is not supported. Open a WSL terminal and run ./run.sh."
    });
  }

  checks.forEach((check) => {
    if (check.ok) {
      logger.success(`${check.id}: ${check.message}`);
    } else {
      logger.error(`${check.id}: ${check.message}`);
    }
  });

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}
