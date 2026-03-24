import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';

import { createIcloudMailConnector } from './icloud_connector.js';

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDN7JvJ9VTHo9AI
LGZe0tQd8v6VkvHppUCB1on+1dW63U0TbIjwc0TwrvIi37hIpkQqgeXy1h3mXA4r
lG1/SKvxfhYN99/FM64qKgahDfNzTVGS5GTcUTcyJQuUUtkWupD8Yw2QJ3O1/Qdb
wMH8xKepPIprYn+7wv8k/zWGn1f88K1HoPe3PMRs7RLbIANZNxwzqWtnoYr5zr2w
QHzGQwzIzRK5ULLN8Be6m0BcW9ujco8bvMns7d1mlWQNWdoRoeLwgPgISQCbdy/V
HVzHZ7GSlzyeUJtAPanIAcI+rhdHpQpAUBi/DXzD0AWW/wj0Hq2MdVM9J7fJfj2Y
leeizpfHAgMBAAECggEABp0378eyfmsTjn+mlhsddwzMAo/it0d4h/MVIZtKryLW
i+4rg9Wf/D8SRe57o9G7VMYxVZhtA24nglzVG4aBB1Oub6prhJEBYhdReTDShfyQ
xzAQ0UbGiBTKh2wVzvYVHBYuZFfwDoNfDiJl2LGUVQo9w+84/RXpTg3ocTeDAvvF
P9RHnsSMMapO2HWnGWfMpSSiygXh0tNRkfzFlHNTZuZio/HHk7PYDhXqdSqohaL3
NghzzBj6IriwUIsidnX8dj4mtpAb0lAPfDdg9izLYApPSKJ0QXZfN6ZtejwqIfqQ
3Fx7M8gRKrQVAH5Yq8tqdTXAKwYQdci8Zqzxd2jwCQKBgQDyKnp4wGrj8cbxa9I4
7X11feeUAQpO5jZmRuBUVOGFg7UmziEk11aJ0zxeJB9SUd2TgsmwLRqTJbddaB5p
04Sups+GZ/16l82ISYmHGssOHRC3yOylcD0PuEgemeUOdaBJS60TwbyGTorPXuH4
YVvhnspGoRFnBB2UJgQZEKoFawKBgQDZsB5qKYNRb4jR7TyTM07d7icIkyRTtJio
feMRjV0rDuEB5BS8XJVy6e2YBj0Pi8a98E9tWowd5odPV9SNHVhRkbyEJXw+ky7Z
AkpbgVi119QxDCYxagMx1aLhtV5VTIWQUYJbq1CaqqERLZy9nVS0Qkl3x7gBQMsN
fJ8q1XfyFQKBgQC81aLqxiCT3tTjLNCg05AhLiyGnMkM/TcuSdZj7ExvcGSx/cqa
j9BLaQyJ3GEQMAY4IKRlXMZ8N8zkaWxN2UJ9blYk2LIwBm+e9rjnQV1VhBSlO2hN
GViECY8zTY3v2IlEnl44Kbp4gIZ9bd+Hb2PWa5wPt0l6qxrliz9mzDfIQQKBgQCc
C67RxS5YOw6mBVyt3FLFrgkXEXsx8byY05zpIR/PVNwgoeHnYKrU9DGYD6jHsxfl
YhVdu1HDwVPvoXNBMO71kfXD+KcGqDUl5Ilu7Nqth6iY/C+IrojZuV4IVB3qIW+B
E5zRn42pQXUyPjMkjVqB2R6XGXiilVK5OUNTzjAsPQKBgQDG40STdQ2VW+/tjLdy
cku6JmfsvHlDQr6MzPFziimU8gVLqxF0hp031YS72AYBidnbyhRch91ZMUSqh5ZT
9WcbvCBgFtYGMS2LrYEh98amipqM0217dINVqs/AvN0wfMXh5b90or0rXJnmjw+/
miUM293zC4OQsykh+TD8hFlv7g==
-----END PRIVATE KEY-----`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUB4z8BtCzrQCZfiC73j9dwIJI1VwwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDMxMzA4MTA1NloXDTI2MDMx
NDA4MTA1NlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAzeybyfVUx6PQCCxmXtLUHfL+lZLx6aVAgdaJ/tXVut1N
E2yI8HNE8K7yIt+4SKZEKoHl8tYd5lwOK5Rtf0ir8X4WDfffxTOuKioGoQ3zc01R
kuRk3FE3MiULlFLZFrqQ/GMNkCdztf0HW8DB/MSnqTyKa2J/u8L/JP81hp9X/PCt
R6D3tzzEbO0S2yADWTccM6lrZ6GK+c69sEB8xkMMyM0SuVCyzfAXuptAXFvbo3KP
G7zJ7O3dZpVkDVnaEaHi8ID4CEkAm3cv1R1cx2exkpc8nlCbQD2pyAHCPq4XR6UK
QFAYvw18w9AFlv8I9B6tjHVTPSe3yX49mJXnos6XxwIDAQABo1MwUTAdBgNVHQ4E
FgQUvyv+nUXwgNK0S+kjfjGRI25ROSgwHwYDVR0jBBgwFoAUvyv+nUXwgNK0S+kj
fjGRI25ROSgwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAg/xe
bNERaAUSi+fNjyJk8wi3orjPtkWOd61Rkl01LWyUfnM7EYxqQ5kvIW7gKdaYLy7C
Xx14PPyyiiFtc2z0JNhGPoA1LUUPD63oqQhes1byN2Nw8gCvb/bwWsbtQH0vcPyF
6amGW4TBK/2c4vN1VkCaKBnmb88/SkDg61k+4H01EiNSj8FpbhkghXTIceUkShBZ
9btB4DyeZZRmG+0PFlaE51YF7F/BTKcF9Zd7aeeyp11YSGl5Vm9tqaTQ7wAm8zIi
ZDK+FMTKh0O+MGmDhpoMA/NoAGH6AlpkSzccYm9AqU/VwgWcG4riKzFPvtH6tbuz
dS+A6GL1We8jxlWpyw==
-----END CERTIFICATE-----`;

