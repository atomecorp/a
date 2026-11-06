// A person's correspondence is the Rust front's (atome/servers/atome-server/src/social/message_store.rs):
// each message an Atome of each participant's own vault, a conversation read from the vault with the
// media its messages carry. Fastify's services reach it through SERVICE frames on the supervisor's
// control socket (`messages:<operation>`).

// One message stored in `owner`'s vault as it is.
export const persistCommunicationMessage = (vaultRouter, owner, properties) =>
    vaultRouter.provider.service('messages:persist', { owner, properties });

// A page of `userId`'s conversation with the account `contactId` (`cursor`, `messageId`, `limit`, `listingId`).
export const readConversation = (vaultRouter, userId, data = {}) =>
    vaultRouter.provider.service('messages:read', { user: userId, data });
