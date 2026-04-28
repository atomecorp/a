import fs from 'node:fs';
import path from 'node:path';

import { createIcloudPreviousCalendarConnector } from '../src/squirrel/calendar/icloud_previous_connector.js';
import { selectIcloudAccount } from './icloud_account_discovery.mjs';
import {
    buildIcloudAuthUserCandidates,
    buildIcloudPasswordCandidates,
    readEnv,
    resolveIcloudCalendarCredentials
} from './icloud_live_credentials.mjs';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_icloud_calendar_live_smoke.json');

const writeReport = (report) => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const printUsage = () => {
    console.log([
        'Usage:',
        '  ICLOUD_EMAIL=... ICLOUD_APP_PASSWORD=... ICLOUD_CALENDAR_URL=... node scripts/phase9_icloud_calendar_live_smoke.mjs',
        '  ICLOUD_KEYCHAIN_ACCOUNT=... ICLOUD_CALENDAR_URL=... node scripts/phase9_icloud_calendar_live_smoke.mjs',
        '',
        'Optional:',
        '  ICLOUD_KEYCHAIN_ACCOUNT=user@icloud.com',
        '  ICLOUD_CALDAV_KEYCHAIN_SERVER=caldav.icloud.com',
        '  ICLOUD_CALENDAR_ID=...',
        '  ICLOUD_CALENDAR_LOOKBACK_DAYS=60',
        '  ICLOUD_CALENDAR_LOOKAHEAD_DAYS=365'
    ].join('\n'));
};

if (process.argv.includes('--help')) {
    printUsage();
    process.exit(0);
}

const credentials = resolveIcloudCalendarCredentials();
const discovered = selectIcloudAccount({
    accountHint: readEnv('ICLOUD_ACCOUNT_ID', 'ICLOUD_EMAIL', 'ICLOUD_KEYCHAIN_ACCOUNT')
});
const appPasswordCandidates = buildIcloudPasswordCandidates(credentials.appPassword);
const calendarUrl = readEnv('ICLOUD_CALENDAR_URL') || discovered?.calendar?.url || '';
const authCandidates = buildIcloudAuthUserCandidates({
    explicitEmail: credentials.email,
    discovered
});
const calendarUrlCandidates = Array.from(new Set([
    readEnv('ICLOUD_CALENDAR_URL'),
    'https://caldav.icloud.com',
    discovered?.calendar?.url
].filter(Boolean)));

if (!calendarUrlCandidates.length) {
    printUsage();
    throw new Error('icloud_calendar_live_smoke_missing_calendar_url');
}

const createConnector = (authUser, password, resolvedCalendarUrl) => createIcloudPreviousCalendarConnector({
    auth: {
        email: authUser,
        appPassword: password
    },
    calendar_url: resolvedCalendarUrl,
    calendar_id: readEnv('ICLOUD_CALENDAR_ID') || null,
    caldav: {
        lookback_days: readEnv('ICLOUD_CALENDAR_LOOKBACK_DAYS') ? Number(readEnv('ICLOUD_CALENDAR_LOOKBACK_DAYS')) : undefined,
        lookahead_days: readEnv('ICLOUD_CALENDAR_LOOKAHEAD_DAYS') ? Number(readEnv('ICLOUD_CALENDAR_LOOKAHEAD_DAYS')) : undefined
    }
});

try {
    let connector = null;
    let authUser = null;
    let authPassword = null;
    let resolvedCalendarUrl = null;
    let initial = null;
    const attempts = [];

    for (const candidate of authCandidates) {
        for (const password of appPasswordCandidates) {
            for (const url of calendarUrlCandidates) {
                const candidateConnector = createConnector(candidate, password, url);
                const candidateInitial = await candidateConnector.fetchInitialCalendar();
                attempts.push({
                    auth_user: candidate,
                    password_variant: password === credentials.appPassword ? 'raw' : (password.includes('-') ? 'trimmed' : 'normalized'),
                    calendar_url: url,
                    ok: candidateInitial?.ok === true,
                    error: candidateInitial?.ok === true ? null : (candidateInitial?.message || candidateInitial?.error || null)
                });
                if (candidateInitial?.ok === true) {
                    connector = candidateConnector;
                    authUser = candidate;
                    authPassword = password;
                    resolvedCalendarUrl = url;
                    initial = candidateInitial;
                    break;
                }
            }
            if (initial?.ok === true) break;
        }
        if (initial?.ok === true) break;
    }

    if (!initial || initial.ok !== true || !connector) {
        const lastAttempt = attempts[attempts.length - 1] || null;
        const error = new Error(lastAttempt?.error || 'icloud_calendar_live_initial_failed');
        error.details = {
            ok: false,
            error: 'icloud_calendar_live_all_auth_candidates_failed',
            attempts
        };
        throw error;
    }

    const listed = await connector.listEvents({
        autosync: false
    });
    if (!listed || listed.ok !== true) {
        const error = new Error(listed?.message || listed?.error || 'icloud_calendar_live_list_failed');
        error.details = listed;
        throw error;
    }

    const firstId = listed.items?.[0]?.id || null;
    const firstEvent = firstId ? await connector.getEvent(firstId) : null;
    const delta = await connector.fetchDelta({
        cursor: initial.cursor || null
    });
    if (!delta || delta.ok !== true) {
        const error = new Error(delta?.message || delta?.error || 'icloud_calendar_live_delta_failed');
        error.details = delta;
        throw error;
    }

    const report = {
        generated_at: new Date().toISOString(),
        ok: true,
        credentials_mode: credentials.mode,
        account_id: discovered?.account_id || null,
        auth_user: authUser,
        auth_candidates: authCandidates,
        app_password_variants: appPasswordCandidates.map((entry) => ({
            length: entry.length,
            normalized: !entry.includes('-') && !/\s/.test(entry)
        })),
        calendar_url: resolvedCalendarUrl,
        calendar_url_candidates: calendarUrlCandidates,
        provider: connector.provider,
        source_id: connector.source_id,
        auth_attempts: attempts,
        initial: {
            ok: initial.ok,
            cursor: initial.cursor || null,
            count: Array.isArray(initial.items) ? initial.items.length : 0
        },
        listed: {
            ok: listed.ok,
            count: Array.isArray(listed.items) ? listed.items.length : 0
        },
        first_event: firstEvent && firstEvent.ok === true
            ? {
                id: firstEvent.event?.id || null,
                title: firstEvent.event?.title || null,
                start: firstEvent.event?.start || null
            }
            : null,
        delta: {
            ok: delta.ok,
            cursor: delta.cursor || null,
            count: Array.isArray(delta.changes) ? delta.changes.length : Array.isArray(delta.items) ? delta.items.length : 0
        }
    };

    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
} catch (error) {
    const report = {
        generated_at: new Date().toISOString(),
        ok: false,
        credentials_mode: credentials.mode,
        account_id: discovered?.account_id || null,
        auth_candidates: authCandidates,
        app_password_variants: appPasswordCandidates.map((entry) => ({
            length: entry.length,
            normalized: !entry.includes('-') && !/\s/.test(entry)
        })),
        calendar_url_candidates: calendarUrlCandidates,
        provider: 'icloud_caldav_previous',
        source_id: 'icloud_previous',
        error: error?.message || String(error),
        details: error?.details || null
    };
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    throw error;
}
