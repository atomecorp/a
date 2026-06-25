// Extracted from session_runtime.js: VoiceSessionRuntime capture/listening/processing/speaking phase methods (prototype mixin; `this` = the runtime).
import {
    DEFAULT_LOCALE,
    cloneValue,
    markTask
} from './session_runtime_support.js';

export const sessionCaptureMethods = {
    startCapture(sessionId, meta = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._openController(record, 'capture');
        record.data.phase = 'capturing';
        markTask(record.data.capture, 'capturing', now, {
            ended_at: null,
            stop_reason: null,
            result: null,
            meta: meta && typeof meta === 'object' ? { ...meta } : {}
        });
        this._touch(record, now);
        this._emit(record, 'voice.capture.state', {
            state: 'capturing',
            meta: record.data.capture.meta || null
        });
        return this._snapshot(record);
    },

    stopCapture(sessionId, result = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._closeController(record, 'capture');
        record.data.phase = 'captured';
        markTask(record.data.capture, 'stopped', now, {
            stop_reason: 'stopped',
            result: result && typeof result === 'object' ? { ...result } : {}
        });
        this._touch(record, now);
        this._emit(record, 'voice.capture.state', {
            state: 'stopped',
            result: record.data.capture.result
        });
        return this._snapshot(record);
    },

    cancelCapture(sessionId, reason = 'cancelled') {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._abortController(record, 'capture', reason);
        record.data.phase = 'cancelled';
        markTask(record.data.capture, 'cancelled', now, {
            stop_reason: reason
        });
        record.data.conversation.status = 'cancelled';
        this._touch(record, now);
        this._emit(record, 'voice.capture.state', {
            state: 'cancelled',
            reason
        });
        return this._snapshot(record);
    },

    startListening(sessionId, options = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._openController(record, 'stt');
        record.data.phase = 'listening';
        record.data.transcript.lang = String(options.lang || record.data.locale || DEFAULT_LOCALE);
        markTask(record.data.stt, 'listening', now, {
            ended_at: null,
            stop_reason: null,
            provider: options.provider ? String(options.provider) : null,
            partial: options.partial === true
        });
        this._touch(record, now);
        this._emit(record, 'voice.stt.state', {
            state: 'listening',
            provider: record.data.stt.provider,
            lang: record.data.transcript.lang
        });
        return this._snapshot(record);
    },

    pushPartial(sessionId, payload = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        const text = String(payload.text || '').trim();
        record.data.transcript.partial = text || null;
        if (text) {
            record.data.transcript.partials.push({
                text,
                confidence: Number.isFinite(payload.confidence) ? payload.confidence : null,
                at: now
            });
        }
        this._touch(record, now);
        this._emit(record, 'voice.stt.partial', {
            text: record.data.transcript.partial,
            confidence: Number.isFinite(payload.confidence) ? payload.confidence : null
        });
        return this._snapshot(record);
    },

    finalizeListening(sessionId, result = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._closeController(record, 'stt');
        record.data.phase = 'processing';
        markTask(record.data.stt, 'done', now, {
            stop_reason: 'final'
        });
        record.data.transcript.partial = null;
        record.data.transcript.final = result?.text ? String(result.text) : '';
        record.data.transcript.confidence = Number.isFinite(result?.confidence) ? result.confidence : null;
        record.data.transcript.segments = Array.isArray(result?.segments) ? cloneValue(result.segments) : [];
        record.data.conversation.last_user_text = record.data.transcript.final || null;
        this._touch(record, now);
        this._emit(record, 'voice.stt.final', {
            text: record.data.transcript.final,
            confidence: record.data.transcript.confidence,
            segments: record.data.transcript.segments
        });
        return this._snapshot(record);
    },

    startProcessing(sessionId, payload = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._openController(record, 'processing');
        record.data.phase = 'processing';
        markTask(record.data.processing, 'processing', now, {
            ended_at: null,
            stop_reason: null,
            step: payload.step ? String(payload.step) : null,
            meta: payload && typeof payload === 'object' ? { ...payload } : {}
        });
        this._touch(record, now);
        this._emit(record, 'voice.processing.state', {
            state: 'processing',
            step: record.data.processing.step
        });
        return this._snapshot(record);
    },

    finishProcessing(sessionId, payload = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._closeController(record, 'processing');
        markTask(record.data.processing, 'done', now, {
            stop_reason: payload.reason ? String(payload.reason) : 'done'
        });
        this._touch(record, now);
        this._emit(record, 'voice.processing.state', {
            state: 'done',
            reason: record.data.processing.stop_reason
        });
        return this._snapshot(record);
    },

    startSpeaking(sessionId, payload = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._openController(record, 'tts');
        record.data.phase = 'speaking';
        record.data.playback.text = payload?.text ? String(payload.text) : null;
        record.data.playback.voice_id = payload?.voice_id ? String(payload.voice_id) : null;
        record.data.conversation.last_assistant_text = record.data.playback.text;
        if (this.workingMemory?.appendTurn && (record.data.conversation.last_user_text || record.data.playback.text)) {
            const activeIntent = record.data.conversation.active_intent || null;
            this.workingMemory.appendTurn({
                user: record.data.conversation.last_user_text || '',
                assistant: record.data.playback.text || '',
                domain: activeIntent?.domain || null,
                action: activeIntent?.action || null,
                meta: {
                    intent_id: activeIntent?.intent_id || null,
                    session_id: record.data.session_id
                }
            });
        }
        markTask(record.data.playback, 'speaking', now, {
            ended_at: null,
            stop_reason: null
        });
        this._touch(record, now);
        this._emit(record, 'voice.tts.state', {
            state: 'speaking',
            text: record.data.playback.text,
            voice_id: record.data.playback.voice_id
        });
        return this._snapshot(record);
    },

    finishSpeaking(sessionId, payload = {}) {
        const record = this._getRecord(sessionId);
        const now = this.now();
        this._closeController(record, 'tts');
        record.data.phase = 'completed';
        markTask(record.data.playback, 'done', now, {
            stop_reason: payload.reason ? String(payload.reason) : 'done'
        });
        record.data.conversation.status = 'ready';
        record.data.conversation.pending_followup = null;
        record.data.conversation.resume_available = false;
        this._touch(record, now);
        this._emit(record, 'voice.tts.state', {
            state: 'done',
            reason: record.data.playback.stop_reason
        });
        return this._snapshot(record);
    },

};
