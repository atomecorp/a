import crypto from 'node:crypto';
import { findBillingProduct } from '../../atome/src/shared/billing_contract.js';

// StoreKit 2 signed data (JWS, ES256) is trusted only through its x5c chain to
// Apple Root CA - G3, pinned here; the intermediate and leaf must carry Apple's
// receipt-signing OIDs. Development may add the Xcode StoreKit-testing
// certificate as a second root (`environment: 'Xcode'` only, never production).
export const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;
export const APPLE_BUNDLE_ID = 'one.atome.app';

// DER encodings of 1.2.840.113635.100.6.11.1 (receipt signing leaf) and
// 1.2.840.113635.100.6.2.1 (WWDR intermediate).
const LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');
const fail = (code = 'billing_proof_invalid') => { throw new Error(code); };

const decodeSegment = (segment) => {
    try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { return fail(); }
};
const certificate = (der) => {
    try { return new crypto.X509Certificate(Buffer.from(der, 'base64')); } catch { return fail(); }
};
const within = (cert, at) => Date.parse(cert.validFrom) <= at && at <= Date.parse(cert.validTo);

export function createAppleStoreVerifier({ bundleId = APPLE_BUNDLE_ID, appleRoot = APPLE_ROOT_CA_G3, xcodeRoot = null } = {}) {
    const apple = new crypto.X509Certificate(appleRoot);
    const xcode = xcodeRoot ? new crypto.X509Certificate(xcodeRoot) : null;

    // Returns the verified payload of one StoreKit JWS and the root that anchors it.
    function verifyJws(jws) {
        const parts = typeof jws === 'string' && jws.length < 65536 ? jws.split('.') : [];
        if (parts.length !== 3) fail();
        const header = decodeSegment(parts[0]);
        const payload = decodeSegment(parts[1]);
        if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 1 || header.x5c.length > 3) fail();
        const chain = header.x5c.map(certificate);
        const at = Number(payload.signedDate) || Date.now();
        const last = chain[chain.length - 1];
        const anchoredByApple = chain.length === 3 && last.fingerprint256 === apple.fingerprint256;
        const anchoredByXcode = Boolean(xcode) && last.fingerprint256 === xcode.fingerprint256;
        if (!anchoredByApple && !anchoredByXcode) fail('billing_proof_untrusted');
        for (let index = 0; index < chain.length; index++) {
            const issuer = chain[index + 1] || last;
            if (!within(chain[index], at) || !chain[index].checkIssued(issuer) || !chain[index].verify(issuer.publicKey)) fail('billing_proof_untrusted');
        }
        if (anchoredByApple && (!chain[0].raw.includes(LEAF_OID) || !chain[1].raw.includes(INTERMEDIATE_OID))) fail('billing_proof_untrusted');
        const signed = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
            { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
        if (!signed) fail('billing_proof_untrusted');
        // A transaction names its environment; a notification names it under `data`.
        const environment = payload.environment ?? payload.data?.environment;
        if (environment === 'Xcode' ? !anchoredByXcode : !anchoredByApple) fail('billing_proof_untrusted');
        return payload;
    }

    // A verified StoreKit 2 transaction, normalized for `applyPurchase`.
    function verifyTransaction(jws) {
        const tx = verifyJws(jws);
        const product = findBillingProduct(tx.productId);
        if (tx.bundleId !== bundleId || !product || typeof tx.transactionId !== 'string' || !tx.transactionId) fail();
        const periodStartMs = Number(tx.purchaseDate);
        const periodEndMs = Number(tx.expiresDate);
        if (product.kind === 'plan' && !(periodEndMs > periodStartMs)) fail('billing_period_invalid');
        return {
            source: 'apple', transactionId: tx.transactionId, originalTransactionId: tx.originalTransactionId || tx.transactionId,
            productId: tx.productId, periodStartMs: product.kind === 'plan' ? periodStartMs : null,
            periodEndMs: product.kind === 'plan' ? periodEndMs : null,
            accountToken: typeof tx.appAccountToken === 'string' ? tx.appAccountToken.toLowerCase() : null,
            revoked: Boolean(tx.revocationDate), environment: tx.environment
        };
    }

    // App Store Server Notifications v2: the outer payload and its transaction
    // are both signed; only the transaction drives the ledger.
    function verifyNotification(signedPayload) {
        const notice = verifyJws(signedPayload);
        if (notice.data?.bundleId !== bundleId) fail();
        return {
            type: String(notice.notificationType || ''), subtype: String(notice.subtype || ''),
            transaction: notice.data?.signedTransactionInfo ? verifyTransaction(notice.data.signedTransactionInfo) : null
        };
    }

    return { verifyTransaction, verifyNotification };
}
