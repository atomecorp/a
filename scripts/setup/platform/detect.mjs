import os from "node:os";

export function detectPlatform() {
  const nodePlatform = process.platform;
  const release = os.release().toLowerCase();
  const isWsl = nodePlatform === "linux" && (release.includes("microsoft") || Boolean(process.env.WSL_DISTRO_NAME));

  if (nodePlatform === "darwin") {
    return { id: "macos", isWsl: false };
  }

  if (nodePlatform === "freebsd") {
    return { id: "freebsd", isWsl: false };
  }

  if (nodePlatform === "linux") {
    return { id: isWsl ? "wsl" : "linux", isWsl };
  }

  if (nodePlatform === "win32") {
    return { id: "windows-native", isWsl: false };
  }

  return { id: "unknown", isWsl: false };
}
