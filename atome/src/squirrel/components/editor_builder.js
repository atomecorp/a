/**
 * 📝 EDITOR COMPONENT - Code Editor with CodeMirror
 * Composant éditeur de code interactif avec support multi-langage
 * 
 * Features:
 * - Multi-instance avec IDs uniques
 * - Draggable et resizable
 * - Sauvegarde auto à chaque frappe avec undo
 * - Validation manuelle en base
 * - Support JavaScript et Ruby
 * - Drag & drop de fichiers
 * - API programmatique complète
 */

import { $, define } from '../squirrel.js';

// === CODEMIRROR IMPORTS (from local bundle) ===
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    EditorState,
    Compartment,
    javascript,
    StreamLanguage,
    ruby,
    oneDark,
    defaultKeymap,
    history,
    historyKeymap,
    undo,
    redo,
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    searchKeymap,
    highlightSelectionMatches,
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching
} from '../../js/codemirror.bundle.js';

import { editorTemplates, languageExtensions, languageLabels } from './editor_builder_config.js';
import {
    loadAdoleApi,
    isAdoleAuthenticated,
    collectAdoleAtomes,
    extractAdoleAtome,
    extractCreatedAtomeId,
    adoleOperationSucceeded,
    listCodeFileAtomes
} from './editor_builder_adole.js';

// === REGISTRY GLOBAL ===
const editorRegistry = new Map();
let editorCounter = 0;


