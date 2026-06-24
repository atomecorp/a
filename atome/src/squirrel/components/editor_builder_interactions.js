// Extracted from editor_builder.js createEditor: wires file drag&drop onto the editor,
// header-drag repositioning, and edge resize. Side-effecting; closure state + cross-calls injected.
export function setupEditorInteractions(deps) {
    const { state, container, editorArea, header, draggable, resizable, onDrop, updateStatus, updateDirtyIndicator } = deps;

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

    setupDragAndDrop();
    setupDraggable();
    setupResizable();
}
