// Extracted from editor_builder.js createEditor: saveContent (local autosave to localStorage)
// and validateContent (persist to adole cloud, or localStorage when unauthenticated).
// Status/dirty cross-calls + callbacks injected via `deps`.
import { loadAdoleApi, isAdoleAuthenticated, adoleOperationSucceeded, extractCreatedAtomeId } from './editor_builder_adole.js';

export function makeEditorActions(deps) {
    const { state, editorId, onSave, onValidate, onError, updateStatus, updateDirtyIndicator } = deps;

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

    return { saveContent, validateContent };
}
