// Extracted from editor_builder.js createEditor: builds the editor's DOM (container, header
// with toolbar buttons + language select, code area, output panel, status bar, resize grip).
// Cross-call handlers + closure state are injected via `deps`; returns the assembled elements.
import { $ } from '../squirrel.js';
import { undo, redo } from '../../js/codemirror.bundle.js';
import { languageLabels } from './editor_builder_config.js';
import { showEditorLoadDialog } from './editor_builder_load_dialog.js';

export function buildEditorDom(deps) {
    const {
        state, editorId, themeConfig, position, size, draggable, resizable, onError,
        changeLanguage, closeEditor, loadFile, updateStatus, validateContent
    } = deps;

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
        const loadBtn = createButton('📂', 'Load from DB', () => showEditorLoadDialog({ position, size, loadFile, updateStatus, onError }));

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


    return {
        container: createContainer(),
        header: createHeader(),
        editorArea: createEditorArea(),
        outputPanel: createOutputPanel(),
        statusBar: createStatusBar(),
        resizeHandle: createResizeHandle()
    };
}
