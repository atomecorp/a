export function buildDefaultServerConfig() {
    return {
        fastify: {
            host: '127.0.0.1',
            port: 3001,
            serverInfoPath: '/api/server-info',
            syncWsPath: '/ws/sync',
            apiWsPath: '/ws/api'
        },
        generated: true
    };
}
