// R-173: the CB recordings' key is born on the production host by server_update.js (phase cb-recordings-key): generated
// once into the env file (64 hex digits, mode 0600), never replaced, never logged.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureCbRecordingsKey } from '../../scripts/server_update.js';

const KEY = /^ATOME_CB_RECORDINGS_KEY=([0-9a-f]{64})$/m;
const dirs = [];
const envFile = (content) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-key-'));
    dirs.push(dir);
    const file = path.join(dir, 'squirrel.env');
    if (content !== null) fs.writeFileSync(file, content, { mode: 0o644 });
    return file;
};

describe('server_update cb-recordings-key', () => {
    afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

    it('generates the key once, keeps the other lines, leaves the file 0600 and never logs the key', () => {
        const file = envFile('PORT=3001\nJWT_SECRET=x'), said = [];
        expect(ensureCbRecordingsKey({ envFile: file, say: (line) => said.push(line) })).toBe('generated');
        const content = fs.readFileSync(file, 'utf8'), key = content.match(KEY)?.[1];
        expect(key).toBeTruthy();
        expect(content.startsWith('PORT=3001\nJWT_SECRET=x\nATOME_CB_RECORDINGS_KEY=')).toBe(true);
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        expect(said.join('\n')).not.toContain(key);
        // A second update keeps it as it is.
        expect(ensureCbRecordingsKey({ envFile: file, say: (line) => said.push(line) })).toBe('present');
        expect(fs.readFileSync(file, 'utf8')).toBe(content);
        expect(said.join('\n')).not.toContain(key);
    });

    it('never replaces a key already set, whatever it holds', () => {
        const file = envFile('ATOME_CB_RECORDINGS_KEY=already\nPORT=3001\n');
        expect(ensureCbRecordingsKey({ envFile: file, say: () => {} })).toBe('present');
        expect(fs.readFileSync(file, 'utf8')).toBe('ATOME_CB_RECORDINGS_KEY=already\nPORT=3001\n');
    });

    it('a commented line is no key, and two hosts never draw the same key', () => {
        const a = envFile('# ATOME_CB_RECORDINGS_KEY (64 hex digits) is generated on the host\n'), b = envFile(null);
        expect(ensureCbRecordingsKey({ envFile: a, say: () => {} })).toBe('generated');
        expect(ensureCbRecordingsKey({ envFile: b, say: () => {} })).toBe('generated');
        expect(fs.readFileSync(a, 'utf8').match(KEY)[1]).not.toBe(fs.readFileSync(b, 'utf8').match(KEY)[1]);
    });
});