const MAILBOX = {
    101: {
        flags: [],
        internalDate: '13-Mar-2026 08:00:00 +0000',
        raw: `Message-ID: <mail-node-101@example.test>\r
Subject: Bonjour local IMAP\r
From: Alice <alice@example.test>\r
To: <user@icloud.test>\r
Date: Fri, 13 Mar 2026 08:00:00 +0000\r
\r
Premier message local IMAP.\r
`
    },
    102: {
        flags: ['\\Seen'],
        internalDate: '13-Mar-2026 08:30:00 +0000',
        raw: `Message-ID: <mail-node-102@example.test>\r
Subject: Suivi local IMAP\r
From: Bob <bob@example.test>\r
To: <user@icloud.test>\r
Date: Fri, 13 Mar 2026 08:30:00 +0000\r
\r
Deuxieme message local IMAP.\r
`
    },
    103: {
        flags: [],
        internalDate: '13-Mar-2026 09:00:00 +0000',
        raw: `Message-ID: <mail-node-103@example.test>\r
Subject: Tu re=C3=A7ois mes mails ?=\r
From: Carol <carol@example.test>\r
To: <user@icloud.test>\r
Date: Fri, 13 Mar 2026 09:00:00 +0000\r
Content-Type: text/plain; charset=UTF-8\r
Content-Transfer-Encoding: quoted-printable\r
\r
Tu re=C3=A7ois mes mails ?=\r
`
    }
};

const listen = (server) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => {
        server.off('error', reject);
        resolve(server.address().port);
    });
});

const attachLineReader = (socket, onLine) => {
    let buffer = '';
    const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
            buffer = buffer.slice(newlineIndex + 1);
            onLine(line);
            newlineIndex = buffer.indexOf('\n');
        }
    };
    socket.on('data', onData);
    return () => socket.off('data', onData);
};

