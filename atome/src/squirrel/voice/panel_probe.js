const createProbeState = () => ({
    status: 'idle',
    speech_stopped: false,
    processing_aborted: false,
    new_command_accepted: false,
    speaking_settled: false,
    processing_settled: false,
    cancel_latency_ms: null
});

// Owns the interrupt-cancellation diagnostic for the dev voice panel: it races a
// long processing turn against a speak turn, then validates that a fresh command is
// accepted while the previous turn is being stopped. This is disposable panel
// telemetry derived from the voice API, never canonical runtime state.
export const createVoiceProbeController = ({
    env,
    api,
    probeLine,
    input,
    ensureSession,
    getSessionId,
    setStatus,
    appendLog
}) => {
    let probe = createProbeState();

    const syncLine = () => {
        const latency = Number.isFinite(probe.cancel_latency_ms) ? `${Math.round(probe.cancel_latency_ms)}ms` : 'n/a';
        probeLine.textContent = `probe: ${probe.status || 'idle'} stop=${probe.speech_stopped ? 'yes' : 'no'} abort=${probe.processing_aborted ? 'yes' : 'no'} next=${probe.new_command_accepted ? 'yes' : 'no'} cancel=${latency}`;
    };

    const refreshLatency = async () => {
        const sessionId = getSessionId();
        if (!sessionId || typeof api.telemetry?.snapshot !== 'function') return;
        const snapshot = api.telemetry.snapshot(sessionId);
        const latency = snapshot?.metrics?.cancel_roundtrip_ms;
        if (Number.isFinite(latency)) {
            probe.cancel_latency_ms = latency;
            syncLine();
        }
    };

    const maybeFinalize = async () => {
        if (probe.status !== 'running' && probe.status !== 'awaiting_command') return;
        if (!probe.speaking_settled || !probe.processing_settled) return;
        probe.status = probe.new_command_accepted ? 'validated' : 'awaiting_command';
        if (probe.status === 'validated') {
            await refreshLatency();
            setStatus('probe validated');
            appendLog('probe validated', '#8fd3ff');
        } else {
            setStatus('probe awaiting command');
        }
        syncLine();
    };

    const markFailed = (message) => {
        probe.status = 'failed';
        syncLine();
        setStatus('probe failed');
        appendLog(`probe failed: ${message}`, '#fca5a5');
    };

    const run = async () => {
        const sessionId = await ensureSession();
        probe = createProbeState();
        probe.status = 'running';
        syncLine();
        setStatus('probe running');
        appendLog('interrupt probe started', '#f59e0b');
        const processing = await api.runProcessing(sessionId, ({ signal }) => new Promise((resolve, reject) => {
            const timer = env.setTimeout(() => resolve({ ok: true }), 12000);
            signal?.addEventListener?.('abort', () => {
                env.clearTimeout(timer);
                reject(new Error(String(signal.reason || 'aborted')));
            }, { once: true });
        }), {
            step: 'voice_panel_probe'
        });
        processing?.promise
            ?.then(async (result) => {
                probe.processing_settled = true;
                probe.processing_aborted = result?.aborted === true;
                appendLog(`probe processing ${probe.processing_aborted ? 'aborted' : 'completed'}`, probe.processing_aborted ? '#8fd3ff' : '#f59e0b');
                await maybeFinalize();
            })
            ?.catch((error) => {
                markFailed(error?.message || error);
            });
        const speaking = await api.speak(input.value || 'Message de test.', {
            session_id: sessionId,
            voiceId: 'system-fr'
        });
        speaking?.promise
            ?.then(async (result) => {
                probe.speaking_settled = true;
                probe.speech_stopped = result?.stopped === true;
                appendLog(`probe speech ${probe.speech_stopped ? 'stopped' : 'completed'}`, probe.speech_stopped ? '#8fd3ff' : '#f59e0b');
                await maybeFinalize();
            })
            ?.catch((error) => {
                markFailed(error?.message || error);
            });
    };

    const noteCommand = async (result) => {
        if (probe.status !== 'running' && probe.status !== 'awaiting_command') return;
        probe.new_command_accepted = result?.matched === true && !!result?.command && String(result.command) !== 'stop';
        await maybeFinalize();
    };

    const snapshot = () => ({ ...probe });

    return { run, noteCommand, refreshLatency, snapshot };
};
