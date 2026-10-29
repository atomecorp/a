#!/usr/bin/env node
// The certificate and nginx host of a website's personal domain (decision Q13, todo/publication_web_2026-10-28.md), on
// the production server. `server/site_domains.js` runs it (ATOME_SITE_CERT_COMMAND) with the one domain whose DNS it
// has just verified. It checks again that the domain is a site's, with its proof (TXT) and its CNAME to atome, asks
// Let's Encrypt for its certificate (webroot: nginx keeps serving), writes the domain's nginx servers and reloads nginx.
// Renewal is certbot's own timer (the deploy hook reloads nginx). `--setup`, run once, installs the port-80 catch-all
// answering the challenges and the include of the domains' servers. The person never sees any of it.
// `--host <name>.atome.one <port>` gives one of atome.one's own names (the test server staging.atome.one on 3101)
// the same certificate and servers, proxying to that local port, once its DNS A record reaches this machine.
// Usage (root): site_domain_cert.mjs <domain> | --setup | --host <name>.atome.one <port>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { promises as dns } from 'node:dns';

const ROOT = '/opt/a'; // the production checkout (reference: scripts/server_update.js)
const WEBROOT = '/var/www/atome-acme';
const HOSTS_DIR = '/etc/nginx/atome-sites';
const SITE_FILE = '/etc/nginx/sites-available/atome-sites';
const ENABLED = '/etc/nginx/sites-enabled/atome-sites';
const APP = 'http://127.0.0.1:3001';

const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
const fail = (message) => { console.error(`[site-cert] ${message}`); process.exit(1); };
const reloadNginx = () => { run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']); };

const challenge = `    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type text/plain;
    }
`;
const catchAll = `# Personal domains of the atome.one websites (scripts/site_domain_cert.mjs): any other host on port 80 only
# answers Let's Encrypt's challenges; each connected domain has its own servers in ${HOSTS_DIR}.
server {
    listen 80 default_server;
    server_name _;
${challenge}    location / {
        return 404;
    }
}
include ${HOSTS_DIR}/*.conf;
`;
// The same proxying as atome.one's own server: the app routes a personal host to its site (server/site_http.js).
const hostServers = (domain, app = APP) => `# ${domain}: written by scripts/site_domain_cert.mjs
server {
    listen 80;
    server_name ${domain};
${challenge}    location / {
        return 301 https://$host$request_uri;
    }
}
server {
    listen 443 ssl;
    server_name ${domain};
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    location / {
        proxy_pass ${app};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

const setup = () => {
    fs.mkdirSync(WEBROOT, { recursive: true });
    fs.mkdirSync(HOSTS_DIR, { recursive: true });
    fs.writeFileSync(SITE_FILE, catchAll);
    if (!fs.existsSync(ENABLED)) fs.symlinkSync(SITE_FILE, ENABLED);
    try { reloadNginx(); } catch {
        fs.rmSync(ENABLED, { force: true });
        fail('nginx refused the catch-all; removed');
    }
};

// Only a domain the app stored for a site (its value passed the app's own check), never atome.one's own names.
const issue = async (domain) => {
    if (!/^[a-z0-9.-]+$/.test(domain) || domain === 'atome.one' || domain.endsWith('.atome.one')) fail(`refused: ${domain}`);
    if (!fs.existsSync(ENABLED)) fail('run --setup first');
    const Database = createRequire(path.join(ROOT, 'package.json'))('better-sqlite3');
    const db = new Database(path.join(ROOT, 'database_storage/adole.db'), { readonly: true, fileMustExist: true, timeout: 10_000 });
    const row = db.prepare('SELECT domain_token FROM site_publications WHERE domain = ?').get(domain);
    db.close();
    if (!row?.domain_token) fail(`not a site's domain: ${domain}`);
    const { SITE_CNAME_TARGET } = await import(path.join(ROOT, 'server/site_domains.js'));
    const txt = (await dns.resolveTxt(`_atome.${domain}`).catch(() => [])).map(parts => parts.join(''));
    const cname = (await dns.resolveCname(domain).catch(() => [])).map(name => name.toLowerCase().replace(/\.$/, ''));
    if (!txt.includes(`atome-verify=${row.domain_token}`) || !cname.includes(SITE_CNAME_TARGET)) fail(`DNS not verified: ${domain}`);
    certify(domain, APP);
};

// The certificate by webroot, then the domain's servers; nginx refusing them removes them.
const certify = (domain, app) => {
    run('certbot', ['certonly', '--webroot', '-w', WEBROOT, '-d', domain, '--cert-name', domain, '--non-interactive', '--agree-tos',
        '--keep-until-expiring', '--deploy-hook', 'systemctl reload nginx']);
    const file = path.join(HOSTS_DIR, `${domain}.conf`);
    fs.writeFileSync(file, hostServers(domain, app));
    try { reloadNginx(); } catch {
        fs.rmSync(file, { force: true });
        fail(`nginx refused the host of ${domain}; removed`);
    }
};

// One of atome.one's own names on a local port: its A record must already reach this machine (atome.one's own).
const issueHost = async (name, port) => {
    if (!/^[a-z0-9-]+\.atome\.one$/.test(name) || !/^\d{4,5}$/.test(port)) fail(`refused: ${name} ${port}`);
    if (!fs.existsSync(ENABLED)) fail('run --setup first');
    const here = await dns.resolve4('atome.one').catch(() => []);
    const there = await dns.resolve4(name).catch(() => []);
    if (!there.length || !there.every(ip => here.includes(ip))) fail(`DNS not pointing here: ${name}`);
    certify(name, `http://127.0.0.1:${port}`);
};

const [argument = '', ...rest] = process.argv.slice(2);
if (argument === '--setup') setup();
else if (argument === '--host') await issueHost(String(rest[0] || '').trim().toLowerCase(), String(rest[1] || ''));
else if (argument) await issue(argument.trim().toLowerCase());
else fail('usage: site_domain_cert.mjs <domain> | --setup | --host <name>.atome.one <port>');
