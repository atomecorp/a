const toText = (value) => String(value || '').trim();

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) {
        return env.window[key];
    }
    return null;
};

const resolveProfileLoader = (env = globalThis) => {
    const explicitLoader = readEnv(env, '__atomeLoadUserProfile')
        || readEnv(env, '__eveLoadUserProfile')
        || readEnv(env, '__SQUIRREL_LOAD_USER_PROFILE__');
    if (typeof explicitLoader === 'function') return explicitLoader;

    const profileApi = readEnv(env, 'AtomeProfile')
        || readEnv(env, 'Squirrel')?.profile
        || readEnv(env, 'atome')?.profile
        || null;
    if (typeof profileApi?.loadUserProfile === 'function') {
        return profileApi.loadUserProfile.bind(profileApi);
    }
    if (typeof profileApi?.load === 'function') {
        return profileApi.load.bind(profileApi);
    }
    return null;
};

export const loadRuntimeUserProfile = async ({
    env = globalThis
} = {}) => {
    const loader = resolveProfileLoader(env);
    if (!loader) {
        return {
            ok: false,
            error: 'profile_loader_unavailable'
        };
    }
    const result = await loader();
    if (!result || typeof result !== 'object') {
        return {
            ok: false,
            error: 'profile_loader_invalid_result'
        };
    }
    if (result.ok === false) {
        return {
            ok: false,
            error: toText(result.error) || 'profile_loader_failed'
        };
    }
    return result.ok === true ? result : {
        ok: true,
        profile: result.profile && typeof result.profile === 'object' ? result.profile : result
    };
};
