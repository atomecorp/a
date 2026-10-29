// The live send paths a scheduled send leaves by (server/scheduled_sends.js), run by the server in its
// owner's name: the News broadcast, a direct message (its attachments shared first, as the live send
// does in communication_events.js), the social publish prepared at its time, and the update of a post it published.
import { sendDirectMessage } from './wsCommunicationOperations.js';
import { resolveProviderCredentialVault } from './providerCredentialVault.js';
import { handleSocialAction, updateSocialPost } from './social/social_operations.js';
import { readSocialConfig } from './social/social_sessions.js';

export function createScheduledSendChannels({ newsBroadcast, syncSharingService, vaultRouter, relations, rateAllowed, deliver, enqueue }) {
    const newsPublish = (ownerId, news) => newsBroadcast.publish(ownerId, news);

    // `entry`: { toUserId | toPhone, message (the envelope text), share? (the share request of its attachments) }.
    const sendMessage = async (ownerId, entry) => {
        let message = entry.message;
        if (entry.share) {
            const shared = await syncSharingService.request(ownerId, { ...entry.share, targetUserId: entry.toUserId || null, targetPhone: entry.toPhone || null });
            const row = shared?.requests?.[0];
            if (!row) throw new Error('scheduled_share_failed');
            const envelope = JSON.parse(message);
            Object.assign(envelope.params, { kind: 'share-request', requestId: row.share_id, requestAtomeId: row.atome_id });
            message = JSON.stringify(envelope);
        }
        const sent = await sendDirectMessage({ userId: ownerId, data: { toUserId: entry.toUserId, toPhone: entry.toPhone, message },
            vaultRouter, relations, rateAllowed, deliver, enqueue });
        await sent.deliverPush();
        return { message_id: sent.result.message_id || null };
    };

    const socialEnv = async ownerId => ({ principal: ownerId, ctx: { vault: await resolveProviderCredentialVault(vaultRouter.provider, ownerId),
        config: readSocialConfig(), fetchImpl: globalThis.fetch } });
    const served = delivery => delivery.route === 'direct' || delivery.transfer === 'provider_inbox';
    // `social`: { content, destinations, options: { tiktok } }. Prepared at its time (the content as it stands then,
    // Q2), then published where the server reaches the network; a destination only the person can finish (the share
    // sheet, an export, copied text) is told as such, never left ready.
    const socialPublish = async (ownerId, social) => {
        const env = await socialEnv(ownerId);
        const prepared = await handleSocialAction('social.prepare', { content: social.content, destinations: social.destinations,
            handoff: { system_share: false } }, env);
        const direct = prepared.deliveries.filter(delivery => delivery.status !== 'failed' && served(delivery));
        const published = direct.length ? (await handleSocialAction('social.publish', { job_id: prepared.job_id,
            deliveries: direct.map(delivery => ({ id: delivery.destination,
                ...(delivery.network === 'tiktok' && delivery.route === 'direct' ? { options: social.options?.tiktok || {} } : {}) })) }, env)).deliveries : [];
        return prepared.deliveries.map(({ preview: _preview, ...delivery }) => published.find(entry => entry.destination === delivery.destination)
            || (delivery.status === 'failed' ? delivery : { ...delivery, status: 'failed', error: 'social_needs_person' }));
    };
    // `social`: { text, destinations }: each post its parent published takes the text, where its network edits one.
    const socialUpdate = async (ownerId, social, parentDeliveries) => {
        const env = await socialEnv(ownerId);
        return Promise.all(social.destinations.map(async (destination) => {
            const network = String(destination).split(':')[0];
            const parent = parentDeliveries.find(entry => entry.destination === destination && entry.status === 'published');
            try { await updateSocialPost({ destination, remote: parent?.remote, text: social.text }, env); return { destination, network, status: 'published' }; }
            catch (error) { return { destination, network, status: 'failed', error: error?.code || 'social_provider_unavailable' }; }
        }));
    };

    return { newsPublish, sendMessage, socialPublish, socialUpdate };
}
