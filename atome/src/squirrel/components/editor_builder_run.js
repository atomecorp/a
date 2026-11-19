// Extracted from editor_builder.js createEditor: runs the editor buffer (JS via new Function,
// Ruby via dynamically-loaded Opal) and renders captured console output into the editor's
// output panel. Depends only on the shared `state` + the editor `container` element.
import { sealHealthAccessForUntrustedCode } from '../health/index.js';

const LINE_COLORS = Object.freeze({ error: '#f87171', warn: '#fbbf24', info: '#60a5fa', log: '#d4d4d4' });
// The output panel opened and `logs` ([{ type, message }]) written in it, one line each.
const renderOutputLines = (outputContent, logs) => logs.forEach(({ type, message }) => {
    const line = document.createElement('div');
    line.style.padding = '2px 0';
    line.style.color = LINE_COLORS[type] || LINE_COLORS.log;
    line.textContent = message;
    outputContent.appendChild(line);
});
const openOutput = (container) => {
    const outputPanel = container.querySelector('.sq-editor-output'), outputContent = container.querySelector('.sq-editor-output-content');
    if (!outputPanel || !outputContent) return null;
    outputPanel.style.display = 'flex';
    outputContent.innerHTML = '';
    return outputContent;
};

// A document script (eVe/domains/script/script_editor.js): never run here. `script.run(code, language)` saves it and runs
// it apart, in its locked worker (script_sandbox.js); what it wrote, refused and logged is shown in the output panel.
export async function runEditorScript(state, container, script) {
    const code = state.editorView?.state.doc.toString() || '';
    const outputContent = code.trim() ? openOutput(container) : null;
    if (!outputContent) return;
    const ran = await script.run(code, state.language);
    const lines = (ran?.log || []).map(message => ({ type: 'log', message: String(message) }));
    (ran?.writes || []).forEach(write => lines.push({ type: 'info', message: `${write.label || write.id} = ${write.text}` }));
    (ran?.rejected || []).forEach(refused => lines.push({ type: 'warn', message: `${refused.target}: ${refused.reason}` }));
    if (ran?.ok === false) lines.push({ type: 'error', message: `${ran.error || 'SCRIPT_FAILED'}${ran.detail ? `: ${ran.detail}` : ''}` });
    state.lastValidatedContent = code;
    renderOutputLines(outputContent, lines);
}
// A document script validated: written on its text through `script.save(code, language)`.
export async function saveEditorScript(state, script, { updateStatus, updateDirtyIndicator }) {
    if (!state.editorView || state.isSaving) return;
    state.isSaving = true;
    updateStatus('Saving...');
    const content = state.editorView.state.doc.toString();
    try {
        const saved = await script.save(content, state.language);
        if (saved?.ok !== true) { updateStatus(`✗ Save failed: ${saved?.error || 'script_save_failed'}`); return; }
        state.lastValidatedContent = content;
        state.isDirty = false;
        updateDirtyIndicator(false);
        updateStatus('✓ Saved');
    } finally {
        state.isSaving = false;
    }
}

export function runEditorCode(state, container) {
        const code = state.editorView?.state.doc.toString() || '';
        if (!code.trim()) return;

        const outputPanel = container.querySelector('.sq-editor-output');
        const outputContent = container.querySelector('.sq-editor-output-content');

        if (!outputPanel || !outputContent) return;

        // Show output panel
        outputPanel.style.display = 'flex';

        // Clear previous output
        outputContent.innerHTML = '';

        const logs = [];

        const formatValue = (arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        };

        const captureLog = (type, ...args) => {
            const formatted = args.map(formatValue).join(' ');

            logs.push({ type, message: formatted });
            console[type](...args);
        };

        const executionConsole = {
            log: (...args) => captureLog('log', ...args),
            warn: (...args) => captureLog('warn', ...args),
            error: (...args) => captureLog('error', ...args),
            info: (...args) => captureLog('info', ...args)
        };

        const displayOutput = () => renderOutputLines(outputContent, logs);

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
                    displayValue = formatValue(result);
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
            // User code shares this realm: health access is closed for the rest
            // of the page load before it runs (see health/index.js).
            sealHealthAccessForUntrustedCode();
            try {
                const result = new Function('console', code)(executionConsole);
                displayOutput();
                displayResult(result);
            } catch (error) {
                displayError(error);
            }
        } else if (lang === 'ruby' || lang === 'rb') {
            // Ruby execution via Opal (async loading)
            sealHealthAccessForUntrustedCode();
            loadOpal().then(() => {
                try {
                    // Compile Ruby to JavaScript
                    const compiled = Opal.compile(code);

                    // `new Function` and not a direct `eval`: a direct eval runs in the
                    // lexical scope of THIS module, so user code could read and rewrite
                    // every internal binding here. `new Function` compiles in global
                    // scope, like the JavaScript branch above already does.
                    const result = new Function(compiled)();
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
