# PWA Packaging Guide

This guide explains how to produce a standalone Progressive Web App (PWA) package from the repository’s Squirrel-based application sources.

## 1. Prerequisites

- Node.js 18+ available in your PATH (the scripts use ES modules).
- The repository cloned locally.
- Optional: run the packaging script from the project root so relative paths resolve automatically.

## 2. Generate a package

### Fast path (default entry)

```bash
./package_app.sh
```

- Packages the default entry point `src/application/index.js`.
- Prompts you for the final package name (press Enter to reuse the default).

### CLI mode (custom entry or automation)

```bash
node scripts_utils/package-app.js \
  --source=/absolute/path/to/your/example.js \
  --name=my-pwa \
  --overwrite
```

- `--source` (optional): absolute path to the JavaScript entry file you want to load inside the PWA. Defaults to `src/application/index.js`.
- `--name` (optional): directory name created under `packages/`. Defaults to the entry file name (without extension).
- `--overwrite` (optional): skip the confirmation prompt if the target directory already exists.

## 3. Output structure

The script creates a directory at `packages/<name>/` containing:

- `index.html` — preconfigured shell that loads the Squirrel runtime and your application.
- `application/` — verbatim copy of `src/application` (keeps all relative imports intact).
- `js/`, `css/`, `assets/`, `squirrel/` — runtime dependencies copied from `src/`.
- `<entry>.js` — the entry file you selected.
- `manifest.json` — basic PWA manifest tailored to the package name.
- `service-worker.js` — cache bootstrapper registered on first load.

Example:

```text
packages/my-pwa/
├─ index.html
├─ manifest.json
├─ service-worker.js
├─ application/
├─ assets/
├─ css/
├─ js/
└─ squirrel/
```

## 4. Run the package locally

```bash
cd packages/my-pwa
npx http-server
```

- Open the reported URL (usually `http://127.0.0.1:8080`).
- Because the service worker is registered automatically, use a private window or clear site data when testing updates.

## 5. Deployment tips

- Serve the package over HTTPS (or localhost) to allow service worker installation.
- Upload the entire folder to your hosting target; make sure relative paths remain unchanged.
- When publishing updates, invalidate the browser cache if assets are aggressively cached by a CDN.

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Page still shows an old version | Clear the site data or unregister the service worker from DevTools → **Application** → **Service Workers**. |
| Blank screen on iOS only | Ensure the native host emits the `local-server-ready` event; the generated loader falls back to `squirrel:ready` after 900 ms. |
| Missing modules or assets | Confirm the entry file and its imports live within `src/application`; the script copies that directory verbatim into the package. |
| `ENOENT` errors during packaging | Double-check the path passed to `--source`; it must be absolute. |

## 7. Updating the packaging script

The generator lives in `scripts_utils/package-app.js`. If you need additional files copied or further customization, edit that script and regenerate your packages.
