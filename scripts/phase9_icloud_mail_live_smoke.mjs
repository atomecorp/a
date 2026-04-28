import fs from 'node:fs';
import path from 'node:path';

import { createIcloudMailConnector } from '../src/squirrel/mail/icloud_connector.js';
import { selectIcloudAccount } from './icloud_account_discovery.mjs';
import {
    boolEnv,
    buildIcloudAuthUserCandidates,
    buildIcloudPasswordCandidates,
    readEnv,
    resolveIcloudMailCredentials
} from './icloud_live_credentials.mjs';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_icloud_mail_live_smoke.json');

const writeReport = (report) => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const printUsage = () => {
    console.log([
        'Usage:',
        '  ICLOUD_EMAIL=... ICLOUD_APP_PASSWORD=... node scripts/phase9_icloud_mail_live_smoke.mjs',
        '  ICLOUD_KEYCHAIN_ACCOUNT=... node scripts/phase9_icloud_mail_live_smoke.mjs',
        '',
        'Optional:',
        '  ICLOUD_MAILBOX=INBOX',
        '  ICLOUD_IMAP_HOST=imap.mail.me.com',
        '  ICLOUD_IMAP_PORT=993',
        '  ICLOUD_SMTP_HOST=smtp.mail.me.com',
        '  ICLOUD_SMTP_PORT=587',
        '  ICLOUD_KEYCHAIN_ACCOUNT=user@icloud.com',
        '  ICLOUD_MAIL_SMOKE_ENABLE_SEND=1',
        '  ICLOUD_MAIL_SMOKE_SEND_TO=dest@example.com',
        '  ICLOUD_MAIL_SMOKE_SEND_TO_SELF=1'
    ].join('\n'));
};

if (process.argv.includes('--help')) {
    printUsage();
    process.exit(0);
}

const credentials = resolveIcloudMailCredentials();
const discovered = selectIcloudAccount({
    accountHint: readEnv('ICLOUD_ACCOUNT_ID', 'ICLOUD_EMAIL', 'ICLOUD_KEYCHAIN_ACCOUNT')
});
const appPasswordCandidates = buildIcloudPasswordCandidates(credentials.appPassword);
const mailbox = readEnv('ICLOUD_MAILBOX') || 'INBOX';
const authCandidates = buildIcloudAuthUserCandidates({
    explicitEmail: credentials.email,
    discovered
});
const imapHostCandidates = Array.from(new Set([
    readEnv('ICLOUD_IMAP_HOST'),
    'imap.mail.me.com',
    discovered?.mail?.imap_hostname
].filter(Boolean)));

const createConnector = (authUser, password, imapHost) => createIcloudMailConnector({
    auth: {
        email: authUser,
        app_password: password
    },
    mailbox,
    imap: {
        host: imapHost || undefined,
        port: readEnv('ICLOUD_IMAP_PORT') ? Number(readEnv('ICLOUD_IMAP_PORT')) : undefined
    },
    smtp: {
        host: readEnv('ICLOUD_SMTP_HOST') || discovered?.mail?.smtp_hostname || undefined,
        port: readEnv('ICLOUD_SMTP_PORT') ? Number(readEnv('ICLOUD_SMTP_PORT')) : undefined
    }
});

try {
    let connector = null;
    let authUser = null;
    let authPassword = null;
    let imapHost = null;
    let initial = null;
    const attempts = [];

    for (const candidate of authCandidates) {
        for (const password of appPasswordCandidates) {
            for (const host of imapHostCandidates) {
                const candidateConnector = createConnector(candidate, password, host);
                const candidateInitial = await candidateConnector.fetchInitialMailbox({
                    mailbox,
                    limit: 5
                });
                attempts.push({
                    auth_user: candidate,
                    password_variant: password === credentials.appPassword ? 'raw' : (password.includes('-') ? 'trimmed' : 'normalized'),
                    imap_host: host,
                    ok: candidateInitial?.ok === true,
                    error: candidateInitial?.ok === true ? null : (candidateInitial?.message || candidateInitial?.error || null)
                });
                if (candidateInitial?.ok === true) {
                    connector = candidateConnector;
                    authUser = candidate;
                    authPassword = password;
                    imapHost = host;
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
        const error = new Error(lastAttempt?.error || 'icloud_mail_live_initial_failed');
        error.details = {
            ok: false,
            error: 'icloud_mail_live_all_auth_candidates_failed',
            attempts
        };
        throw error;
    }

    const delta = await connector.fetchDelta({
        mailbox,
        cursor: initial.cursor || null,
        limit: 5
    });
    if (!delta || delta.ok !== true) {
        const error = new Error(delta?.message || delta?.error || 'icloud_mail_live_delta_failed');
        error.details = delta;
        throw error;
    }

    const sendEnabled = boolEnv('ICLOUD_MAIL_SMOKE_ENABLE_SEND');
    const sendTo = readEnv('ICLOUD_MAIL_SMOKE_SEND_TO')
        || (boolEnv('ICLOUD_MAIL_SMOKE_SEND_TO_SELF') ? authUser : '');

    let send = {
        attempted: false,
        skipped: true,
        reason: 'send_disabled'
    };

    if (sendEnabled && sendTo) {
        send = await connector.sendDraft({
            draft_id: `icloud_live_smoke_${Date.now()}`,
            subject: `Atum iCloud live smoke ${new Date().toISOString()}`,
            to: [{ address: sendTo }],
            body_text: 'Live SMTP smoke test triggered by Phase 9 release-readiness script.'
        }, {
            confirmed: true
        });
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
        imap_host: imapHost,
        imap_host_candidates: imapHostCandidates,
        provider: connector.provider,
        mailbox,
        auth_attempts: attempts,
        initial: {
            ok: initial.ok,
            cursor: initial.cursor || null,
            count: Array.isArray(initial.messages) ? initial.messages.length : 0,
            first_message_id: initial.messages?.[0]?.message_id || null
        },
        delta: {
            ok: delta.ok,
            cursor: delta.cursor || null,
            count: Array.isArray(delta.messages) ? delta.messages.length : 0
        },
        send: {
            attempted: sendEnabled && !!sendTo,
            skipped: !(sendEnabled && sendTo),
            result: send
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
        imap_host_candidates: imapHostCandidates,
        provider: 'icloud_imap_smtp',
        mailbox,
        error: error?.message || String(error),
        details: error?.details || null
    };
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    throw error;
}
