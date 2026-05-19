const hiddenInputHost = document.querySelector('#view') || document.body || document.documentElement;
const hiddenFilePicker = $('input', {
    parent: hiddenInputHost,
    css: { display: 'none' },
    attrs: { type: 'file' }
});

let pendingInputRequest = null;
const LONG_PRESS_DEFAULT_MS = 600;

hiddenFilePicker.addEventListener('change', async (event) => {
    const files = event.target?.files;
    const file = files && files[0];
    event.target.value = '';
    const pending = pendingInputRequest;
    pendingInputRequest = null;
    if (!pending) return;
    const { resolve, reject, meta } = pending;
    if (!file) {
        reject?.(new Error('User canceled the file selection.'));
        return;
    }
    try {
        const payload = await serializeFile(file);
        resolve?.({ payload, meta, file });
    } catch (error) {
        reject?.(error);
    }
});

function requestHiddenInputFile(meta) {
    if (pendingInputRequest) {
        pendingInputRequest.reject?.(new Error('A file selection is already pending.'));
    }
    return new Promise((resolve, reject) => {
        pendingInputRequest = { resolve, reject, meta };
        hiddenFilePicker.click();
    });
}

async function requestNativePicker(meta) {
    if (typeof window.showOpenFilePicker !== 'function') {
        return requestHiddenInputFile(meta);
    }
    try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        const file = await handle?.getFile();
        if (!file) throw new Error('No file selected.');
        const payload = await serializeFile(file);
        return { payload, meta, file };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('User canceled the file selection.');
        }
        return requestHiddenInputFile(meta);
    }
}

function resolveTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    if (target instanceof Element) return target;
    return null;
}

async function serializeFile(file) {
    if (!file) throw new Error('No file provided');
    const preferText = shouldReadAsText(file);
    if (preferText && typeof file.text === 'function') {
        const textContent = await file.text();
        return {
            name: file.name,
            type: file.type || 'text/plain',
            size: file.size,
            encoding: 'utf-8',
            content: textContent
        };
    }
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        encoding: 'base64',
        content: base64
    };
}

function shouldReadAsText(file) {
    const mime = (file?.type || '').toLowerCase();
    if (mime.startsWith('text/')) return true;
    if (!mime && typeof file?.name === 'string') {
        return /\.(txt|md|json|csv|xml|html?|css|js|ts|lrc)$/i.test(file.name);
    }
    return ['application/json', 'application/xml', 'application/javascript', 'application/x-javascript', 'application/x-sh'].includes(mime);
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
        const slice = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
}

function ensureArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function createLongPressController(element, delay, handler) {
    let timer = null;
    const start = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        timer = setTimeout(() => {
            timer = null;
            handler(event);
        }, delay);
    };
    const clear = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    element.addEventListener('pointerdown', start);
    element.addEventListener('pointerup', clear);
    element.addEventListener('pointerleave', clear);
    element.addEventListener('pointercancel', clear);
    return () => {
        element.removeEventListener('pointerdown', start);
        element.removeEventListener('pointerup', clear);
        element.removeEventListener('pointerleave', clear);
        element.removeEventListener('pointercancel', clear);
    };
}

function createFileInteractionBridge(target, options = {}) {
    const element = resolveTarget(target);
    if (!element) throw new Error('Target element not found.');

    const {
        triggers = ['click', 'longpress'],
        holdDelay = LONG_PRESS_DEFAULT_MS,
        onFile,
        preventDefault = true
    } = options;

    const activeHandlers = [];

    const dispatchPayload = async (source, rawEvent, explicitFile) => {
        try {
            const fileRecord = explicitFile
                ? { payload: await serializeFile(explicitFile), meta: { source, event: rawEvent }, file: explicitFile }
                : await requestNativePicker({ source, event: rawEvent });
            const enrichedPayload = {
                ...fileRecord.payload,
                source,
                event: rawEvent || null
            };
            window.lastSelectedLocalFile = enrichedPayload;
            onFile?.(enrichedPayload, fileRecord.file);
            return enrichedPayload;
        } catch (error) {
            console.warn(`[file-interaction] ${source} failed:`, error);
            return null;
        }
    };

    const makeClickHandler = (type) => (event) => {
        if (preventDefault) event.preventDefault();
        dispatchPayload(type, event);
    };

    ensureArray(triggers).forEach((trigger) => {
        if (trigger === 'click') {
            const handler = makeClickHandler('click');
            element.addEventListener('click', handler);
            activeHandlers.push(() => element.removeEventListener('click', handler));
        } else if (trigger === 'doubleclick') {
            const handler = makeClickHandler('doubleclick');
            element.addEventListener('dblclick', handler);
            activeHandlers.push(() => element.removeEventListener('dblclick', handler));
        } else if (trigger === 'contextmenu') {
            const handler = makeClickHandler('contextmenu');
            element.addEventListener('contextmenu', handler);
            activeHandlers.push(() => element.removeEventListener('contextmenu', handler));
        } else if (trigger === 'longpress') {
            const disposer = createLongPressController(element, holdDelay, (event) => {
                if (preventDefault) event.preventDefault();
                dispatchPayload('longpress', event);
            });
            activeHandlers.push(disposer);
        }
    });

    const onDragOver = (event) => {
        if (preventDefault) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    const onDrop = async (event) => {
        if (preventDefault) event.preventDefault();
        const files = event.dataTransfer?.files;
        if (!files || !files.length) return;
        const file = files[0];
        await dispatchPayload('drop', event, file);
    };

    element.addEventListener('dragover', onDragOver);
    element.addEventListener('drop', onDrop);
    activeHandlers.push(() => {
        element.removeEventListener('dragover', onDragOver);
        element.removeEventListener('drop', onDrop);
    });

    return {
        async pick(options = {}) {
            const result = options.file
                ? { payload: await serializeFile(options.file), meta: { source: 'manual', event: null }, file: options.file }
                : await requestNativePicker({ source: 'manual', event: null });
            const enriched = { ...result.payload, source: 'manual', event: null };
            window.lastSelectedLocalFile = enriched;
            onFile?.(enriched, result.file);
            return enriched;
        },
        dispose() {
            activeHandlers.splice(0).forEach((fn) => {
                try { fn(); } catch (error) { console.error('[file-interaction] Cleanup failed:', error); }
            });
        }
    };
}

window.createFileInteractionBridge = createFileInteractionBridge;
window.serializeLocalFile = serializeFile;

const demoTarget = $('div', {
    parent: '#view',
    id: 'file_bridge_demo',
    text: 'Click, long-press or drop a file here',
    css: {
        marginTop: '48px',
        width: 'min(420px, 90vw)',
        padding: '28px',
        borderRadius: '18px',
        border: '1px dashed rgba(255, 255, 255, 0.35)',
        textAlign: 'center',
        color: '#f5f5f5',
        fontWeight: '600',
        fontSize: '15px',
        letterSpacing: '0.6px',
        backgroundColor: 'rgba(8, 12, 20, 0.85)',
        marginLeft: 'auto',
        marginRight: 'auto'
    }
});

createFileInteractionBridge(demoTarget, {
    triggers: ['click', 'longpress'],
    onFile: (payload) => {
        console.log('[file-bridge demo] received payload:', payload);
        const summary = `Loaded: ${payload.name} (type: ${payload.type}, size: ${payload.size} bytes)`;
        demoTarget.textContent = `${summary}\nContent preview: ${String(payload.content).slice(0, 120)}...`;
    }
});
