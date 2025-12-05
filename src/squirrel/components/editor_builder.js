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

// === REGISTRY GLOBAL ===
const editorRegistry = new Map();
let editorCounter = 0;

// === TEMPLATES ===
const editorTemplates = {
    'dark': {
        name: 'Dark Theme',
        containerStyle: {
            backgroundColor: '#1e1e1e',
            border: '1px solid #3c3c3c',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        },
        headerStyle: {
            backgroundColor: '#2d2d30',
            color: '#cccccc',
            borderBottom: '1px solid #3c3c3c'
        },
        statusStyle: {
            backgroundColor: '#007acc',
            color: '#ffffff'
        }
    },
    'light': {
        name: 'Light Theme',
        containerStyle: {
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
        },
        headerStyle: {
            backgroundColor: '#f3f4f6',
            color: '#374151',
            borderBottom: '1px solid #d1d5db'
        },
        statusStyle: {
            backgroundColor: '#0ea5e9',
            color: '#ffffff'
        }
    }
};

// === LANGUAGE SUPPORT ===
const languageExtensions = {
    javascript: () => javascript(),
    js: () => javascript(),
    ruby: () => StreamLanguage.define(ruby),
    rb: () => StreamLanguage.define(ruby)
};

const languageLabels = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    ruby: 'Ruby',
    rb: 'Ruby'
};

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
        btn.addEventListener('click', onClick);
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
            console.warn('[Editor] localStorage save failed:', e);
        }

        updateStatus('Auto-saved');
        onSave?.({ editorId, fileName: state.fileName, content, validated: false });
    }

    async function validateContent() {
        if (!state.editorView || state.isSaving) return;

        state.isSaving = true;
        updateStatus('Saving to database...');

        const content = state.editorView.state.doc.toString();

        try {
            // Import UnifiedAtome dynamically
            const { UnifiedAtome } = await import('../apis/unifiedAtomeSync.js');

            const atomeData = {
                id: state.fileId || `code_file_${Date.now()}`,
                kind: 'code_file',
                properties: {
                    fileName: state.fileName,
                    language: state.language,
                    content: content,
                    lastModified: new Date().toISOString(),
                    size: content.length
                }
            };

            let result;
            if (state.fileId) {
                result = await UnifiedAtome.update(state.fileId, atomeData);
            } else {
                result = await UnifiedAtome.create(atomeData);
                if (result.success) {
                    state.fileId = atomeData.id;
                }
            }

            if (result.success) {
                state.lastValidatedContent = content;
                state.isDirty = false;
                updateDirtyIndicator(false);
                updateStatus('✓ Saved to database');
                onValidate?.({ editorId, fileName: state.fileName, fileId: state.fileId, content });
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (error) {
            console.error('[Editor] Save to database failed:', error);
            updateStatus('✗ Save failed');
            onError?.(error);
        } finally {
            state.isSaving = false;
        }
    }

    async function showLoadDialog() {
        try {
            const { UnifiedAtome } = await import('../apis/unifiedAtomeSync.js');

            updateStatus('Loading files...');
            const result = await UnifiedAtome.list({ kind: 'code_file' });

            if (!result.success || !result.data?.length) {
                updateStatus('No files found');
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
                minWidth: '300px',
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

            result.data.forEach(file => {
                const props = file.properties || file.data || {};
                const fileItem = document.createElement('button');
                fileItem.textContent = `${props.fileName || file.id} (${languageLabels[props.language] || 'Unknown'})`;
                Object.assign(fileItem.style, {
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left'
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
            console.error('[Editor] Load dialog failed:', error);
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
                    console.error('[Editor] File read failed:', error);
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

    function runCode() {
        const code = state.editorView?.state.doc.toString() || '';
        if (!code.trim()) return;

        const outputPanel = container.querySelector('.sq-editor-output');
        const outputContent = container.querySelector('.sq-editor-output-content');

        if (!outputPanel || !outputContent) return;

        // Show output panel
        outputPanel.style.display = 'flex';

        // Clear previous output
        outputContent.innerHTML = '';

        // Captured output
        const logs = [];

        // Capture console methods
        const originalConsole = {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            info: console.info.bind(console)
        };

        const captureLog = (type, ...args) => {
            const formatted = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            logs.push({ type, message: formatted });
            originalConsole[type](...args); // Also log to real console
        };

        // Temporarily override console
        console.log = (...args) => captureLog('log', ...args);
        console.warn = (...args) => captureLog('warn', ...args);
        console.error = (...args) => captureLog('error', ...args);
        console.info = (...args) => captureLog('info', ...args);

        const displayOutput = () => {
            logs.forEach(({ type, message }) => {
                const line = document.createElement('div');
                line.style.padding = '2px 0';

                if (type === 'error') {
                    line.style.color = '#f87171';
                } else if (type === 'warn') {
                    line.style.color = '#fbbf24';
                } else if (type === 'info') {
                    line.style.color = '#60a5fa';
                } else {
                    line.style.color = '#d4d4d4';
                }

                line.textContent = message;
                outputContent.appendChild(line);
            });

            // Restore console
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            console.error = originalConsole.error;
            console.info = originalConsole.info;
        };

        const displayError = (error) => {
            logs.push({ type: 'error', message: `❌ ${error.name}: ${error.message}` });
            displayOutput();
        };

        const displayResult = (result) => {
            if (result !== undefined) {
                const resultLine = document.createElement('div');
                resultLine.style.padding = '4px 0';
                resultLine.style.borderTop = '1px solid #3c3c3c';
                resultLine.style.marginTop = '4px';
                resultLine.style.color = '#4ade80';

                let displayValue;
                if (typeof result === 'object') {
                    try {
                        displayValue = JSON.stringify(result, null, 2);
                    } catch {
                        displayValue = String(result);
                    }
                } else {
                    displayValue = String(result);
                }

                resultLine.textContent = `→ ${displayValue}`;
                outputContent.appendChild(resultLine);
            }
        };

        // Load Opal dynamically
        const loadOpal = () => {
            return new Promise((resolve, reject) => {
                if (typeof Opal !== 'undefined') {
                    resolve();
                    return;
                }

                // Check if already loading
                if (window._opalLoading) {
                    window._opalLoading.then(resolve).catch(reject);
                    return;
                }

                logs.push({ type: 'info', message: '⏳ Loading Ruby interpreter (Opal)...' });
                displayOutput();
                logs.length = 0; // Clear for actual output

                window._opalLoading = new Promise((res, rej) => {
                    const script1 = document.createElement('script');
                    script1.src = 'js/opal.min.js';
                    script1.onload = () => {
                        const script2 = document.createElement('script');
                        script2.src = 'js/opal-parser.min.js';
                        script2.onload = () => {
                            // Load opal-squirrel bridge
                            const script3 = document.createElement('script');
                            script3.src = 'js/opal-squirrel.js';
                            script3.onload = () => {
                                window._opalLoading = null;
                                res();
                            };
                            script3.onerror = () => {
                                // Bridge is optional, continue anyway
                                console.warn('[EditorBuilder] opal-squirrel.js not found, continuing without bridge');
                                window._opalLoading = null;
                                res();
                            };
                            document.head.appendChild(script3);
                        };
                        script2.onerror = () => {
                            window._opalLoading = null;
                            rej(new Error('Failed to load opal-parser.min.js'));
                        };
                        document.head.appendChild(script2);
                    };
                    script1.onerror = () => {
                        window._opalLoading = null;
                        rej(new Error('Failed to load opal.min.js'));
                    };
                    document.head.appendChild(script1);
                });

                window._opalLoading.then(resolve).catch(reject);
            });
        };

        // Execute based on language
        const lang = state.language.toLowerCase();

        if (lang === 'javascript' || lang === 'js') {
            // JavaScript execution
            try {
                const result = new Function(code)();
                displayOutput();
                displayResult(result);
            } catch (error) {
                displayError(error);
            }
        } else if (lang === 'ruby' || lang === 'rb') {
            // Ruby execution via Opal (async loading)
            loadOpal().then(() => {
                try {
                    // Compile Ruby to JavaScript
                    const compiled = Opal.compile(code);

                    // Execute compiled code
                    const result = eval(compiled);
                    displayOutput();
                    displayResult(result);
                } catch (error) {
                    displayError(error);
                }
            }).catch(error => {
                displayError(error);
            });
        } else {
            // Unsupported language
            logs.push({ type: 'warn', message: `⚠️ Code execution not supported for language: ${lang}` });
            logs.push({ type: 'info', message: 'Supported languages: JavaScript, Ruby' });
            displayOutput();
        }
    }

    // Make runCode available to the keymap
    state.runCode = runCode;

    // === BUILD UI ===

    const container = createContainer();
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
    const { fileId, fileName, userId = 'current' } = options;

    try {
        const { UnifiedAtome } = await import('../apis/unifiedAtomeSync.js');

        let file;
        if (fileId) {
            const result = await UnifiedAtome.get(fileId);
            if (result.success) file = result.data;
        } else if (fileName) {
            const result = await UnifiedAtome.list({ kind: 'code_file' });
            if (result.success) {
                file = result.data.find(f => (f.properties?.fileName || f.data?.fileName) === fileName);
            }
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
        console.error('[EditorBuilder] loadFile failed:', error);
    }

    return null;
};

createEditor.listFiles = async (options = {}) => {
    try {
        const { UnifiedAtome } = await import('../apis/unifiedAtomeSync.js');
        const result = await UnifiedAtome.list({ kind: 'code_file', ...options });
        return result.success ? result.data : [];
    } catch (error) {
        console.error('[EditorBuilder] listFiles failed:', error);
        return [];
    }
};

// === EXPORTS ===

export { createEditor };
export const EditorBuilder = createEditor;
export default createEditor;
