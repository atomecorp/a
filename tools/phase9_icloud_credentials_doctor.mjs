import fs from 'node:fs';
import path from 'node:path';

import { probeKeychainPassword, readEnv } from './icloud_live_credentials.mjs';
import { selectIcloudAccount } from './icloud_account_discovery.mjs';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_icloud_credentials_doctor.json');

const discovered = selectIcloudAccount({
    accountHint: readEnv('ICLOUD_ACCOUNT_ID', 'ICLOUD_EMAIL', 'ICLOUD_KEYCHAIN_ACCOUNT')
});

const envPresence = {
    icloud_account_id: !!readEnv('ICLOUD_ACCOUNT_ID'),
    icloud_email: !!readEnv('ICLOUD_EMAIL', 'ICLOUD_MAIL_EMAIL', 'ICLOUD_CALENDAR_EMAIL'),
    icloud_app_password: !!readEnv('ICLOUD_APP_PASSWORD', 'ICLOUD_MAIL_APP_PASSWORD', 'ICLOUD_CALENDAR_APP_PASSWORD'),
    icloud_calendar_url: !!readEnv('ICLOUD_CALENDAR_URL'),
    icloud_keychain_account: !!readEnv('ICLOUD_KEYCHAIN_ACCOUNT', 'ICLOUD_MAIL_KEYCHAIN_ACCOUNT', 'ICLOUD_CALENDAR_KEYCHAIN_ACCOUNT')
};

const discoveredKeychainProbe = discovered?.mail?.email && discovered?.mail?.imap_hostname
    ? probeKeychainPassword({
        account: discovered.mail.email,
        server: discovered.mail.imap_hostname,
        protocol: 'imap'
    })
    : { ok: false, error: 'no_discovered_mail_keychain_probe_target' };

const discoveredMailReady = !!discovered?.mail?.email;
const discoveredCalendarReady = !!discovered?.calendar?.url;
const envPlusDiscoveryReady = envPresence.icloud_app_password && discoveredMailReady;

const mailReady = (
    (envPresence.icloud_email && envPresence.icloud_app_password)
    || envPresence.icloud_keychain_account
    || discoveredKeychainProbe.ok === true
    || envPlusDiscoveryReady
);

const calendarReady = (
    ((envPresence.icloud_email && envPresence.icloud_app_password) || envPresence.icloud_keychain_account || discoveredKeychainProbe.ok === true || envPlusDiscoveryReady)
    && (envPresence.icloud_calendar_url || discoveredCalendarReady)
);

const report = {
    generated_at: new Date().toISOString(),
    discovered_account: discovered ? {
        account_id: discovered.account_id,
        mail_email: discovered.mail?.email || null,
        imap_host: discovered.mail?.imap_hostname || null,
        smtp_host: discovered.mail?.smtp_hostname || null,
        calendar_url: discovered.calendar?.url || null
    } : null,
    discovered_keychain_probe: discoveredKeychainProbe,
    environment: envPresence,
    mail_live_smoke_ready: mailReady,
    calendar_live_smoke_ready: calendarReady,
    blockers: [
        ...(!mailReady ? ['missing_mail_credentials'] : []),
        ...(!(envPresence.icloud_calendar_url || discoveredCalendarReady) ? ['missing_calendar_url'] : []),
        ...(!calendarReady && (envPresence.icloud_calendar_url || discoveredCalendarReady) && !mailReady ? ['missing_calendar_credentials'] : [])
    ],
    next_commands: {
        mail: discovered
            ? `ICLOUD_ACCOUNT_ID="${discovered.account_id}" ICLOUD_APP_PASSWORD="app-password" node tools/phase9_icloud_mail_live_smoke.mjs`
            : 'ICLOUD_EMAIL="user@icloud.com" ICLOUD_APP_PASSWORD="app-password" node tools/phase9_icloud_mail_live_smoke.mjs',
        calendar: discovered
            ? `ICLOUD_ACCOUNT_ID="${discovered.account_id}" ICLOUD_APP_PASSWORD="app-password" node tools/phase9_icloud_calendar_live_smoke.mjs`
            : 'ICLOUD_EMAIL="user@icloud.com" ICLOUD_APP_PASSWORD="app-password" ICLOUD_CALENDAR_URL="https://caldav.icloud.com/..." node tools/phase9_icloud_calendar_live_smoke.mjs'
    }
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
