// The public directory is the Rust front's (atome/servers/atome-server/src/social/directory/): it
// projects each user's public card, tells the devices following `directory.public`, and answers the
// `/ws/api` `directory` family. Fastify's own uses reach it through SERVICE frames (`directory:<operation>`).
export function createDirectoryClient(vaultRouter) {
    const ask = (operation, payload) => vaultRouter.provider.service(operation, payload);
    return {
        // The principal's entry projected again from their profile (gone once `deleted`).
        refreshPrincipal: (principalId, options = {}) => ask('directory:refresh',
            { principal_id: String(principalId), deleted: options.deleted === true }),
        // The principal's card as the directory reads it ({ display_name, user_face, card, meeting, adult, public }), or null.
        sourceProfile: (principalId) => ask('directory:source-profile', { principal_id: String(principalId) })
    };
}
