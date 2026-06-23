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
import { runEditorCode } from './editor_builder_run.js';
import { showEditorLoadDialog } from './editor_builder_load_dialog.js';
import { buildEditorDom } from './editor_builder_dom.js';

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

    const { container, header, editorArea, outputPanel, statusBar, resizeHandle } = buildEditorDom({
        state, editorId, themeConfig, position, size, draggable, resizable, onError,
        changeLanguage, closeEditor, loadFile, updateStatus, validateContent
    });
    state.runCode = () => runEditorCode(state, container);

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
