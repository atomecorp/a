export const PANEL_ID = 'squirrel-voice-panel';
export const LAUNCHER_ID = 'squirrel-voice-launcher';
const LOG_LIMIT = 24;

const createElement = (doc, tag, style = {}, attrs = {}) => {
    const node = doc.createElement(tag);
    Object.assign(node.style, style);
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (key === 'text') {
            node.textContent = String(value);
            return;
        }
        node.setAttribute(key, String(value));
    });
    return node;
};

const createButton = (doc, label, accentBorder = 'rgba(79, 79, 79, 0.16)') => createElement(doc, 'button', {
    border: `1px solid ${accentBorder}`,
    background: 'var(--system-input-bg-strong, rgba(255, 255, 255, 0.48))',
    color: 'var(--system-text-color, rgba(58, 58, 58, 0.94))',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
}, {
    type: 'button',
    text: label
});

// Builds the disposable voice-panel DOM tree and returns the element handles plus the
// log appender the behavior controller wires to the voice API. The launcher and panel
// are returned detached so the controller owns the body mount/teardown lifecycle.
export const createVoicePanelView = (doc) => {
    const launcher = createElement(doc, 'button', {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: '52px',
        height: '52px',
        borderRadius: '999px',
        border: '1px solid rgba(14, 116, 110, 0.28)',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        zIndex: '9999',
        cursor: 'pointer',
        boxShadow: 'var(--system-panel-shadow, 0 14px 36px rgba(0, 0, 0, 0.16))',
        fontWeight: '700',
        letterSpacing: '0.02em'
    }, {
        id: LAUNCHER_ID,
        type: 'button',
        'aria-label': 'Open voice panel',
        text: 'Mic'
    });

    const panel = createElement(doc, 'div', {
        position: 'fixed',
        right: '16px',
        bottom: '80px',
        width: '340px',
        minHeight: '260px',
        maxHeight: '78vh',
        display: 'none',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px',
        borderRadius: '18px',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        boxShadow: 'var(--system-panel-shadow, 0 14px 36px rgba(0, 0, 0, 0.16))',
        color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        fontFamily: 'Menlo, Consolas, monospace',
        zIndex: '9999',
        overflow: 'hidden',
        backdropFilter: 'var(--system-backdrop-filter, blur(18px) saturate(145%))'
    }, {
        id: PANEL_ID
    });

    const header = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px'
    });

    const titleWrap = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
    });
    const title = createElement(doc, 'div', {
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.04em',
        textTransform: 'uppercase'
    }, { text: 'Voice Runtime' });
    const providersLine = createElement(doc, 'div', {
        fontSize: '11px',
        color: 'var(--system-text-muted, rgba(82, 82, 82, 0.74))'
    }, { text: 'providers: loading...' });
    titleWrap.append(title, providersLine);

    const closeButton = createButton(doc, 'Close', '#1f2937');
    closeButton.style.padding = '5px 8px';
    closeButton.style.fontSize = '11px';
    header.append(titleWrap, closeButton);

    const meta = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        fontSize: '11px',
        color: '#c6d3df'
    });
    const phaseLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-phase', text: 'phase: idle' });
    const sessionLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-session', text: 'session: none' });
    const followupLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-followup', text: 'followup: none' });
    const statusLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-status', text: 'status: ready' });
    const probeLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-probe', text: 'probe: idle' });
    meta.append(phaseLine, sessionLine, followupLine, statusLine, probeLine);

    const transcript = createElement(doc, 'div', {
        minHeight: '66px',
        maxHeight: '120px',
        overflowY: 'auto',
        padding: '10px',
        borderRadius: '12px',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        fontSize: '12px',
        lineHeight: '1.45',
        whiteSpace: 'pre-wrap'
    }, { 'data-test-id': 'voice-panel-transcript', text: 'No transcript yet.' });

    const fallback = createElement(doc, 'div', {
        display: 'none',
        minHeight: '44px',
        padding: '10px',
        borderRadius: '12px',
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.26)',
        fontSize: '11px',
        lineHeight: '1.45',
        whiteSpace: 'pre-wrap',
        color: '#fde68a'
    }, { 'data-test-id': 'voice-panel-fallback', text: '' });

    const input = createElement(doc, 'textarea', {
        minHeight: '56px',
        resize: 'vertical',
        width: '100%',
        borderRadius: '12px',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        background: 'var(--system-input-bg, rgba(88, 88, 88, 0.52))',
        color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        padding: '10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        'data-test-id': 'voice-panel-input'
    });
    input.value = 'Je lis un message de test qui pourra etre interrompu.';

    const commandInput = createElement(doc, 'input', {
        width: '100%',
        height: '34px',
        borderRadius: '10px',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        background: 'var(--system-input-bg, rgba(88, 88, 88, 0.52))',
        color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        padding: '0 10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        type: 'text',
        placeholder: 'Commande locale: stop, passe au suivant, resume...',
        'data-test-id': 'voice-panel-command-input'
    });
    commandInput.value = 'passe au suivant';

    const row1 = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
    });
    const newSessionButton = createButton(doc, 'New', '#334155');
    const listenButton = createButton(doc, 'Listen', '#0f766e');
    const speakButton = createButton(doc, 'Speak', '#1d4ed8');
    const stopButton = createButton(doc, 'Stop', '#b91c1c');
    row1.append(newSessionButton, listenButton, speakButton, stopButton);

    const row2 = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '8px'
    });
    const captureButton = createButton(doc, 'Capture', '#7c3aed');
    const commandButton = createButton(doc, 'Send Cmd', '#0f766e');
    const followupButton = createButton(doc, 'Followup', '#475569');
    const intentButton = createButton(doc, 'Intent', '#92400e');
    const probeButton = createButton(doc, 'Probe', '#7c2d12');
    row2.append(captureButton, commandButton, followupButton, intentButton, probeButton);

    const log = createElement(doc, 'div', {
        minHeight: '96px',
        maxHeight: '180px',
        overflowY: 'auto',
        padding: '8px',
        borderRadius: '12px',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        fontSize: '11px',
        lineHeight: '1.4'
    }, { 'data-test-id': 'voice-panel-log' });

    panel.append(header, meta, transcript, fallback, input, commandInput, row1, row2, log);

    const appendLog = (message, color = 'var(--system-text-color, rgba(244, 244, 244, 0.94))') => {
        const line = createElement(doc, 'div', {
            color,
            marginBottom: '4px'
        }, {
            text: `[${new Date().toLocaleTimeString()}] ${message}`
        });
        log.prepend(line);
        while (log.childNodes.length > LOG_LIMIT) {
            log.removeChild(log.lastChild);
        }
    };

    return {
        launcher,
        panel,
        providersLine,
        phaseLine,
        sessionLine,
        followupLine,
        statusLine,
        probeLine,
        transcript,
        fallback,
        input,
        commandInput,
        closeButton,
        newSessionButton,
        listenButton,
        speakButton,
        stopButton,
        captureButton,
        commandButton,
        followupButton,
        intentButton,
        probeButton,
        appendLog
    };
};
