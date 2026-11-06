// The News, the communities and the forums are the Rust front's (atome/servers/atome-server/src/social/news/):
// it answers their `/ws/api` families. Fastify's own uses — a scheduled publication, a file a News opened to
// its audience — reach it through SERVICE frames (`news:<operation>`); each recipient's notice it stored is
// carried here: to their live connections, else their queue, then pushed to their devices.
import { communicationPush } from './communication_push.js';
import { enqueuePendingConsoleMessage, wsSendJsonToUser } from './wsApiState.js';

export function createNewsService(vaultRouter) {
    const decided = async (operation, payload) => {
        const { result, notices } = await vaultRouter.provider.service(operation, payload);
        for (const notice of notices) {
            const { delivered } = wsSendJsonToUser(notice.target, notice.frame, { scope: 'ws/api', op: 'news', targetUserId: notice.target });
            if (!delivered) enqueuePendingConsoleMessage(notice.target, notice.frame);
        }
        for (const notice of notices) {
            // Its outcome reaches nobody: the notice is stored and delivered.
            if (notice.push) await communicationPush.deliver(notice.target, notice.push).catch(() => null);
        }
        return result;
    };
    return {
        // `ownerId`'s News `message` ({ publication, audience?, tags?, reply? }), as its `/ws/api` publish.
        publish: (ownerId, message) => decided('news:publish', { user: ownerId, message }),
        // The `news` file-read resolver: a News of `ownerId` reached `userId` with this file.
        canReadMedia: async (userId, atomeId, ownerId) => (await decided('news:can-read-media',
            { user: userId, atome_id: atomeId, owner_id: ownerId })) === true
    };
}
