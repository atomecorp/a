import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve(process.cwd(), ".setup", "logs");

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

export function createLogger() {
  ensureLogDir();
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}_setup.log`);

  const write = (level, message) => {
    const line = `[${timestamp()}] [${level}] ${message}`;
    fs.appendFileSync(logFile, `${line}\n`, "utf8");
    // Keep stdout concise and deterministic.
    // eslint-disable-next-line no-console
    console.log(line);
  };

  return {
    info: (message) => write("INFO", message),
    warn: (message) => write("WARN", message),
    error: (message) => write("ERROR", message),
    success: (message) => write("SUCCESS", message),
    logFile
  };
}
