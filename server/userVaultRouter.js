import { createUserVaultProvider } from './userVaultProvider.js';

// Which vault holds what, and who may reach it through a share: the vault router of
// the Rust supervisor (atome/servers/atome-server/src/vault_router), asked through
// SERVICE frames. Fastify keeps the `/ws/api` envelope, the authentication and the
// post-commit effects; every decision on registries, shares and projections is the
// router's. `provider.request` stays the raw path to one's own vault.
export class UserVaultRouter {
    constructor(options = {}) {
        this.provider = options.provider || createUserVaultProvider(options);
    }

    ask(operation, payload) {
        return this.provider.service(`router:${operation}`, payload);
    }

    async provision(principalId) {
        const id = String(principalId || '').trim();
        if (!id) throw new Error('vault_principal_required');
        await this.ask('provision', { principal_id: id });
        return this.provider.ensure(id);
    }

    async vaultPrincipalForAtome(atomeId, defaultPrincipalId = null) {
        return (await this.ask('owner-of', { atome_id: atomeId ?? null })) || defaultPrincipalId;
    }

    registerAtome(atomeId, principalId) {
        return this.ask('register-atome', { atome_id: atomeId ?? null, principal_id: principalId });
    }

    commit(authenticatedPrincipalId, event, options = {}) {
        return this.ask('commit', { principal_id: authenticatedPrincipalId ?? null, event, options });
    }

    commitBatch(authenticatedPrincipalId, events, options = {}) {
        return this.ask('commit-batch', { principal_id: authenticatedPrincipalId ?? null, events: events || [], options });
    }

    // Objects of `ownerId`'s vault hosted by a teleport surface.
    teleportHostedAtomes(ownerId, surfaceId) {
        return this.ask('teleport-hosted', { owner_id: ownerId, surface_id: surfaceId });
    }

    // The Atomes of the owner's vault that describe these stored files (`files:described`).
    describeFiles(ownerId, fileNames) {
        return this.ask('describe-files', { owner_id: ownerId, file_names: fileNames });
    }

    getState(requestingPrincipalId, atomeId) {
        return this.ask('state-get', { principal_id: requestingPrincipalId, atome_id: atomeId ?? null });
    }

    listStates(requestingPrincipalId, options = {}) {
        return this.ask('state-list', { principal_id: requestingPrincipalId, options });
    }

    listEvents(requestingPrincipalId, options = {}) {
        return this.ask('events-list', { principal_id: requestingPrincipalId, options });
    }

    applyHistory(principalId, options = {}) {
        return this.ask('history-apply', { principal_id: principalId, options });
    }

    // A sync stream covers a whole project while a share covers a root: access comes from
    // the active shares naming the stream, then each event is filtered object by object.
    streamAccess(principalId, streamId) {
        return this.ask('stream-access', { principal_id: principalId, stream_id: streamId ?? null });
    }

    // The head sequence of every authorized stream of a subscription batch; the others are absent.
    async authorizedStreamHeads(principalId, streamIds = []) {
        const heads = await this.ask('stream-heads', { principal_id: principalId, stream_ids: streamIds.map(String) });
        return new Map(heads);
    }

    streamForAtome(ownerId, atomeId) {
        return this.ask('stream-of-atome', { owner_id: ownerId, atome_id: atomeId ?? null });
    }

    listAuthorizedStreams(principalId) {
        return this.ask('streams-authorized', { principal_id: principalId });
    }

    listShareStreams(principalId, shareId) {
        return this.ask('streams-of-share', { principal_id: principalId, share_id: shareId ?? null });
    }

    listStreamEvents(principalId, streamId, options = {}) {
        return this.ask('stream-events', { principal_id: principalId, stream_id: streamId ?? null, options });
    }

    streamHead(principalId, streamId) {
        return this.ask('stream-head', { principal_id: principalId, stream_id: streamId ?? null });
    }

    projectEventForPrincipal(principalId, event) {
        return this.ask('project-event', { principal_id: principalId, event });
    }

    shareForAtome(principalId, atomeId, ownerId = null) {
        return this.ask('share-for-atome', { principal_id: principalId, atome_id: atomeId ?? null, owner_id: ownerId });
    }

    // The states of `ownerId`'s vault under a shared root, none behind a private programme.
    statesWithinSharedRoot(ownerId, rootAtomeId) {
        return this.ask('states-within-share', { owner_id: ownerId, root_atome_id: rootAtomeId ?? null });
    }

    isWithinSharedRoot(ownerId, atomeId, rootAtomeId) {
        return this.ask('within-share', { owner_id: ownerId, atome_id: atomeId ?? null, root_atome_id: rootAtomeId ?? null });
    }

    // Whether the atome is a programme or lies under one (the News never carry a programme).
    hasPrivateProgramAncestor(ownerId, atomeId) {
        return this.ask('private-ancestor', { owner_id: ownerId, atome_id: atomeId ?? null });
    }

    // Whether the atome lies under a programme: a programme is shared as its plan alone, its interior stays its maker's.
    isWithinPrivateProgram(ownerId, atomeId) {
        return this.ask('program-interior', { owner_id: ownerId, atome_id: atomeId ?? null });
    }

    // A snapshot lies in the vault of the object it keeps; the router checks the sharer's rights.
    snapshot(principalId, action, request) {
        return this.ask('snapshot', { principal_id: principalId, action, request: request || {} });
    }

    async stopAll() {
        await this.provider.close();
    }
}

export const createUserVaultRouter = (options) => new UserVaultRouter(options);