const createImapServer = (transcript) => tls.createServer({
    key: TEST_KEY,
    cert: TEST_CERT
}, (socket) => {
    socket.write('* OK local imap ready\r\n');
    const dispose = attachLineReader(socket, (line) => {
        transcript.push(line);
        const match = line.match(/^(\S+)\s+(.*)$/);
        if (!match) return;
        const tag = match[1];
        const command = match[2];
        if (/^LOGIN /i.test(command)) {
            socket.write(`${tag} OK LOGIN completed\r\n`);
            return;
        }
        if (/^(EXAMINE|SELECT) /i.test(command)) {
            const readOnly = /^EXAMINE /i.test(command);
            socket.write(`* 3 EXISTS\r\n* OK [UIDNEXT 104] next uid\r\n${tag} OK [${readOnly ? 'READ-ONLY' : 'READ-WRITE'}] ${readOnly ? 'EXAMINE' : 'SELECT'} completed\r\n`);
            return;
        }
        if (/^UID SEARCH ALL/i.test(command)) {
            socket.write(`* SEARCH 101 102\r\n${tag} OK SEARCH completed\r\n`);
            return;
        }
        if (/^UID SEARCH UID 103:\*/i.test(command)) {
            socket.write(`* SEARCH 103\r\n${tag} OK SEARCH completed\r\n`);
            return;
        }
        if (/^UID FETCH /i.test(command)) {
            const uidSet = command.match(/^UID FETCH ([^ ]+)/i)?.[1] || '';
            const uids = uidSet.split(',').map((entry) => Number(entry)).filter(Boolean);
            uids.forEach((uid, index) => {
                const item = MAILBOX[uid];
                if (!item) return;
                const literalLength = Buffer.byteLength(item.raw);
                const flags = item.flags.join(' ');
                socket.write(`* ${index + 1} FETCH (UID ${uid} FLAGS (${flags}) INTERNALDATE "${item.internalDate}" BODY[] {${literalLength}}\r\n${item.raw})\r\n`);
            });
            socket.write(`${tag} OK FETCH completed\r\n`);
            return;
        }
        if (/^UID MOVE /i.test(command)) {
            const destination = command.match(/^UID MOVE \d+ "([^"]+)"/i)?.[1] || '';
            if (destination === 'Archive' || destination === 'Trash') {
                socket.write(`${tag} NO Client tried to access nonexistent namespace. (Mailbox name should probably be prefixed with: INBOX.) (0.001 + 0.000 secs).\r\n`);
                return;
            }
            socket.write(`${tag} OK MOVE completed\r\n`);
            return;
        }
        if (/^UID COPY /i.test(command)) {
            const destination = command.match(/^UID COPY \d+ "([^"]+)"/i)?.[1] || '';
            if (destination === 'Archive' || destination === 'Trash') {
                socket.write(`${tag} NO Client tried to access nonexistent namespace. (Mailbox name should probably be prefixed with: INBOX.) (0.001 + 0.000 secs).\r\n`);
                return;
            }
            socket.write(`${tag} OK COPY completed\r\n`);
            return;
        }
        if (/^UID STORE /i.test(command)) {
            socket.write(`${tag} OK STORE completed\r\n`);
            return;
        }
        if (/^EXPUNGE/i.test(command)) {
            socket.write(`* 1 EXPUNGE\r\n${tag} OK EXPUNGE completed\r\n`);
            return;
        }
        if (/^LOGOUT/i.test(command)) {
            socket.write(`* BYE logout\r\n${tag} OK LOGOUT completed\r\n`);
            socket.end();
            return;
        }
        socket.write(`${tag} BAD unsupported\r\n`);
    });
    socket.on('close', () => dispose());
});

