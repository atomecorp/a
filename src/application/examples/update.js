/**
 * Atome Update Button
 * 
 * Update button for Squirrel/Atome core from GitHub
 * Uses the update_atome.js API
 */

// Load the update API
await import('../../squirrel/apis/update_atome.js');

// Local state
const updateState = {
    checking: false,
    updating: false,
    lastCheckResult: null,
    progressValue: 0,
    progressMessage: ''
};

// Main container
const updateContainer = $('div', {
    id: 'atome-update-container',
    css: {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        zIndex: '9999'
    }
});

// Progress panel (hidden by default)
let progressPanel = null;

/**
 * Show progress panel
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

    // Title
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
        text: '🔄 Atome Update'
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
        text: 'Preparing...'
    });

    // Progress bar
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

    // Percentage
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
 * Update progress panel
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
 * Hide progress panel
 */
function hideProgressPanel() {
    if (progressPanel) {
        progressPanel.remove();
        progressPanel = null;
    }
}

/**
 * Show check result
 */
function showCheckResult(result) {
    // Remove old panel if exists
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

    // Title
    $('div', {
        parent: panel,
        css: {
            fontSize: '20px',
            fontWeight: 'bold',
            color: result.hasUpdate ? '#4aff9e' : '#4a9eff',
            marginBottom: '20px',
            textAlign: 'center'
        },
        text: result.hasUpdate ? '✨ Update available!' : '✅ Atome is up to date'
    });

    if (result.error) {
        $('div', {
            parent: panel,
            css: { color: '#ff6b6b', marginBottom: '16px', textAlign: 'center' },
            text: `Error: ${result.error}`
        });
    } else {
        // Version info
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
            text: `Current version: ${result.currentVersion || result.currentCommit?.substring(0, 7) || 'unknown'}`
        });

        if (result.hasUpdate) {
            $('div', {
                parent: infoContainer,
                css: { fontSize: '13px', color: '#4aff9e', marginBottom: '8px' },
                text: `New version: ${result.latestVersion || result.latestCommitShort}`
            });

            $('div', {
                parent: infoContainer,
                css: { fontSize: '12px', color: '#aaa', marginBottom: '4px' },
                text: `📝 ${result.commitMessage}`
            });

            $('div', {
                parent: infoContainer,
                css: { fontSize: '11px', color: '#666' },
                text: `By ${result.commitAuthor} - ${new Date(result.commitDate).toLocaleDateString('en-US')}`
            });
        }
    }

    // Buttons
    const buttonContainer = $('div', {
        parent: panel,
        css: {
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
        }
    });

    // Close button
    $('button', {
        parent: buttonContainer,
        text: 'Close',
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

    // Update button (if update available)
    if (result.hasUpdate && !result.error) {
        $('button', {
            parent: buttonContainer,
            text: '⬇️ Install',
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
 * Show update result
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
        text: success ? '✅ Update successful!' : '❌ Update failed'
    });

    if (success && result.filesUpdated) {
        $('div', {
            parent: panel,
            css: { color: '#ccc', marginBottom: '16px', textAlign: 'center' },
            text: `${result.filesUpdated} files updated`
        });
    }

    if (!success || result.errors) {
        $('div', {
            parent: panel,
            css: { color: '#ff6b6b', marginBottom: '16px', textAlign: 'center', fontSize: '13px' },
            text: result.message || result.error || 'An error occurred'
        });
    }

    const buttonContainer = $('div', {
        parent: panel,
        css: { display: 'flex', gap: '12px', justifyContent: 'center' }
    });

    $('button', {
        parent: buttonContainer,
        text: success ? '🔄 Reload' : 'Close',
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
 * Check for updates
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
 * Start the update
 */
async function startUpdate() {
    if (updateState.updating) return;

    console.log('[Update] Starting update...');
    updateState.updating = true;
    showProgressPanel();

    // Configure callbacks
    AtomeUpdater.setCallbacks({
        onProgress: ({ step, progress, message }) => {
            console.log('[Update] Progress:', step, progress, message);
            updateProgress(progress, message);
        },
        onComplete: (result) => {
            console.log('[Update] Complete:', result);
            showUpdateResult(true, result);
        },
        onError: (error) => {
            console.log('[Update] Error:', error);
            showUpdateResult(false, { error: error.message });
        }
    });

    try {
        console.log('[Update] Calling AtomeUpdater.applyUpdate()...');
        const result = await AtomeUpdater.applyUpdate();
        console.log('[Update] applyUpdate returned:', result);
    } catch (error) {
        console.error('[Update] applyUpdate threw:', error);
        showUpdateResult(false, { error: error.message });
    } finally {
        updateState.updating = false;
    }
}

/**
 * Force sync all files from GitHub without version check
 */
async function forceSync() {
    if (updateState.updating) return;

    console.log('[Update] Force sync starting...');
    updateState.updating = true;
    showProgressPanel();

    // Configure callbacks
    AtomeUpdater.setCallbacks({
        onProgress: ({ step, progress, message }) => {
            console.log('[Update] Progress:', step, progress, message);
            updateProgress(progress, message);
        },
        onComplete: (result) => {
            console.log('[Update] Force sync complete:', result);
            showUpdateResult(true, result);
        },
        onError: (error) => {
            console.log('[Update] Force sync error:', error);
            showUpdateResult(false, { error: error.message });
        }
    });

    try {
        console.log('[Update] Calling AtomeUpdater.forceSync()...');
        const result = await AtomeUpdater.forceSync();
        console.log('[Update] forceSync returned:', result);
    } catch (error) {
        console.error('[Update] forceSync threw:', error);
        showUpdateResult(false, { error: error.message });
    } finally {
        updateState.updating = false;
    }
}

// Create main button
const updateBtn = $('button', {
    parent: updateContainer,
    id: 'atome-update-btn',
    text: '🔄',
    title: 'Update Atome',
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

// Create force sync button
const forceSyncBtn = $('button', {
    parent: updateContainer,
    id: 'atome-force-sync-btn',
    text: '⚡',
    title: 'Force Sync (download all files from GitHub)',
    css: {
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        border: 'none',
        backgroundColor: '#ff6b35',
        color: 'white',
        fontSize: '20px',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(255, 107, 53, 0.4)',
        transition: 'all 0.2s ease',
        marginTop: '10px'
    },
    onmouseover: function () {
        this.style.transform = 'scale(1.1)';
        this.style.boxShadow = '0 6px 16px rgba(255, 107, 53, 0.6)';
    },
    onmouseout: function () {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.4)';
    },
    onclick: forceSync
});

// Startup log
console.log('[Update] Atome Update button initialized');
console.log('[Update] Platform:', AtomeUpdater.getPlatform().name);
