import {
    toText,
    mergeTranscriptFragments,
    isClearlyCompleteCommand,
    isTranscriptActionable
} from './home_surface_transcript.js';

export const createHomeVoiceTranscriptRuntime = ({
    env,
    state,
    config,
    textOnly,
    debugVoice,
    actions
}) => {
    const clearTranscriptCommitTimers = () => {
        if (state.transcriptFastCommitTimer) {
            env.clearTimeout?.(state.transcriptFastCommitTimer);
            state.transcriptFastCommitTimer = null;
        }
        if (state.transcriptPauseCommitTimer) {
            env.clearTimeout?.(state.transcriptPauseCommitTimer);
            state.transcriptPauseCommitTimer = null;
        }
        if (state.transcriptForceCommitTimer) {
            env.clearTimeout?.(state.transcriptForceCommitTimer);
            state.transcriptForceCommitTimer = null;
        }
    };

    const buildMergedTranscript = (value = state.transcriptDraft) => (
        mergeTranscriptFragments(state.pendingTranscriptPrefix, toText(value))
    );

    const requestTranscriptCommit = async ({
        force = false,
        reason = 'pause'
    } = {}) => {
        if (textOnly || !state.active || !state.listening || state.processing || state.speaking || state.commitRequested) return;
        const mergedText = buildMergedTranscript();
        if (!mergedText) return;
        if (!force && !isTranscriptActionable(mergedText)) return;
        state.commitRequested = true;
        clearTranscriptCommitTimers();
        debugVoice('transcript_commit_requested', {
            sessionId: state.sessionId,
            reason,
            force,
            text: mergedText
        });
        try {
            await actions.stopListeningLoop({ commitPartial: true });
        } catch (_) {
            state.commitRequested = false;
        }
    };

    const scheduleTranscriptCommitEvaluation = () => {
        if (textOnly || !state.active || !state.listening || state.processing || state.speaking || state.commitRequested) return;
        const mergedText = buildMergedTranscript();
        if (!mergedText) return;
        clearTranscriptCommitTimers();
        if (isClearlyCompleteCommand(mergedText)) {
            state.transcriptFastCommitTimer = env.setTimeout?.(() => {
                state.transcriptFastCommitTimer = null;
                void requestTranscriptCommit({ force: false, reason: 'fast_pause' });
            }, config.fastCommitMs) || null;
        }
        state.transcriptPauseCommitTimer = env.setTimeout?.(() => {
            state.transcriptPauseCommitTimer = null;
            void requestTranscriptCommit({ force: false, reason: 'pause' });
        }, config.pauseCommitMs) || null;
        state.transcriptForceCommitTimer = env.setTimeout?.(() => {
            state.transcriptForceCommitTimer = null;
            void requestTranscriptCommit({ force: true, reason: 'force_pause' });
        }, config.forceCommitMs) || null;
    };

    return {
        clearTranscriptCommitTimers,
        buildMergedTranscript,
        requestTranscriptCommit,
        scheduleTranscriptCommitEvaluation
    };
};
