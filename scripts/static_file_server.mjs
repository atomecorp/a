import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const requestedPort = Number(process.env.PORT || process.argv[2] || 8000);
const requestedDirectory = String(process.env.SERVE_DIR || process.argv[3] || ".");
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 8000;
const serveRoot = path.resolve(root, requestedDirectory);

if (!serveRoot.startsWith(root)) {
  throw new Error(`Refusing to serve outside repository root: ${serveRoot}`);
}

if (!fs.existsSync(serveRoot) || !fs.statSync(serveRoot).isDirectory()) {
  throw new Error(`Static server root does not exist: ${serveRoot}`);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
]);

function resolveRequestPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const cleanPath = decoded === "/" ? "/index.html" : decoded;
  const absolutePath = path.resolve(serveRoot, `.${cleanPath}`);
  if (!absolutePath.startsWith(serveRoot)) {
    return null;
  }
  return absolutePath;
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const absolutePath = resolveRequestPath(requestUrl.pathname);

  if (!absolutePath) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid path");
    return;
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("File not found");
    return;
  }

  const contentType = contentTypes.get(path.extname(absolutePath).toLowerCase()) || "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  fs.createReadStream(absolutePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${serveRoot} at http://127.0.0.1:${port}`);
});
