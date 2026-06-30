import path from 'node:path';
import { chromium } from 'playwright';
import { runLargeReloadProbe } from './project_surface_reload_support.mjs';

await runLargeReloadProbe({
    browserType: chromium,
    browserName: 'chromium',
    reportDir: path.resolve('temp/probe_reports/project_surface_resize')
});
