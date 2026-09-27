import crypto from 'node:crypto';

const API = 'https://eu.api.ovh.com/1.0';
const fail = (code) => { throw new Error(code); };

// This transport owns delivery only. It never creates an authentication proof.
export function createOvhSmsProvider({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
    const service = String(env.OVH_SMS_SERVICE_NAME || '').trim();
    const sender = String(env.OVH_SMS_SENDER || '').trim();
    const applicationKey = String(env.OVH_API_APPLICATION_KEY || '').trim();
    const applicationSecret = String(env.OVH_API_APPLICATION_SECRET || '').trim();
    const consumerKey = String(env.OVH_API_CONSUMER_KEY || '').trim();
    if (env.OVH_API_ENDPOINT !== 'ovh-eu' || !/^sms-[a-zA-Z0-9-]+$/.test(service)
        || !/^[a-zA-Z0-9]{1,11}$/.test(sender)
        || !applicationKey || !applicationSecret || !consumerKey) fail('sms_configuration_required');

    async function request(method, resource, payload) {
        const body = payload === undefined ? '' : JSON.stringify(payload);
        const url = `${API}${resource}`;
        try {
            const timeResponse = await fetchImpl(`${API}/auth/time`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
            if (!timeResponse.ok) fail('sms_provider_unavailable');
            const timestamp = await timeResponse.json();
            if (!Number.isSafeInteger(timestamp) || timestamp <= 0) fail('sms_provider_unavailable');
            const signature = '$1$' + crypto.createHash('sha1')
                .update([applicationSecret, consumerKey, method, url, body, timestamp].join('+')).digest('hex');
            const response = await fetchImpl(url, {
                method, redirect: 'error', signal: AbortSignal.timeout(15000),
                headers: {
                    'Content-Type': 'application/json', 'X-Ovh-Application': applicationKey,
                    'X-Ovh-Consumer': consumerKey, 'X-Ovh-Timestamp': String(timestamp), 'X-Ovh-Signature': signature
                },
                ...(body ? { body } : {})
            });
            // Provider bodies may contain recipients or message text. Never propagate them.
            if (!response.ok) fail(response.status === 401 || response.status === 403
                ? 'sms_provider_credentials_rejected' : 'sms_provider_rejected');
            return await response.json();
        } catch (error) {
            if (['sms_provider_credentials_rejected', 'sms_provider_rejected', 'sms_provider_unavailable'].includes(error.message)) throw error;
            // No retry: a timeout can occur after OVH has already accepted the SMS.
            fail('sms_delivery_uncertain');
        }
    }

    return {
        async sendValidationLink(phone, link) {
            if (!/^\+[1-9]\d{7,14}$/.test(phone)) fail('sms_recipient_invalid');
            const url = new URL(link);
            if (url.origin !== 'https://atome.one' || !/^\/auth\/v\/[A-Za-z0-9_-]{43}$/.test(url.pathname)
                || !/^#t=[A-Za-z0-9_-]{43}$/.test(url.hash) || url.search) fail('sms_link_invalid');
            const result = await request('POST', `/sms/${service}/jobs`, {
                charset: 'UTF-8', class: 'phoneDisplay', message: `atome - Validez votre connexion : ${link}`,
                noStopClause: true, priority: 'high', receivers: [phone], sender, senderForResponse: false
            });
            if (!Array.isArray(result?.validReceivers) || !result.validReceivers.includes(phone)
                || result.invalidReceivers?.length) fail('sms_provider_rejected');
            return { accepted: true, provider: 'ovhcloud', messageIds: result.ids || [],
                creditsRemoved: Number.isFinite(result.totalCreditsRemoved) ? result.totalCreditsRemoved : null };
        },
        async getAccountStatus() {
            const result = await request('GET', `/sms/${service}`);
            return { credits: Number.isFinite(result?.creditsLeft) ? result.creditsLeft : null };
        }
    };
}
