// Application Information
// Contains version and build information for Lyrix

export const APP_INFO = {
    name: 'Lyrix',
    version: '0.07',
    buildDate: '2025-08-13',
    description: 'Advanced Lyrics Display and Audio Synchronization Application',
    author: 'Atome Corporation',
    platform: 'Cross-platform (Web, Desktop, iOS)',
    features: [
        'Real-time lyrics synchronization',
        'Multi-format audio support',
        'MIDI control integration',
        'iOS AUv3 plugin support',
        'Cross-platform file management'
    ]
};

// Get formatted version string
export function getVersionString() {
    return `v${APP_INFO.version}`;
}

// Get full version info with build date
export function getFullVersionInfo() {
    return `${APP_INFO.name} ${getVersionString()} (${APP_INFO.buildDate})`;
}

// Get platform-specific version info
export function getPlatformVersionInfo() {
    const isIOS = typeof window !== 'undefined' && 
                  window.SQUIRREL_ENV && 
                  window.SQUIRREL_ENV.isIOS === true;
    
    const platform = isIOS ? 'iOS' : 'Web/Desktop';
    return `${getVersionString()} - ${platform}`;
}

// Get build information
export function getBuildInfo() {
    return {
        version: APP_INFO.version,
        buildDate: APP_INFO.buildDate,
        timestamp: new Date(APP_INFO.buildDate).getTime(),
        features: APP_INFO.features.length
    };
}

console.log(`🎵 ${getFullVersionInfo()} initialized`);
