import fs from 'node:fs';
import { chromium } from 'playwright';
import { waitFor } from './molecule_ui_acceptance_support.mjs';
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = {}; let eventId;
try {
    await page.goto('http://127.0.0.1:3001', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.AdoleAPI && window.__authCheckComplete, null, { timeout: 45000 });
    const loggedIn = await page.evaluate(async credentials => {
        const result = await window.AdoleAPI.auth.login(credentials.phone, credentials.password, credentials.phone);
        return result.success === true || result.fastify?.success === true;
    }, { phone: process.env.ATOME_TEST_PHONE, password: process.env.ATOME_TEST_PASSWORD });
    if (!loggedIn) throw Error('login_failed');
    await page.reload({ waitUntil: 'commit' });
    await waitFor(page, async () => {
        const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        return getMainMenuRuntime()?.measure()?.treeMounted && typeof window.Atome?.commit === 'function';
    }, null, 45000);
    report.alarm = await page.evaluate(async () => {
        const { CalendarAPI, closeCalendarPanel } = await import('/eVe/intuition/tools/calendar.js');
        await closeCalendarPanel();
        const result = await CalendarAPI.setAlarm({ title: 'Alarm live acceptance', delay_ms: 3000 });
        if (!result.ok) throw Error(result.error);
        return result;
    });
    eventId = report.alarm.eventId;
    await waitFor(page, async id => {
        const { CalendarAPI } = await import('/eVe/intuition/tools/calendar_api.js');
        const { isBevyPanelSurfaceOpen } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
        const event = await CalendarAPI.getEvent(id);
        return !!event?.alarms?.[0]?.firedAt && isBevyPanelSurfaceOpen('calendar');
    }, eventId, 20000);
    report.observed = await page.evaluate(async id => {
        const { CalendarAPI } = await import('/eVe/intuition/tools/calendar_api.js');
        const event = await CalendarAPI.getEvent(id);
        return { firedAt: event.alarms[0].firedAt, at: event.alarms[0].at, delay_ms: Date.parse(event.alarms[0].firedAt) - Date.parse(event.alarms[0].at) };
    }, eventId);
    await page.screenshot({ path: 'temp/calendar-alarm-live.png' });
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
    if (eventId) report.cleanup = await page.evaluate(async id => {
        const { CalendarAPI, closeCalendarPanel } = await import('/eVe/intuition/tools/calendar.js');
        await closeCalendarPanel(); return CalendarAPI.deleteEvent(id);
    }, eventId);
    fs.writeFileSync('temp/calendar-alarm-live.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); await browser.close();
}
