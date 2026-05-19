

const AUDIO_RELATIVE_PATH = './assets/audios/After The War.m4a';
const RIFF_RELATIVE_PATH = './assets/audios/riff.m4a';

// Fonction pour convertir le chemin selon l'environnement
function getAudioSrc(relativePath) {
    // En mode Tauri dev, les fichiers sont servis normalement depuis frontendDist
    // Pas besoin de convertFileSrc ou asset:// en dev mode
    // Il suffit d'encoder les caractères spéciaux dans chaque partie du chemin
    return relativePath.split('/').map(part => encodeURIComponent(part)).join('/');
}

const encodedPath = getAudioSrc(AUDIO_RELATIVE_PATH);
const encodedRiffPath = getAudioSrc(RIFF_RELATIVE_PATH);

puts(`Test Taurie Path — raw: ${AUDIO_RELATIVE_PATH}`);
puts(`Test Taurie Path — encoded: ${encodedPath}`);

puts(`Test Taurie Path — raw: ${RIFF_RELATIVE_PATH}`);
puts(`Test Taurie Path — encoded: ${encodedRiffPath}`);
const panel = $('section', {
    parent: '#view',
    css: {
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        color: '#fff'
    }
});

$('h1', {
    parent: panel,
    text: 'Test Tauri — Audio path'
});

$('code', {
    parent: panel,
    text: `encoded src: ${encodedPath}`,
    css: {
        display: 'block',
        background: '#1f2933',
        padding: '8px',
        borderRadius: '4px'
    }
});

$('audio', {
    parent: panel,
    attrs: {
        controls: 'controls',
        preload: 'metadata',
        src: encodedPath
    },
    css: {
        width: '100%'
    }
});

$('audio', {
    parent: panel,
    attrs: {
        controls: 'controls',
        preload: 'metadata',
        src: encodedRiffPath
    },
    css: {
        width: '100%'
    }
});