// === MAIN EDITOR BUILDER ===
const createEditor = (config = {}) => {
    const {
        id,
        language = 'javascript',
        content = '',
        fileName = 'untitled',
        position = { x: 100, y: 100 },
        size = { width: 700, height: 500 },
        theme = 'dark',
        autoSave = true,
        autoSaveDelay = 500,
        draggable = true,
        resizable = true,
        attach = 'body',
        onChange,
        onSave,
        onValidate,
        onClose,
        onDrop,
        onLanguageChange,
        onError,
        ...otherProps
    } = config;

    // Generate unique ID
    const editorId = id || `editor_${Date.now()}_${++editorCounter}`;

    // Get theme config
    const themeConfig = editorTemplates[theme] || editorTemplates.dark;

    // Internal state
    const state = {
        editorView: null,
        fileName: fileName,
        language: language,
        isDirty: false,
        isSaving: false,
        lastSavedContent: content,
        lastValidatedContent: content,
        fileId: null, // ID in database
        autoSaveTimeout: null,
        cursorPosition: { line: 1, col: 1 },
        undoDepth: 0,
        redoDepth: 0
    };

    // Language compartment for dynamic switching
    const languageCompartment = new Compartment();

    // === CREATE DOM ELEMENTS ===

    function createContainer() {
        const container = document.createElement('div');
        container.id = editorId;
        container.className = 'sq-editor';
        container.dataset.editorId = editorId;

        Object.assign(container.style, {
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
            display: 'flex',
            flexDirection: 'column',
            zIndex: '9998',
            overflow: 'hidden',
            ...themeConfig.containerStyle
        });

        return container;
    }

    function createHeader() {
        const header = document.createElement('div');
        header.className = 'sq-editor-header';

        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 12px',
            minHeight: '32px',
            cursor: draggable ? 'move' : 'default',
            userSelect: 'none',
            gap: '8px',
            ...themeConfig.headerStyle
        });

        // File name (editable)
        const fileNameEl = document.createElement('input');
        fileNameEl.type = 'text';
        fileNameEl.value = state.fileName;
        fileNameEl.className = 'sq-editor-filename';
        Object.assign(fileNameEl.style, {
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            fontWeight: 'bold',
            fontSize: '13px',
            width: '200px',
            cursor: 'text',
            outline: 'none'
        });
        fileNameEl.addEventListener('change', (e) => {
            state.fileName = e.target.value;
            state.isDirty = true;
            updateStatus();
        });
        fileNameEl.addEventListener('mousedown', (e) => e.stopPropagation());

        // Dirty indicator
        const dirtyIndicator = document.createElement('span');
        dirtyIndicator.className = 'sq-editor-dirty';
        dirtyIndicator.textContent = '●';
        dirtyIndicator.title = 'Unsaved changes';
        Object.assign(dirtyIndicator.style, {
            color: '#fbbf24',
            fontSize: '12px',
            display: 'none',
            marginLeft: '4px'
        });

        // Left side container
        const leftSide = document.createElement('div');
        leftSide.style.display = 'flex';
        leftSide.style.alignItems = 'center';
        leftSide.appendChild(fileNameEl);
        leftSide.appendChild(dirtyIndicator);

        // Language selector
        const langSelect = document.createElement('select');
        langSelect.className = 'sq-editor-lang';
        Object.assign(langSelect.style, {
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color: 'inherit',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer'
        });

        Object.keys(languageLabels).forEach(lang => {
            if (lang === 'js' || lang === 'rb') return; // Skip aliases
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = languageLabels[lang];
            option.selected = lang === state.language;
            langSelect.appendChild(option);
        });

        langSelect.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
        });
        langSelect.addEventListener('mousedown', (e) => e.stopPropagation());

        // Buttons container
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.gap = '4px';
        buttons.style.alignItems = 'center';

        // Undo button
        const undoBtn = createButton('↶', 'Undo (Ctrl+Z)', () => {
            if (state.editorView) undo(state.editorView);
        });

        // Redo button
        const redoBtn = createButton('↷', 'Redo (Ctrl+Y)', () => {
            if (state.editorView) redo(state.editorView);
        });

        // Run button
        const runBtn = createButton('▶', 'Run Code (Ctrl+Enter)', () => {
            if (state.runCode) state.runCode();
        }, '#22c55e');

        // Save/Validate button
        const validateBtn = createButton('✓', 'Validate & Save to DB (Ctrl+Shift+S)', validateContent, '#3b82f6');

        // Load button
        const loadBtn = createButton('📂', 'Load from DB', showLoadDialog);

        // Close button
        const closeBtn = createButton('✕', 'Close (Ctrl+W)', closeEditor, '#ef4444');

        buttons.appendChild(undoBtn);
        buttons.appendChild(redoBtn);
        buttons.appendChild(runBtn);
        buttons.appendChild(langSelect);
        buttons.appendChild(validateBtn);
        buttons.appendChild(loadBtn);
        buttons.appendChild(closeBtn);

        header.appendChild(leftSide);
        header.appendChild(buttons);

        return header;
    }

    function createButton(icon, title, onClick, hoverColor = 'rgba(255,255,255,0.2)') {
        const btn = document.createElement('button');
        btn.type = 'button'; // Prevent form submission behavior
        btn.textContent = icon;
        btn.title = title;
        Object.assign(btn.style, {
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '14px',
            transition: 'background 0.2s'
        });
        btn.addEventListener('mouseenter', () => btn.style.background = hoverColor);
        btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await onClick();
            } catch (err) {
            }
            return false;
        });
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        return btn;
    }

    function createEditorArea() {
        const editorArea = document.createElement('div');
        editorArea.className = 'sq-editor-area';
        Object.assign(editorArea.style, {
            flex: '1',
            overflow: 'hidden',
            position: 'relative'
        });

        // Drop zone overlay
        const dropOverlay = document.createElement('div');
        dropOverlay.className = 'sq-editor-drop-overlay';
        Object.assign(dropOverlay.style, {
            position: 'absolute',
            inset: '0',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            border: '3px dashed #22c55e',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            color: '#22c55e',
            fontWeight: 'bold',
            zIndex: '10',
            pointerEvents: 'none'
        });
        dropOverlay.textContent = '📄 Drop file here';

        editorArea.appendChild(dropOverlay);

        return editorArea;
    }

    function createOutputPanel() {
        const outputPanel = document.createElement('div');
        outputPanel.className = 'sq-editor-output';
        Object.assign(outputPanel.style, {
            display: 'none',
            flexDirection: 'column',
            maxHeight: '150px',
            borderTop: '1px solid #3c3c3c',
            backgroundColor: '#1a1a1a'
        });

        // Output header
        const outputHeader = document.createElement('div');
        Object.assign(outputHeader.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            backgroundColor: '#252526',
            fontSize: '11px',
            color: '#9ca3af'
        });

        const outputTitle = document.createElement('span');
        outputTitle.textContent = '📤 Output';

        const clearOutputBtn = document.createElement('button');
        clearOutputBtn.textContent = '✕';
        clearOutputBtn.title = 'Clear & Hide Output';
        Object.assign(clearOutputBtn.style, {
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '2px 6px',
            borderRadius: '3px'
        });
        clearOutputBtn.addEventListener('mouseenter', () => clearOutputBtn.style.backgroundColor = 'rgba(255,255,255,0.1)');
        clearOutputBtn.addEventListener('mouseleave', () => clearOutputBtn.style.backgroundColor = 'transparent');
        clearOutputBtn.addEventListener('click', () => {
            outputPanel.style.display = 'none';
            outputContent.innerHTML = '';
        });

        outputHeader.appendChild(outputTitle);
        outputHeader.appendChild(clearOutputBtn);

        // Output content
        const outputContent = document.createElement('div');
        outputContent.className = 'sq-editor-output-content';
        Object.assign(outputContent.style, {
            flex: '1',
            padding: '8px',
            overflowY: 'auto',
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: '12px',
            color: '#d4d4d4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
        });

        outputPanel.appendChild(outputHeader);
        outputPanel.appendChild(outputContent);

        return outputPanel;
    }

    function createStatusBar() {
        const statusBar = document.createElement('div');
        statusBar.className = 'sq-editor-status';
        Object.assign(statusBar.style, {
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 12px',
            fontSize: '11px',
            ...themeConfig.statusStyle
        });

        const leftStatus = document.createElement('span');
        leftStatus.className = 'sq-editor-status-left';
        leftStatus.textContent = 'Ln 1, Col 1';

        const rightStatus = document.createElement('span');
        rightStatus.className = 'sq-editor-status-right';
        rightStatus.textContent = 'Ready';

        statusBar.appendChild(leftStatus);
        statusBar.appendChild(rightStatus);

        return statusBar;
    }

    function createResizeHandle() {
        if (!resizable) return null;

        const handle = document.createElement('div');
        handle.className = 'sq-editor-resize';
        Object.assign(handle.style, {
            position: 'absolute',
            right: '0',
            bottom: '0',
            width: '16px',
            height: '16px',
            cursor: 'se-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)'
        });

        return handle;
    }

    // === CODEMIRROR SETUP ===

    function initCodeMirror(parentEl) {
        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            history(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            highlightSelectionMatches(),
            languageCompartment.of(getLanguageExtension(state.language)),
            oneDark,
            syntaxHighlighting(defaultHighlightStyle),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                { key: 'Mod-s', run: () => { saveContent(); return true; } },
                { key: 'Mod-Shift-s', run: () => { validateContent(); return true; } },
                { key: 'Mod-w', run: () => { closeEditor(); return true; } },
                { key: 'Mod-Enter', run: () => { if (state.runCode) state.runCode(); return true; } }
            ]),
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    handleContentChange(update);
                }
                if (update.selectionSet) {
                    updateCursorPosition(update);
                }
            }),
            EditorView.theme({
                '&': { height: '100%' },
                '.cm-scroller': { overflow: 'auto' },
                '.cm-content': { minHeight: '100%' }
            })
        ];

        state.editorView = new EditorView({
            state: EditorState.create({
                doc: content,
                extensions
            }),
            parent: parentEl
        });
    }

    function getLanguageExtension(lang) {
        const ext = languageExtensions[lang] || languageExtensions.javascript;
        return ext();
    }

    function changeLanguage(newLang) {
        if (!languageExtensions[newLang]) return;

        state.language = newLang;

        if (state.editorView) {
            state.editorView.dispatch({
                effects: languageCompartment.reconfigure(getLanguageExtension(newLang))
            });
        }

        // Update file extension
        const baseName = state.fileName.replace(/\.[^.]+$/, '');
        const ext = newLang === 'ruby' ? '.rb' : '.js';
        state.fileName = baseName + ext;

        const fileNameInput = container.querySelector('.sq-editor-filename');
        if (fileNameInput) fileNameInput.value = state.fileName;

        onLanguageChange?.(newLang);
        updateStatus();
    }

    // === CONTENT MANAGEMENT ===

    function handleContentChange(update) {
        const newContent = update.state.doc.toString();

        if (newContent !== state.lastSavedContent) {
            state.isDirty = true;
            updateDirtyIndicator(true);
        }

        // Trigger onChange callback
        onChange?.(newContent);

        // Auto-save with debounce
        if (autoSave) {
            clearTimeout(state.autoSaveTimeout);
            state.autoSaveTimeout = setTimeout(() => {
                saveContent();
            }, autoSaveDelay);
        }
    }

    function updateCursorPosition(update) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        state.cursorPosition = {
            line: line.number,
            col: pos - line.from + 1
        };

        const leftStatus = container.querySelector('.sq-editor-status-left');
        if (leftStatus) {
            leftStatus.textContent = `Ln ${state.cursorPosition.line}, Col ${state.cursorPosition.col}`;
        }
    }

    function saveContent() {
        if (!state.editorView || state.isSaving) return;

        const content = state.editorView.state.doc.toString();

        // Just update local state (real save to localStorage for undo)
        state.lastSavedContent = content;
        state.isDirty = false;
        updateDirtyIndicator(false);

        // Store in localStorage for recovery
        try {
            localStorage.setItem(`editor_autosave_${editorId}`, JSON.stringify({
                content,
                fileName: state.fileName,
                language: state.language,
                timestamp: Date.now()
            }));
        } catch (e) {
        }

        updateStatus('Auto-saved');
        onSave?.({ editorId, fileName: state.fileName, content, validated: false });
    }

    async function validateContent() {

        if (!state.editorView || state.isSaving) {
            return;
        }

        state.isSaving = true;
        updateStatus('Saving...');

        const content = state.editorView.state.doc.toString();

        try {
            const adoleApi = await loadAdoleApi();
            const authenticated = isAdoleAuthenticated(adoleApi);

            if (!authenticated) {
                // Save to localStorage only - NO network calls
                const localKey = `editor_file_${state.fileName}_${Date.now()}`;
                const localData = {
                    id: localKey,
                    fileName: state.fileName,
                    language: state.language,
                    content: content,
                    lastModified: new Date().toISOString()
                };

                let localFiles = [];
                try {
                    localFiles = JSON.parse(localStorage.getItem('editor_local_files') || '[]');
                } catch (error) {
                }

                const existingIndex = localFiles.findIndex(f => f.fileName === state.fileName);
                if (existingIndex >= 0) {
                    localFiles[existingIndex] = localData;
                } else {
                    localFiles.push(localData);
                }

                localStorage.setItem('editor_local_files', JSON.stringify(localFiles));
                state.fileId = localKey;
                state.lastValidatedContent = content;
                state.isDirty = false;
                updateDirtyIndicator(false);
                updateStatus('✓ Saved locally (login for cloud sync)');
                onValidate?.({ editorId, fileName: state.fileName, fileId: state.fileId, content, local: true });
                return;
            }

            // Authenticated - save to server with ADOLE-compliant format
            const atomeData = {
                type: 'code_file',
                properties: {
                    fileName: state.fileName,
                    language: state.language,
                    content: content,
                    lastModified: new Date().toISOString(),
                    size: content.length,
                    fileId: state.fileId || null
                }
            };

            const result = await adoleApi.atomes.create(atomeData);

            if (adoleOperationSucceeded(result)) {
                state.fileId = extractCreatedAtomeId(result) || state.fileId;
                state.lastValidatedContent = content;
                state.isDirty = false;
                updateDirtyIndicator(false);
                updateStatus('✓ Saved');
                onValidate?.({ editorId, fileName: state.fileName, fileId: state.fileId, content });
            } else {
                const error = result?.tauri?.error || result?.fastify?.error || result?.error || 'Unknown error';
                updateStatus('✗ Save failed: ' + error);
            }

        } catch (error) {
            updateStatus('✗ Failed: ' + error.message);
            onError?.(error);
        } finally {
            state.isSaving = false;
        }
    }

    async function showLoadDialog() {
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

    function loadFile(file) {
        const props = file.properties || file.data || {};

        state.fileId = file.id;
        state.fileName = props.fileName || 'loaded_file';
        state.language = props.language || 'javascript';
        state.lastSavedContent = props.content || '';
        state.lastValidatedContent = props.content || '';
        state.isDirty = false;

        // Update UI
        const fileNameInput = container.querySelector('.sq-editor-filename');
        if (fileNameInput) fileNameInput.value = state.fileName;

        const langSelect = container.querySelector('.sq-editor-lang');
        if (langSelect) langSelect.value = state.language;

        // Update editor content
        if (state.editorView) {
            state.editorView.dispatch({
                changes: {
                    from: 0,
                    to: state.editorView.state.doc.length,
                    insert: props.content || ''
                },
                effects: languageCompartment.reconfigure(getLanguageExtension(state.language))
            });
        }

        updateDirtyIndicator(false);
        updateStatus(`Loaded: ${state.fileName}`);
    }

    // === UI HELPERS ===

    function updateDirtyIndicator(isDirty) {
        const indicator = container.querySelector('.sq-editor-dirty');
        if (indicator) {
            indicator.style.display = isDirty ? 'inline' : 'none';
        }
    }

    function updateStatus(message) {
        const rightStatus = container.querySelector('.sq-editor-status-right');
        if (rightStatus) {
            rightStatus.textContent = message || (state.isDirty ? 'Modified' : 'Ready');
        }
    }

    function closeEditor() {
        if (state.isDirty) {
            if (!confirm('You have unsaved changes. Close anyway?')) {
                return;
            }
        }

        // Cleanup
        clearTimeout(state.autoSaveTimeout);
        if (state.editorView) {
            state.editorView.destroy();
        }
        editorRegistry.delete(editorId);
        container.remove();

        // Remove from localStorage
        try {
            localStorage.removeItem(`editor_autosave_${editorId}`);
        } catch (e) { }

        onClose?.(editorId);
    }

    // === DRAG & DROP ===

    function setupDragAndDrop() {
        const editorArea = container.querySelector('.sq-editor-area');
        const dropOverlay = container.querySelector('.sq-editor-drop-overlay');

        editorArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropOverlay.style.display = 'flex';
        });

        editorArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        editorArea.addEventListener('dragleave', (e) => {
            if (!editorArea.contains(e.relatedTarget)) {
                dropOverlay.style.display = 'none';
            }
        });

        editorArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropOverlay.style.display = 'none';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];

                // Check if text file
                if (!file.type.startsWith('text/') && !file.name.match(/\.(js|rb|txt|json|md|html|css)$/i)) {
                    updateStatus('Only text files are supported');
                    return;
                }

                try {
                    const content = await file.text();

                    // Detect language from extension
                    const ext = file.name.split('.').pop().toLowerCase();
                    let detectedLang = 'javascript';
                    if (ext === 'rb' || ext === 'ruby') detectedLang = 'ruby';

                    state.fileName = file.name;
                    state.language = detectedLang;
                    state.isDirty = true;
                    state.fileId = null; // New file

                    // Update UI
                    const fileNameInput = container.querySelector('.sq-editor-filename');
                    if (fileNameInput) fileNameInput.value = state.fileName;

                    const langSelect = container.querySelector('.sq-editor-lang');
                    if (langSelect) langSelect.value = detectedLang;

                    // Update editor
                    if (state.editorView) {
                        state.editorView.dispatch({
                            changes: {
                                from: 0,
                                to: state.editorView.state.doc.length,
                                insert: content
                            },
                            effects: languageCompartment.reconfigure(getLanguageExtension(detectedLang))
                        });
                    }

                    updateDirtyIndicator(true);
                    updateStatus(`Dropped: ${file.name}`);
                    onDrop?.(file, content);
                } catch (error) {
                    updateStatus('Failed to read file');
                    onError?.(error);
                }
            }
        });
    }

    // === DRAGGABLE & RESIZABLE ===

    function setupDraggable() {
        if (!draggable) return;

        const header = container.querySelector('.sq-editor-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;

            container.style.zIndex = '10000';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            container.style.left = `${Math.max(0, startLeft + dx)}px`;
            container.style.top = `${Math.max(0, startTop + dy)}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                container.style.zIndex = '9998';
                document.body.style.userSelect = '';
            }
        });
    }

    function setupResizable() {
        if (!resizable) return;

        const handle = container.querySelector('.sq-editor-resize');
        if (!handle) return;

        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;

            document.body.style.cursor = 'se-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const newWidth = Math.max(400, startWidth + dx);
            const newHeight = Math.max(200, startHeight + dy);

            container.style.width = `${newWidth}px`;
            container.style.height = `${newHeight}px`;

            // Refresh CodeMirror
            if (state.editorView) {
                state.editorView.requestMeasure();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    // === CODE EXECUTION ===


    // === BUILD UI ===

    const container = createContainer();
    state.runCode = () => runEditorCode(state, container);
    const header = createHeader();
    const editorArea = createEditorArea();
    const outputPanel = createOutputPanel();
    const statusBar = createStatusBar();
    const resizeHandle = createResizeHandle();

    container.appendChild(header);
    container.appendChild(editorArea);
    container.appendChild(outputPanel);
    container.appendChild(statusBar);
    if (resizeHandle) container.appendChild(resizeHandle);

    // Attach to DOM
    const attachTarget = typeof attach === 'string' ? document.querySelector(attach) : attach;
    (attachTarget || document.body).appendChild(container);

    // Initialize CodeMirror
    initCodeMirror(editorArea);

    // Setup interactions
    setupDragAndDrop();
    setupDraggable();
    setupResizable();

    // Register in global registry
    editorRegistry.set(editorId, { container, state, api: null });

    // === PUBLIC API ===

    const api = {
        id: editorId,
        element: container,
        container,

        // Content methods
        getContent: () => state.editorView?.state.doc.toString() || '',
        setContent: (newContent) => {
            if (state.editorView) {
                state.editorView.dispatch({
                    changes: {
                        from: 0,
                        to: state.editorView.state.doc.length,
                        insert: newContent
                    }
                });
            }
        },

        // State methods
        getFileName: () => state.fileName,
        setFileName: (name) => {
            state.fileName = name;
            const input = container.querySelector('.sq-editor-filename');
            if (input) input.value = name;
        },
        getLanguage: () => state.language,
        setLanguage: changeLanguage,
        isDirty: () => state.isDirty,
        getFileId: () => state.fileId,

        // Actions
        save: saveContent,
        validate: validateContent,
        close: closeEditor,
        run: () => state.runCode && state.runCode(),
        focus: () => state.editorView?.focus(),
        undo: () => state.editorView && undo(state.editorView),
        redo: () => state.editorView && redo(state.editorView),

        // Position/Size
        moveTo: (x, y) => {
            container.style.left = `${x}px`;
            container.style.top = `${y}px`;
        },
        resize: (width, height) => {
            container.style.width = `${width}px`;
            container.style.height = `${height}px`;
            state.editorView?.requestMeasure();
        },
        getPosition: () => ({
            x: parseInt(container.style.left),
            y: parseInt(container.style.top)
        }),
        getSize: () => ({
            width: container.offsetWidth,
            height: container.offsetHeight
        }),

        // Visibility
        show: () => { container.style.display = 'flex'; },
        hide: () => { container.style.display = 'none'; },
        isVisible: () => container.style.display !== 'none',
        bringToFront: () => { container.style.zIndex = '10000'; },

        // Load file from database
        loadFile: loadFile
    };

    // Store API reference
    editorRegistry.get(editorId).api = api;

    return api;
};

// === STATIC METHODS ===

createEditor.getAll = () => Array.from(editorRegistry.values()).map(e => e.api);
createEditor.getById = (id) => editorRegistry.get(id)?.api;
createEditor.closeAll = () => {
    editorRegistry.forEach(e => e.api?.close());
};

createEditor.loadFile = async (options = {}) => {
    const { fileId, fileName } = options;

    try {
        const adoleApi = await loadAdoleApi();

        let file;
        if (fileId) {
            file = extractAdoleAtome(await adoleApi.atomes.get(fileId));
        } else if (fileName) {
            const files = await listCodeFileAtomes(adoleApi);
            file = files.find(f => (f.properties?.fileName || f.data?.fileName) === fileName);
        }

        if (file) {
            const props = file.properties || file.data || {};
            return createEditor({
                content: props.content || '',
                fileName: props.fileName || 'loaded_file',
                language: props.language || 'javascript',
                fileId: file.id
            });
        }
    } catch (error) {
    }

    return null;
};

createEditor.listFiles = async (options = {}) => {
    try {
        const adoleApi = await loadAdoleApi();
        return listCodeFileAtomes(adoleApi, { kind: 'code_file', ...options });
    } catch (error) {
        return [];
    }
};

// === EXPORTS ===

export { createEditor };
export const EditorBuilder = createEditor;
export default createEditor;
