import fs from "node:fs";
import path from "node:path";

const STATE_PATH = path.resolve(process.cwd(), ".setup", "state.json");

export function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeState(nextState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2), "utf8");
  return STATE_PATH;
}

export { STATE_PATH };
