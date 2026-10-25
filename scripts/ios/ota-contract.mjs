import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * @typedef {Object} OtaRelease
 * @property {string} id Immutable UUID, used for staged and published artifacts.
 * @property {string} version CFBundleShortVersionString shared by app/AUv3.
 * @property {string} build Integer CFBundleVersion shared by both channels.
 * @property {string} team Verified Apple Developer team identifier.
 * @property {string} sha256 SHA-256 of the exact exported IPA bytes.
 * @property {number} size Exported IPA byte count.
 * @property {'verified'} signature Build-Mac signature/provisioning attestation.
 * @property {Array<{bundle:string,profile:string,expires:string,deviceCount:number}>} products
 */

export const DOWNLOAD_TTL_MS = 2 * 60 * 60 * 1000;
// One install URL for every release: the manifest is resolved when iOS fetches it.
export const CURRENT_MANIFEST_PATH = '/ios/current/manifest.plist';
export const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);

export function manifest(report, ipaUrl) {
    if (!validId(report.id) || !/^\d+(\.\d+)+$/.test(report.version) || !/^\d+$/.test(report.build)
        || new URL(ipaUrl).protocol !== 'https:') throw new Error('invalid_manifest_input');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${xml(ipaUrl)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>one.atome.app</string>
<key>bundle-version</key><string>${xml(report.build)}</string><key>kind</key><string>software</string>
<key>title</key><string>atome</string></dict></dict></array></dict></plist>\n`;
}

export function issueCapability(secret, payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

// A capability without `id` opens only the current-release manifest; the IPA
// URL in that manifest carries a capability bound to the served release id.
export function verifyCapability(secret, token, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 2048) throw new Error('invalid_capability');
    const [body, mac, extra] = token.split('.');
    if (!body || !mac || extra) throw new Error('invalid_capability');
    const expected = createHmac('sha256', secret).update(body).digest();
    const actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('invalid_capability');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if ((payload.id !== undefined && !validId(payload.id)) || !/^[a-f0-9]{64}$/.test(payload.user) || !Number.isSafeInteger(payload.expires)
        || payload.expires <= now || payload.expires > now + DOWNLOAD_TTL_MS) throw new Error('expired_capability');
    return payload;
}
