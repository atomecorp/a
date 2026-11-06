// The /ws/sync runtime is the Rust front's (atome/servers/atome-server/src/ws_sync):
// it holds the device connections, their subscriptions and replays. Fastify's services
// reach it through SERVICE frames on the supervisor's control socket (`sync:<operation>`)
// to deliver a committed event, a granted or revoked stream. The public directory's events are the
// front's own (social/directory/).
export class WsSyncRuntime {
    constructor({ provider }) {
        this.provider = provider;
    }

    ask(operation, payload = {}) {
        return this.provider.service(`sync:${operation}`, payload);
    }

    publish(event) {
        return this.ask('publish', { event });
    }

    replayPrincipalStream(principalId, stream) {
        return this.ask('replay-principal', { principal_id: String(principalId), stream: String(stream) });
    }

    grantStream(principalId, stream) {
        return this.ask('grant', { principal_id: String(principalId), stream: String(stream) });
    }

    revokeStream(principalId, stream) {
        return this.ask('revoke', { principal_id: String(principalId), stream: String(stream) });
    }

    snapshot() {
        return this.ask('snapshot');
    }
}

export const createWsSyncRuntime = (options) => new WsSyncRuntime(options);