const createSmtpStartTlsServer = (transcript, delivered) => net.createServer((plainSocket) => {
    let socket = plainSocket;
    let disposeReader = null;
    let authStep = null;
    let dataMode = false;
    let dataLines = [];
    let upgraded = false;

    const attach = (currentSocket) => {
        disposeReader?.();
        socket = currentSocket;
        disposeReader = attachLineReader(currentSocket, (line) => {
            transcript.push(line);
            if (dataMode) {
                if (line === '.') {
                    const raw = dataLines.join('\r\n').replace(/\r\n\.\./g, '\r\n.');
                    delivered.push(raw);
                    dataLines = [];
                    dataMode = false;
                    socket.write('250 2.0.0 Ok: queued as <smtp-node-1@example.test>\r\n');
                    return;
                }
                dataLines.push(line);
                return;
            }

            if (/^EHLO /i.test(line)) {
                if (!upgraded) {
                    socket.write('250-localhost\r\n250-STARTTLS\r\n250-AUTH LOGIN\r\n250 OK\r\n');
                } else {
                    socket.write('250-localhost\r\n250-AUTH LOGIN\r\n250 OK\r\n');
                }
                return;
            }
            if (/^STARTTLS$/i.test(line)) {
                socket.write('220 Ready to start TLS\r\n');
                const tlsSocket = new tls.TLSSocket(plainSocket, {
                    isServer: true,
                    secureContext: tls.createSecureContext({
                        key: TEST_KEY,
                        cert: TEST_CERT
                    })
                });
                upgraded = true;
                attach(tlsSocket);
                return;
            }
            if (/^AUTH LOGIN$/i.test(line)) {
                authStep = 'username';
                socket.write('334 VXNlcm5hbWU6\r\n');
                return;
            }
            if (authStep === 'username') {
                authStep = 'password';
                socket.write('334 UGFzc3dvcmQ6\r\n');
                return;
            }
            if (authStep === 'password') {
                authStep = null;
                socket.write('235 2.7.0 Authentication successful\r\n');
                return;
            }
            if (/^MAIL FROM:/i.test(line)) {
                socket.write('250 2.1.0 Ok\r\n');
                return;
            }
            if (/^RCPT TO:/i.test(line)) {
                socket.write('250 2.1.5 Ok\r\n');
                return;
            }
            if (/^DATA$/i.test(line)) {
                dataMode = true;
                dataLines = [];
                socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
                return;
            }
            if (/^QUIT$/i.test(line)) {
                socket.write('221 2.0.0 Bye\r\n');
                socket.end();
            }
        });
    };

    plainSocket.write('220 localhost ESMTP ready\r\n');
    attach(plainSocket);
    plainSocket.on('close', () => disposeReader?.());
});

const imapTranscript = [];
const smtpTranscript = [];
const deliveredMessages = [];

const imapServer = createImapServer(imapTranscript);
const smtpServer = createSmtpStartTlsServer(smtpTranscript, deliveredMessages);

const imapPort = await listen(imapServer);
const smtpPort = await listen(smtpServer);

