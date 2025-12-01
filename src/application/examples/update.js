/**
 * Atome Update Button
 * 
 * Bouton de mise à jour du core Squirrel/Atome depuis GitHub
 * Utilise l'API update_atome.js
 */

// Charger l'API de mise à jour
await import('../../squirrel/apis/update_atome.js');

// État local
const updateState = {
    checking: false,
    updating: false,
    lastCheckResult: null,
    progressValue: 0,
    progressMessage: ''
};

// Conteneur principal
const updateContainer = $('div', {
    id: 'atome-update-container',
    css: {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        zIndex: '9999'
    }
});

// Panneau de progression (caché par défaut)
let progressPanel = null;

/**
 * Affiche le panneau de progression
 */
function showProgressPanel() {
    if (progressPanel) return;

    progressPanel = $('div', {
        id: 'update-progress-panel',
        css: {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1a1a2e',
            border: '2px solid #4a9eff',
            borderRadius: '16px',
            padding: '24px 32px',
            minWidth: '400px',
            maxWidth: '500px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: '10001'
        }
    });

    // Titre
    $('div', {
        parent: progressPanel,
        id: 'update-title',
        css: {
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#4a9eff',
            marginBottom: '16px',
            textAlign: 'center'
        },
        text: '🔄 Mise à jour Atome'
    });

    // Message
    $('div', {
        parent: progressPanel,
        id: 'update-message',
        css: {
            fontSize: '14px',
            color: '#ccc',
            marginBottom: '16px',
            textAlign: 'center'
        },
        text: 'Préparation...'
    });

    // Barre de progression
    const progressBarContainer = $('div', {
        parent: progressPanel,
        css: {
            width: '100%',
            height: '8px',
            backgroundColor: '#0d0d1a',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '12px'
        }
    });

    $('div', {
        parent: progressBarContainer,
        id: 'update-progress-bar',
        css: {
            width: '0%',
            height: '100%',
            backgroundColor: '#4a9eff',
            borderRadius: '4px',
            transition: 'width 0.3s ease'
        }
    });

    // Pourcentage
    $('div', {
        parent: progressPanel,
        id: 'update-percent',
        css: {
            fontSize: '12px',
            color: '#888',
            textAlign: 'center'
        },
        text: '0%'
    });
}

/**
 * Met à jour le panneau de progression
 */
function updateProgress(progress, message) {
    const bar = document.getElementById('update-progress-bar');
    const percent = document.getElementById('update-percent');
    const msg = document.getElementById('update-message');

    if (bar) bar.style.width = `${progress}%`;
    if (percent) percent.textContent = `${progress}%`;
    if (msg) msg.textContent = message;
}

/**
 * Ferme le panneau de progression
 */
function hideProgressPanel() {
    if (progressPanel) {
        progressPanel.remove();
        progressPanel = null;
    }
}

/**
 * Affiche le résultat de la vérification
 */
function showCheckResult(result) {
    // Supprimer l'ancien panneau si existe
    const oldPanel = document.getElementById('update-check-panel');
    if (oldPanel) oldPanel.remove();

    const panel = $('div', {
        id: 'update-check-panel',
        css: {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1a1a2e',
            border: `2px solid ${result.hasUpdate ? '#4aff9e' : '#4a9eff'}`,
            borderRadius: '16px',
            padding: '24px 32px',
            minWidth: '420px',
            maxWidth: '500px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: '10001'
        }
    });

    // Titre
    $('div', {
        parent: panel,
        css: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: result.hasUpdate ? '#4aff9e' : '#4a9eff',
            marginBottom: '20px',
            textAlign: 'center'
        },
        text: result.hasUpdate ? '✨ Mise à jour disponible!' : '✅ Atome est à jour'
    });

    if (result.error) {
        $('div', {
            parent: panel,
            css: { color: '#ff6b6b', marginBottom: '16px', textAlign: 'center' },
            text: `Erreur: ${result.error}`
        });
    } else {
        // Infos version
        const infoContainer = $('div', {
            parent: panel,
            css: {
                backgroundColor: '#0d0d1a',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
            }
        });

        $('div', {
            parent: infoContainer,
            css: { fontSize: '13px', color: '#888', marginBottom: '8px' },
            text: `Version actuelle: ${result.currentCommit?.substring(0, 7) || 'inconnue'}`
        });

        if (result.hasUpdate) {
            $('div', {
                parent: infoContainer,
                css: { fontSize: '13px', color: '#4aff9e', marginBottom: '8px' },
                text: `Nouvelle version: ${result.latestCommitShort}`
            });

            $('div', {
                parent: infoContainer,
                css: { fontSize: '12px', color: '#aaa', marginBottom: '4px' },
                text: `📝 ${result.commitMessage}`
            });

            $('div', {
                parent: infoContainer,
                css: { fontSize: '11px', color: '#666' },
                text: `Par ${result.commitAuthor} - ${new Date(result.commitDate).toLocaleDateString('fr-FR')}`
            });
        }
    }

    // Boutons
    const buttonContainer = $('div', {
        parent: panel,
        css: {
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
        }
    });

    // Bouton Fermer
    $('button', {
        parent: buttonContainer,
        text: 'Fermer',
        css: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#444',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px'
        },
        onclick: () => panel.remove()
    });

    // Bouton Mettre à jour (si MAJ dispo)
    if (result.hasUpdate && !result.error) {
        $('button', {
            parent: buttonContainer,
            text: '⬇️ Installer',
            css: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#4aff9e',
                color: '#000',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
            },
            onclick: async () => {
                panel.remove();
                await startUpdate();
            }
        });
    }
}

