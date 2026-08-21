import path from 'node:path';
import { webkit } from 'playwright';
import { runLargeReloadProbe } from './project_surface_reload_support.mjs';

await runLargeReloadProbe({
    browserType: webkit,
    browserName: 'webkit',
    reportDir: path.resolve('temp/probe_reports/project_surface_safari_reload'),
    headless: process.env.ATOME_PLAYWRIGHT_HEADLESS === '1',
    resizeAfterReloadDiagnostic: true
});
