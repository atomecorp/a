import { classifyVoiceError } from './home_surface_i18n.js';

export const createHomeVoiceMeterRuntime = ({
    env,
    state,
    config,
    textOnly,
    voiceMeterFactory,
    createVoiceActivityDetector,
    actions,
    view
}) => {
    const startVoiceMeter = async () => {
        if (textOnly) return;
        if (!state.voiceMeter && typeof voiceMeterFactory === 'function') {
            state.voiceMeter = voiceMeterFactory({
                env,
                canvas: view.meterCanvas,
                onFrame: (frame) => {
                    if (!state.bargeInDetector) return;
                    if (!state.active || !state.speaking || state.listening) {
                        state.bargeInDetector.reset();
                        return;
                    }
                    if (Date.now() < state.bargeInArmAt) return;
                    const next = state.bargeInDetector.push(frame);
                    if (next?.state === 'speech') void actions.handleBargeInDetected();
                }
            });
        }
        if (!state.voiceMeter?.start || state.meterRunning) return;
        if (!state.bargeInDetector) {
            state.bargeInDetector = createVoiceActivityDetector({
                threshold: config.bargeVadThreshold,
                minSpeechFrames: config.bargeVadMinSpeechFrames,
                releaseFrames: config.bargeVadReleaseFrames
            });
        }
        try {
            await state.voiceMeter.start();
            state.meterRunning = true;
        } catch (error) {
            state.meterRunning = false;
            view.setError(classifyVoiceError(error));
            view.updateControls();
        }
    };

    const stopVoiceMeter = async () => {
        if (textOnly) return;
        if (!state.voiceMeter?.stop) return;
        try {
            await state.voiceMeter.stop();
        } catch (_) {
            // Ignore meter teardown failures.
        } finally {
            state.meterRunning = false;
        }
    };

    return {
        startVoiceMeter,
        stopVoiceMeter
    };
};
