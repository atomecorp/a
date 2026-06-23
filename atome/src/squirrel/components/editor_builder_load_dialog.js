// Extracted from editor_builder.js createEditor: the 'Load from DB' dialog — lists code-file
// atomes via the adole API and lets the user pick one to load. Cross-calls (loadFile,
// updateStatus) + layout (position, size) are injected so this stays decoupled from the closure.
import { isAdoleAuthenticated, loadAdoleApi, listCodeFileAtomes } from './editor_builder_adole.js';
import { languageLabels } from './editor_builder_config.js';

export async function showEditorLoadDialog({ position, size, loadFile, updateStatus, onError }) {
        try {
            const adoleApi = await loadAdoleApi();

            updateStatus('Loading files...');

            // Collect files from all sources
            let allFiles = [];

            // Get local files first (always available)
            try {
                const localFiles = JSON.parse(localStorage.getItem('editor_local_files') || '[]');
                localFiles.forEach(f => {
                    allFiles.push({
                        id: f.id,
                        source: 'local',
                        properties: {
                            fileName: f.fileName,
                            language: f.language,
                            content: f.content,
                            lastModified: f.lastModified
                        }
                    });
                });
            } catch (error) {
            }

            // Get database files if authenticated
            if (isAdoleAuthenticated(adoleApi)) {
                const files = await listCodeFileAtomes(adoleApi);
                if (files.length) {
                    files.forEach(f => {
                        allFiles.push({
                            ...f,
                            source: 'database'
                        });
                    });
                } else {
                }
            } else {
            }

            if (!allFiles.length) {
                updateStatus('No saved files found');
                // Show info message
                const info = document.createElement('div');
                Object.assign(info.style, {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#2d2d30',
                    border: '1px solid #3c3c3c',
                    borderRadius: '8px',
                    padding: '20px',
                    zIndex: '10001',
                    color: '#fff',
                    textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                });
                info.innerHTML = `
                    <div style="font-size: 24px; margin-bottom: 10px;">📂</div>
                    <div style="margin-bottom: 15px;">No saved files found.<br>Save a file first with ✓ button.</div>
                    <button id="close-info-btn" style="background: #3b82f6; border: none; color: #fff; padding: 8px 20px; border-radius: 4px; cursor: pointer;">OK</button>
                `;
                document.body.appendChild(info);
                info.querySelector('#close-info-btn').addEventListener('click', () => {
                    document.body.removeChild(info);
                });
                return;
            }

            // Create simple file picker dialog
            const dialog = document.createElement('div');
            Object.assign(dialog.style, {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#2d2d30',
                border: '1px solid #3c3c3c',
                borderRadius: '8px',
                padding: '16px',
                zIndex: '10001',
                minWidth: '350px',
                maxHeight: '400px',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            });

            const title = document.createElement('h3');
            title.textContent = '📂 Load File';
            title.style.margin = '0 0 12px 0';
            title.style.color = '#fff';
            dialog.appendChild(title);

            const fileList = document.createElement('div');
            fileList.style.display = 'flex';
            fileList.style.flexDirection = 'column';
            fileList.style.gap = '4px';

            allFiles.forEach(file => {
                const props = file.properties || file.data || {};
                const sourceIcon = file.source === 'local' ? '💾' : '☁️';
                const fileItem = document.createElement('button');
                fileItem.innerHTML = `${sourceIcon} <strong>${props.fileName || file.id}</strong> <span style="color:#888">(${languageLabels[props.language] || 'Unknown'})</span>`;
                Object.assign(fileItem.style, {
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                });
                fileItem.addEventListener('mouseenter', () => fileItem.style.background = 'rgba(255,255,255,0.2)');
                fileItem.addEventListener('mouseleave', () => fileItem.style.background = 'rgba(255,255,255,0.1)');
                fileItem.addEventListener('click', () => {
                    loadFile(file);
                    document.body.removeChild(dialog);
                });
                fileList.appendChild(fileItem);
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            Object.assign(cancelBtn.style, {
                marginTop: '12px',
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%'
            });
            cancelBtn.addEventListener('click', () => document.body.removeChild(dialog));

            dialog.appendChild(fileList);
            dialog.appendChild(cancelBtn);
            document.body.appendChild(dialog);

            updateStatus('Ready');
        } catch (error) {
            updateStatus('Load failed');
            onError?.(error);
        }
    }