try {
    const connector = createIcloudMailConnector({
        auth: {
            email: 'user@icloud.test',
            app_password: 'app-password'
        },
        imap: {
            host: '127.0.0.1',
            port: imapPort,
            security: 'tls',
            rejectUnauthorized: false
        },
        smtp: {
            host: '127.0.0.1',
            port: smtpPort,
            security: 'starttls',
            rejectUnauthorized: false,
            client_hostname: 'localhost'
        }
    });

    const initial = await connector.fetchInitialMailbox({
        mailbox: 'inbox',
        limit: 10
    });
    assert.equal(initial.ok, true, 'node transport should fetch IMAP mail over TLS');
    assert.equal(initial.messages.length, 2, 'node transport should fetch the initial mailbox batch');
    assert.equal(initial.messages[0].message_id, '<mail-node-101@example.test>', 'node IMAP transport should parse RFC822 message ids');
    assert.equal(initial.cursor, '102', 'node IMAP transport should preserve the highest fetched UID as cursor');

    const delta = await connector.fetchDelta({
        mailbox: 'inbox',
        cursor: initial.cursor
    });
    assert.equal(delta.ok, true, 'node transport should fetch incremental IMAP delta over TLS');
    assert.equal(delta.messages.length, 1, 'node IMAP transport should only fetch UIDs after the cursor');
    assert.equal(delta.messages[0].message_id, '<mail-node-103@example.test>', 'node IMAP delta should parse the new message');
    assert.equal(delta.messages[0].subject, 'Tu reçois mes mails ?', 'node IMAP delta should decode loosely quoted-printable subjects');
    assert.equal(delta.messages[0].preview, 'Tu reçois mes mails ?', 'node IMAP delta should decode quoted-printable bodies for previews');
    assert.equal(delta.messages[0].body_text, 'Tu reçois mes mails ?', 'node IMAP delta should decode quoted-printable bodies');
    assert.equal(delta.cursor, '103', 'node IMAP delta should update the cursor to the newest UID');

    const archived = await connector.archiveMessage({
        mailbox: 'inbox',
        uid: '103'
    });
    assert.equal(archived.ok, true, 'node IMAP transport should archive messages even when the server requires an INBOX namespace prefix');
    assert.equal(archived.destination_remote_mailbox, 'INBOX.Archive', 'node IMAP transport should retry archive moves with the hinted namespace prefix');

    const deleted = await connector.deleteMessage({
        mailbox: 'inbox',
        uid: '103'
    });
    assert.equal(deleted.ok, true, 'node IMAP transport should delete messages even when the server requires an INBOX namespace prefix');
    assert.equal(deleted.destination_remote_mailbox, 'INBOX.Trash', 'node IMAP transport should retry delete moves with the hinted namespace prefix');

    const delivery = await connector.sendDraft({
        draft_id: 'mail_draft_node_protocol_1',
        in_reply_to: '<mail-node-103@example.test>',
        to: [{ address: 'carol@example.test', name: 'Carol' }],
        subject: 'Re: Delta local IMAP',
        body_text: 'Je te reponds demain.'
    }, {
        confirmed: true
    });
    assert.equal(delivery.ok, true, 'node transport should send mail over SMTP STARTTLS');
    assert.equal(delivery.remote_id, '<smtp-node-1@example.test>', 'node SMTP transport should surface the remote queue id');
    assert.equal(deliveredMessages.length, 1, 'node SMTP transport should deliver one message to the local mock server');
    assert.match(deliveredMessages[0], /In-Reply-To: <mail-node-103@example\.test>/, 'node SMTP transport should preserve reply threading headers');
    assert.match(deliveredMessages[0], /Je te reponds demain\./, 'node SMTP transport should deliver the draft body');

    assert.ok(imapTranscript.some((entry) => /UID SEARCH ALL/i.test(entry)), 'node IMAP transport should issue UID SEARCH ALL for the initial sync');
    assert.ok(imapTranscript.some((entry) => /UID SEARCH UID 103:\*/i.test(entry)), 'node IMAP transport should issue UID SEARCH by cursor for incremental sync');
    assert.ok(imapTranscript.some((entry) => /UID MOVE 103 "Archive"/i.test(entry)), 'node IMAP transport should first try the requested archive mailbox');
    assert.ok(imapTranscript.some((entry) => /UID MOVE 103 "INBOX\.Archive"/i.test(entry)), 'node IMAP transport should retry archive with the server namespace prefix when needed');
    assert.ok(imapTranscript.some((entry) => /UID MOVE 103 "Trash"/i.test(entry)), 'node IMAP transport should first try the requested trash mailbox');
    assert.ok(imapTranscript.some((entry) => /UID MOVE 103 "INBOX\.Trash"/i.test(entry)), 'node IMAP transport should retry delete with the server namespace prefix when needed');
    assert.ok(smtpTranscript.some((entry) => /^STARTTLS$/i.test(entry)), 'node SMTP transport should request STARTTLS before authentication');
} finally {
    await new Promise((resolve) => imapServer.close(() => resolve()));
    await new Promise((resolve) => smtpServer.close(() => resolve()));
}

console.log('mail_node_protocol_transport: ok');