/**
 * Affiche le résultat de la mise à jour
 */
function showUpdateResult(success, result) {
    hideProgressPanel();

    const panel = $('div', {
        id: 'update-result-panel',
        css: {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1a1a2e',
            border: `2px solid ${success ? '#4aff9e' : '#ff6b6b'}`,
            borderRadius: '16px',
            padding: '24px 32px',
            minWidth: '400px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: '10001'
        }
    });

    $('div', {
        parent: panel,
        css: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: success ? '#4aff9e' : '#ff6b6b',
            marginBottom: '16px',
            textAlign: 'center'
        },
        text: success ? '✅ Mise à jour réussie!' : '❌ Échec de la mise à jour'
    });

    if (success && result.filesUpdated) {
        $('div', {
            parent: panel,
            css: { color: '#ccc', marginBottom: '16px', textAlign: 'center' },
            text: `${result.filesUpdated} fichiers mis à jour`
        });
    }

    if (!success || result.errors) {
        $('div', {
            parent: panel,
            css: { color: '#ff6b6b', marginBottom: '16px', textAlign: 'center', fontSize: '13px' },
            text: result.message || result.error || 'Une erreur est survenue'
        });
    }

    const buttonContainer = $('div', {
        parent: panel,
        css: { display: 'flex', gap: '12px', justifyContent: 'center' }
    });

    $('button', {
        parent: buttonContainer,
        text: success ? '🔄 Recharger' : 'Fermer',
        css: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: success ? '#4aff9e' : '#444',
            color: success ? '#000' : '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: success ? 'bold' : 'normal'
        },
        onclick: () => {
            panel.remove();
            if (success) {
                window.location.reload();
            }
        }
    });
}

/**
 * Vérifie les mises à jour
 */
async function checkUpdates() {
    if (updateState.checking || updateState.updating) return;

    updateState.checking = true;
    updateBtn.textContent = '⏳';

    try {
        const result = await AtomeUpdater.checkForUpdates();
        updateState.lastCheckResult = result;
        showCheckResult(result);
    } catch (error) {
        showCheckResult({ hasUpdate: false, error: error.message });
    } finally {
        updateState.checking = false;
        updateBtn.textContent = '🔄';
    }
}

/**
 * Lance la mise à jour
 */
async function startUpdate() {
    if (updateState.updating) return;

    updateState.updating = true;
    showProgressPanel();

    // Configurer les callbacks
    AtomeUpdater.setCallbacks({
        onProgress: ({ step, progress, message }) => {
            updateProgress(progress, message);
        },
        onComplete: (result) => {
            showUpdateResult(true, result);
        },
        onError: (error) => {
            showUpdateResult(false, { error: error.message });
        }
    });

    try {
        await AtomeUpdater.applyUpdate();
    } catch (error) {
        showUpdateResult(false, { error: error.message });
    } finally {
        updateState.updating = false;
    }
}

// Créer le bouton principal
const updateBtn = $('button', {
    parent: updateContainer,
    id: 'atome-update-btn',
    text: '🔄',
    title: 'Mettre à jour Atome',
    css: {
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        backgroundColor: '#4a9eff',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(74, 158, 255, 0.4)',
        transition: 'all 0.2s ease'
    },
    onmouseover: function () {
        this.style.transform = 'scale(1.1)';
        this.style.boxShadow = '0 6px 16px rgba(74, 158, 255, 0.6)';
    },
    onmouseout: function () {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '0 4px 12px rgba(74, 158, 255, 0.4)';
    },
    onclick: checkUpdates
});

// Log de démarrage
console.log('[Update] Atome Update button initialized');
console.log('[Update] Platform:', AtomeUpdater.getPlatform().name);
