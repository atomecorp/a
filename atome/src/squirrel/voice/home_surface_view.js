import { toText } from './home_surface_transcript.js';
import { localizeVoiceError } from './home_surface_i18n.js';

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

const buttonStyle = () => ({
    border: '1px solid var(--system-panel-border, rgba(255, 255, 255, 0.12))',
    background: 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))',
    color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
    borderRadius: '10px',
    minWidth: '88px',
    height: '34px',
    padding: '0 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
});

const createHistoryBubble = ({ doc, labels, entry }) => {
    const isUser = entry.role === 'user';
    const bubble = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '92%'
    });
    const meta = createElement(doc, 'div', {
        fontSize: '10px',
        opacity: '0.7',
        textAlign: isUser ? 'right' : 'left'
    }, {
        text: isUser ? labels().user : labels().assistant
    });
    const body = createElement(doc, 'div', {
        padding: '10px 12px',
        borderRadius: '14px',
        background: isUser
            ? 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))'
            : 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        border: '1px solid var(--system-panel-border, rgba(255, 255, 255, 0.12))',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.4',
        fontSize: '12px',
        cursor: 'text',
        userSelect: 'text',
        webkitUserSelect: 'text',
        pointerEvents: 'auto'
    }, {
        text: toText(entry.text),
        'data-role': 'eve-voice-history-entry'
    });
    bubble.append(meta, body);
    return bubble;
};

export const mountHomeVoiceView = ({
    doc,
    host,
    state,
    textOnly,
    labels,
    locale
}) => {
    const root = createElement(doc, 'section', {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        marginBottom: '12px',
        borderRadius: '12px',
        border: '1px solid var(--system-panel-border, rgba(255, 255, 255, 0.12))',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        boxShadow: 'var(--system-panel-shadow-soft, 0 8px 24px rgba(0, 0, 0, 0.22))',
        color: 'var(--eve-text, var(--system-text-color, rgba(244, 244, 244, 0.94)))',
        backdropFilter: 'var(--system-backdrop-filter, blur(18px) saturate(145%))'
    }, {
        'data-role': 'eve-voice-surface'
    });

    const header = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
    });
    const titleWrap = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: '1 1 auto',
        minWidth: '0'
    });
    const title = createElement(doc, 'div', {
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.03em',
        textTransform: 'uppercase'
    }, { text: labels().title });
    const status = createElement(doc, 'div', {
        fontSize: '11px',
        opacity: '0.8'
    }, { text: labels().idle });
    const meterCanvas = createElement(doc, 'canvas', {
        width: '116px',
        height: '26px',
        borderRadius: '8px',
        border: '1px solid var(--system-panel-border, rgba(255, 255, 255, 0.12))',
        background: 'var(--system-input-bg, rgba(88, 88, 88, 0.52))',
        display: 'block'
    }, {
        'data-role': 'eve-voice-meter',
        'aria-hidden': 'true'
    });
    titleWrap.append(title, status, meterCanvas);

    const controls = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });
    const actionButton = createElement(doc, 'button', {
        ...buttonStyle(),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
    }, { type: 'button', 'data-role': 'eve-voice-action', text: labels().stop });
    const sendButton = createElement(doc, 'button', buttonStyle(), {
        type: 'button',
        'data-role': 'eve-voice-send',
        text: labels().send
    });
    controls.append(actionButton, sendButton);
    header.append(titleWrap, controls);

    const noticeLine = createElement(doc, 'div', {
        minHeight: '18px',
        fontSize: '11px',
        color: 'rgba(251, 113, 133, 0.96)'
    }, { 'data-role': 'eve-voice-notice', text: '' });
    const transcriptLine = createElement(doc, 'div', {
        minHeight: '18px',
        fontSize: '11px',
        opacity: '0.82'
    }, { 'data-role': 'eve-voice-transcript', text: '' });
    const history = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minHeight: '140px',
        maxHeight: '240px',
        overflowY: 'auto',
        padding: '4px 2px'
    }, { 'data-role': 'eve-voice-history' });
    const composer = createElement(doc, 'div', {
        display: 'flex',
        gap: '8px',
        alignItems: 'stretch'
    });
    const input = createElement(doc, 'textarea', {
        flex: '1 1 auto',
        minHeight: '62px',
        maxHeight: '160px',
        resize: 'vertical',
        borderRadius: '12px',
        border: '1px solid var(--system-panel-border, rgba(79, 79, 79, 0.16))',
        background: 'var(--system-input-bg, rgba(255, 255, 255, 0.34))',
        color: 'var(--system-text-color, rgba(58, 58, 58, 0.94))',
        padding: '10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        'data-role': 'eve-voice-input',
        placeholder: labels().placeholder
    });
    composer.append(input);
    root.append(header, noticeLine, transcriptLine, history, composer);
    host.prepend(root);

    const setStatus = (value) => {
        status.textContent = value;
    };
    const renderNotice = () => {
        const message = toText(state.errorMessage) || toText(state.infoMessage);
        noticeLine.textContent = message;
        noticeLine.style.color = state.errorMessage
            ? 'rgba(251, 113, 133, 0.96)'
            : 'rgba(191, 219, 254, 0.96)';
    };
    const setError = (codeOrMessage = '') => {
        state.errorMessage = codeOrMessage ? localizeVoiceError(codeOrMessage, locale()) : '';
        renderNotice();
    };
    const setInfo = (message = '') => {
        state.infoMessage = toText(message);
        renderNotice();
    };
    const renderTranscript = () => {
        const text = toText(state.transcriptDraft);
        transcriptLine.textContent = text ? `${labels().transcriptLabel}: ${text}` : '';
    };
    const renderHistory = () => {
        history.replaceChildren();
        const items = state.history.length ? state.history : [{
            role: 'assistant',
            text: labels().empty,
            ts: Date.now()
        }];
        items.forEach((entry) => history.appendChild(createHistoryBubble({ doc, labels, entry })));
        history.scrollTop = history.scrollHeight;
    };
    const updateControls = () => {
        const activeLabels = labels();
        title.textContent = activeLabels.title;
        input.setAttribute('placeholder', activeLabels.placeholder);
        sendButton.textContent = activeLabels.send;
        actionButton.style.display = (textOnly ? state.speaking : state.active) ? 'inline-flex' : 'none';
        actionButton.disabled = false;
        actionButton.style.opacity = '1';
        actionButton.style.cursor = 'pointer';
        if (textOnly && !state.speaking) {
            actionButton.style.display = 'none';
        } else if (state.processing && !state.listening && !state.speaking) {
            actionButton.textContent = activeLabels.thinking;
            actionButton.style.background = 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))';
            actionButton.disabled = true;
            actionButton.style.opacity = '0.72';
            actionButton.style.cursor = 'default';
        } else if (state.listening || state.speaking) {
            actionButton.textContent = activeLabels.stop;
            actionButton.style.background = 'var(--system-input-bg-strong, rgba(255, 255, 255, 0.48))';
        } else {
            actionButton.textContent = activeLabels.resume;
            actionButton.style.background = 'linear-gradient(135deg, #0f766e, #155e75)';
        }
        if (state.processing) return setStatus(activeLabels.thinking);
        if (state.speaking) return setStatus(activeLabels.speaking);
        if (state.listening) return setStatus(activeLabels.listening);
        if (state.errorMessage) return setStatus(activeLabels.unavailable);
        return setStatus(activeLabels.idle);
    };

    return {
        root,
        meterCanvas,
        actionButton,
        sendButton,
        input,
        setStatus,
        renderNotice,
        setError,
        setInfo,
        renderTranscript,
        renderHistory,
        updateControls
    };
};
