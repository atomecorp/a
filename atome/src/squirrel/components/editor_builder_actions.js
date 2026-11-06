// Extracted from editor_builder.js createEditor: saveContent (local autosave to localStorage)
// and validateContent (a `code_file` atome committed through window.Atome.commit, or
// localStorage when unauthenticated). Status/dirty cross-calls + callbacks injected via `deps`.
import { loadAdoleApi, isAdoleAuthenticated } from './editor_builder_adole.js';

export function makeEditorActions(deps) {
    const { state, editorId, onSave, onValidate, onError, updateStatus, updateDirtyIndicator, commitOptions } = deps;

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

            // Authenticated: one `code_file` atome per file, written through the canonical
            // pipeline (events, history, sync); a file opened from the list keeps its atome.
            const atomeId = state.fileId || globalThis.crypto.randomUUID();
            const result = await window.Atome.commit({
                kind: 'set',
                type: 'code_file',
                atome_id: atomeId,
                scope: 'global',
                payload: {
                    props: {
                        fileName: state.fileName,
                        language: state.language,
                        content,
                        lastModified: new Date().toISOString(),
                        size: content.length
                    }
                }
            }, commitOptions);

            if (result?.ok === true) {
                state.fileId = atomeId;
                state.lastValidatedContent = content;
                state.isDirty = false;
                updateDirtyIndicator(false);
                updateStatus('✓ Saved');
                onValidate?.({ editorId, fileName: state.fileName, fileId: state.fileId, content });
            } else {
                updateStatus('✗ Save failed: ' + (result?.error || 'atome_commit_failed'));
            }

        } catch (error) {
            updateStatus('✗ Failed: ' + error.message);
            onError?.(error);
        } finally {
            state.isSaving = false;
        }
    }

    return { saveContent, validateContent };
}
