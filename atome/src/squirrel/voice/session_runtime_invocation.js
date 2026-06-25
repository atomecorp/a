// Extracted from session_runtime.js: VoiceSessionRuntime invocation/abort/interrupt/local-command methods (prototype mixin; `this` = the runtime).
import {
    DEFAULT_SOURCE_LAYER,
    VOICE_LOCAL_COMMANDS,
    cloneValue,
    detectLocalCommand,
    markTask
} from './session_runtime_support.js';

export const sessionInvocationMethods = {
    buildInvocationContext(sessionId, overrides = {}) {
        const record = this._getRecord(sessionId);
        const sourceLayer = String(overrides?.source_layer || record.data.source.layer || DEFAULT_SOURCE_LAYER);
        return {
            trace_id: record.data.trace_id,
            intent_id: record.data.intent_id,
            source: {
                type: 'voice',
                layer: sourceLayer,
                session_id: record.data.session_id,
                phase: record.data.phase,
                command: record.data.conversation.last_command || null
            },
            active_intent: record.data.conversation.active_intent
                ? {
                    intent_id: record.data.conversation.active_intent.intent_id,
                    domain: record.data.conversation.active_intent.domain,
                    action: record.data.conversation.active_intent.action,
                    execution_target: record.data.conversation.active_intent.execution?.target || 'none'
                }
                : null
        };
    },

    getAbortSignal(sessionId, channel = 'processing') {
        const record = this._getRecord(sessionId);
        return record.controllers.get(String(channel))?.signal || null;
    },

    handleLocalCommand(sessionId, utterance, meta = {}) {
        const parsed = detectLocalCommand(utterance);
        if (!parsed) {
            return {
                matched: false,
                command: null,
                session: this.getSession(sessionId)
            };
        }

        const record = this._getRecord(sessionId);
        const now = this.now();
        record.data.intent_id = String(meta.intent_id || this.idFactory('voice_intent'));
        record.data.conversation.last_command = parsed.command;
        record.data.conversation.last_user_text = parsed.raw;
        this._touch(record, now);
        this._emit(record, 'voice.command', {
            command: parsed.command,
            utterance: parsed.raw,
            matched_alias: parsed.matched_alias
        });

        if (parsed.command === VOICE_LOCAL_COMMANDS.CANCEL) {
            return this.cancelSession(sessionId, {
                reason: 'local_cancel',
                utterance: parsed.raw
            });
        }

        const interruption = this.interrupt(sessionId, {
            reason: 'local_command',
            command: parsed.command,
            utterance: parsed.raw
        });

        if (parsed.command === VOICE_LOCAL_COMMANDS.NEXT) {
            this._queueFollowup(record, 'next_item', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.PREVIOUS) {
            this._queueFollowup(record, 'previous_item', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.SUMMARIZE) {
            this._queueFollowup(record, 'summarize_current', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.REPLY) {
            this._queueFollowup(record, 'reply_current', now);
        }

        this._touch(record, now);
        return {
            matched: true,
            command: parsed.command,
            interruption,
            followup: record.data.conversation.pending_followup,
            context: this.buildInvocationContext(sessionId),
            session: this._snapshot(record)
        };
    },

    consumePendingFollowup(sessionId, { nextPhase = 'processing', allowResume = true } = {}) {
        const record = this._getRecord(sessionId);
        const followup = record.data.conversation.pending_followup
            || ((allowResume === true && record.data.conversation.resume_available) ? 'resume_interrupted' : null);
        if (!followup) return null;
        const now = this.now();
        record.data.phase = nextPhase;
        record.data.conversation.pending_followup = null;
        record.data.conversation.followup_consumed_at = now;
        record.data.conversation.status = 'ready';
        record.data.conversation.resume_available = false;
        record.data.intent_id = this.idFactory('voice_intent');
        this._touch(record, now);
        this._emit(record, 'voice.followup.ready', {
            followup,
            next_phase: nextPhase
        });
        return {
            followup,
            context: this.buildInvocationContext(sessionId),
            active_intent: cloneValue(record.data.conversation.active_intent),
            session: this._snapshot(record)
        };
    },

    interrupt(sessionId, { reason = 'interrupted', command = null, utterance = null } = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        const previousPhase = record.data.phase;
        const abortedChannels = this._abortAll(record, reason);

        if (previousPhase === 'capturing') {
            markTask(record.data.capture, 'cancelled', now, { stop_reason: reason });
        }
        if (previousPhase === 'listening') {
            markTask(record.data.stt, 'cancelled', now, { stop_reason: reason });
        }
        if (record.data.processing.state === 'processing') {
            markTask(record.data.processing, 'cancelled', now, { stop_reason: reason });
        }
        if (record.data.playback.state === 'speaking') {
            markTask(record.data.playback, 'cancelled', now, { stop_reason: reason });
        }

        record.data.phase = 'interrupted';
        record.data.conversation.status = 'interrupted';
        record.data.conversation.interruption_reason = reason;
        record.data.conversation.interrupted_from_phase = previousPhase;
        record.data.conversation.interrupted_at = now;
        record.data.conversation.resume_available = previousPhase === 'speaking' || previousPhase === 'processing';
        record.data.conversation.last_command = command;
        if (utterance) {
            record.data.conversation.last_user_text = utterance;
        }
        this._touch(record, now);
        this._emit(record, 'voice.interruption', {
            reason,
            command,
            previous_phase: previousPhase,
            aborted_channels: abortedChannels
        });

        return {
            session_id: record.data.session_id,
            previous_phase: previousPhase,
            aborted_channels: abortedChannels,
            session: this._snapshot(record)
        };
    },

    cancelSession(sessionId, { reason = 'cancelled', utterance = null } = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        const abortedChannels = this._abortAll(record, reason);
        record.data.phase = 'cancelled';
        record.data.conversation.status = 'cancelled';
        record.data.conversation.interruption_reason = reason;
        record.data.conversation.pending_followup = null;
        record.data.conversation.resume_available = false;
        if (utterance) {
            record.data.conversation.last_user_text = utterance;
        }
        markTask(record.data.capture, record.data.capture.state === 'capturing' ? 'cancelled' : record.data.capture.state, now, {
            stop_reason: record.data.capture.state === 'capturing' ? reason : record.data.capture.stop_reason
        });
        markTask(record.data.stt, record.data.stt.state === 'listening' ? 'cancelled' : record.data.stt.state, now, {
            stop_reason: record.data.stt.state === 'listening' ? reason : record.data.stt.stop_reason
        });
        markTask(record.data.processing, record.data.processing.state === 'processing' ? 'cancelled' : record.data.processing.state, now, {
            stop_reason: record.data.processing.state === 'processing' ? reason : record.data.processing.stop_reason
        });
        markTask(record.data.playback, record.data.playback.state === 'speaking' ? 'cancelled' : record.data.playback.state, now, {
            stop_reason: record.data.playback.state === 'speaking' ? reason : record.data.playback.stop_reason
        });
        this._touch(record, now);
        this._emit(record, 'voice.session.cancelled', {
            reason,
            aborted_channels: abortedChannels
        });
        return {
            matched: true,
            command: VOICE_LOCAL_COMMANDS.CANCEL,
            aborted_channels: abortedChannels,
            context: this.buildInvocationContext(sessionId),
            session: this._snapshot(record)
        };
    },

};
