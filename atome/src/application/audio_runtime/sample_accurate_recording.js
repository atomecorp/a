import { hasSwiftBridge, isAuv3AudioRuntime } from './runtime_audio_backend.js';

export const AUV3_RECORD_START_CLOCK_REFERENCE = 'record_start_render_quantum';
export const AUV3_RECORDING_TIMELINE_CLOCK_ID = 'auv3.host_transport';
export const AUV3_RECORDING_SOURCE = 'plugin_input';

export const SAMPLE_ACCURATE_RECORDING_ERROR_CODES = Object.freeze({
    CAPABILITY_UNSUPPORTED: 'av_sample_accurate_overdub_unsupported',
    INVALID_CLOCK: 'av_sample_clock_invalid',
    INVALID_FRAME: 'av_sample_frame_invalid',
    INVALID_SAMPLE_RATE: 'av_sample_rate_invalid',
    CLOCK_MISMATCH: 'av_sample_clock_mismatch',
    SAMPLE_RATE_MISMATCH: 'av_sample_rate_mismatch',
    RECORDING_OVERRUN: 'av_recording_overrun',
    RECORDING_DISCONTINUITY: 'av_recording_discontinuity',
    EMPTY_RECORDING: 'av_recording_empty'
});

export class SampleAccurateRecordingError extends Error {
    constructor(code, detail = {}) {
        super(code);
        this.name = 'SampleAccurateRecordingError';
        this.code = code;
        this.detail = Object.freeze({ ...detail });
    }
}

const safeString = (value) => String(value ?? '').trim();

const fail = (code, detail = {}) => {
    throw new SampleAccurateRecordingError(code, detail);
};

const requireFrame = (value, field, { positive = false, signed = false } = {}) => {
    if (!Number.isSafeInteger(value) || (!signed && value < 0) || (positive && value <= 0)) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_FRAME, { field, value });
    }
    return value;
};

const requireSampleRate = (value, field) => {
    if (!Number.isSafeInteger(value) || value <= 0) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_SAMPLE_RATE, { field, value });
    }
    return value;
};

const requireClockId = (value) => {
    const clockId = safeString(value);
    const normalized = clockId.toLowerCase();
    if (!clockId || normalized.includes('performance') || normalized.includes('date') || normalized.includes('wall')) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_CLOCK, { clock_id: clockId || null });
    }
    return clockId;
};

const requireClockReference = (value) => {
    const reference = safeString(value);
    if (reference !== AUV3_RECORD_START_CLOCK_REFERENCE) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_CLOCK, { clock_reference: reference || null });
    }
    return reference;
};

const requirePluginInputSource = (value, field = 'source') => {
    const source = safeString(value);
    if (source !== AUV3_RECORDING_SOURCE) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CAPABILITY_UNSUPPORTED, {
            field,
            source: source || null,
            reason: 'auv3_render_input_required'
        });
    }
    return source;
};

const unsupported = ({ runtime = 'unknown', mediaKind = 'audio', source = 'mic', reason = '' } = {}) => Object.freeze({
    supported: false,
    capability: 'sample_accurate_overdub',
    runtime,
    media_kind: mediaKind,
    source,
    error: SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CAPABILITY_UNSUPPORTED,
    reason
});

export const resolveSampleAccurateRecordingCapability = (env = globalThis, input = {}) => {
    const mediaKind = safeString(input.media_kind || input.mediaKind || 'audio').toLowerCase();
    const source = safeString(input.source || 'mic');
    if (mediaKind !== 'audio') {
        return unsupported({ mediaKind, source, reason: 'media_clock_mapping_unavailable' });
    }
    if (!isAuv3AudioRuntime(env) || !hasSwiftBridge(env)) {
        return unsupported({ mediaKind, source, reason: 'common_render_clock_unavailable' });
    }
    if (source !== AUV3_RECORDING_SOURCE) {
        return unsupported({ runtime: 'ios_auv3', mediaKind, source, reason: 'auv3_render_input_required' });
    }
    const requestedClockId = safeString(input.clock_id || input.clockId || 'auv3.render');
    if (requestedClockId !== 'auv3.render') {
        return unsupported({ runtime: 'ios_auv3', mediaKind, source, reason: 'requested_clock_not_supported' });
    }
    const clockReference = safeString(input.clock_reference || input.clockReference);
    if (clockReference !== AUV3_RECORD_START_CLOCK_REFERENCE) {
        return unsupported({ runtime: 'ios_auv3', mediaKind, source, reason: 'record_start_clock_reference_required' });
    }
    const timelineClockId = safeString(input.timeline_clock_id || input.timelineClockId);
    if (timelineClockId !== AUV3_RECORDING_TIMELINE_CLOCK_ID) {
        return unsupported({ runtime: 'ios_auv3', mediaKind, source, reason: 'auv3_host_transport_timeline_required' });
    }
    return Object.freeze({
        supported: true,
        capability: 'sample_accurate_overdub',
        runtime: 'ios_auv3',
        media_kind: 'audio',
        source: AUV3_RECORDING_SOURCE,
        clock_id: 'auv3.render',
        clock_reference: AUV3_RECORD_START_CLOCK_REFERENCE,
        timeline_clock_id: AUV3_RECORDING_TIMELINE_CLOCK_ID,
        alignment: 'latched_render_and_host_transport_frames'
    });
};

export const validateSampleAccurateRecordingRequest = (input = {}) => {
    const mediaKind = safeString(input.media_kind || input.mediaKind || 'audio').toLowerCase();
    if (mediaKind !== 'audio') {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CAPABILITY_UNSUPPORTED, { media_kind: mediaKind });
    }
    requirePluginInputSource(input.source, 'source');
    requireClockId(input.clock_id || input.clockId);
    requireClockReference(input.clock_reference || input.clockReference);
    if (safeString(input.timeline_clock_id || input.timelineClockId) !== AUV3_RECORDING_TIMELINE_CLOCK_ID) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_CLOCK, {
            timeline_clock_id: safeString(input.timeline_clock_id || input.timelineClockId) || null
        });
    }
    requireSampleRate(input.timeline_sample_rate ?? input.timelineSampleRate, 'timeline_sample_rate');
    requireFrame(input.timeline_start_frame ?? input.timelineStartFrame, 'timeline_start_frame');
    return input;
};

export const normalizeSampleAccurateRecordingResult = (request = {}, result = {}) => {
    validateSampleAccurateRecordingRequest(request);
    const resultSource = requirePluginInputSource(result.source, 'result.source');
    const requestedClockId = requireClockId(request.clock_id || request.clockId);
    const resultClockId = requireClockId(result.clock_id || result.clockId);
    const requestedClockReference = requireClockReference(request.clock_reference || request.clockReference);
    const resultClockReference = requireClockReference(result.clock_reference || result.clockReference);
    const requestedTimelineClockId = safeString(request.timeline_clock_id || request.timelineClockId);
    const resultTimelineClockId = safeString(result.timeline_clock_id || result.timelineClockId);
    const clockEpoch = safeString(result.clock_epoch || result.clockEpoch);
    const requestedClockEpoch = safeString(request.clock_epoch || request.clockEpoch);
    if (resultClockId !== requestedClockId || resultClockReference !== requestedClockReference
        || requestedTimelineClockId !== AUV3_RECORDING_TIMELINE_CLOCK_ID
        || resultTimelineClockId !== requestedTimelineClockId
        || !clockEpoch || (requestedClockEpoch && clockEpoch !== requestedClockEpoch)) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CLOCK_MISMATCH, {
            requested_clock_id: requestedClockId,
            result_clock_id: resultClockId,
            requested_clock_epoch: requestedClockEpoch || null,
            clock_epoch: clockEpoch || null,
            requested_timeline_clock_id: requestedTimelineClockId || null,
            timeline_clock_id: resultTimelineClockId || null
        });
    }

    const timelineSampleRate = requireSampleRate(
        request.timeline_sample_rate ?? request.timelineSampleRate,
        'timeline_sample_rate'
    );
    const fileSampleRate = requireSampleRate(result.sample_rate ?? result.sampleRate, 'sample_rate');
    if (fileSampleRate !== timelineSampleRate) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.SAMPLE_RATE_MISMATCH, {
            timeline_sample_rate: timelineSampleRate,
            sample_rate: fileSampleRate
        });
    }

    const overrunFrames = requireFrame(result.overrun_frames ?? result.overrunFrames, 'overrun_frames');
    if (overrunFrames !== 0) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.RECORDING_OVERRUN, { overrun_frames: overrunFrames });
    }
    const discontinuityFrames = requireFrame(
        result.discontinuity_frames ?? result.discontinuityFrames,
        'discontinuity_frames'
    );
    if (discontinuityFrames !== 0) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.RECORDING_DISCONTINUITY, {
            discontinuity_frames: discontinuityFrames
        });
    }

    const frameCount = requireFrame(result.frame_count ?? result.frameCount, 'frame_count', { positive: true });
    const captureStartFrame = requireFrame(
        result.recording_start_frame ?? result.recordingStartFrame,
        'recording_start_frame'
    );
    const playbackStartFrame = requireFrame(
        result.playback_start_frame ?? result.playbackStartFrame,
        'playback_start_frame'
    );
    const playbackObservedFrame = requireFrame(
        result.playback_observed_frame ?? result.playbackObservedFrame,
        'playback_observed_frame'
    );
    if (playbackStartFrame >= captureStartFrame || playbackObservedFrame !== captureStartFrame) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CLOCK_MISMATCH, {
            recording_start_frame: captureStartFrame,
            playback_start_frame: playbackStartFrame,
            playback_observed_frame: playbackObservedFrame
        });
    }
    const inputLatencyFrames = requireFrame(
        result.input_latency_frames ?? result.inputLatencyFrames,
        'input_latency_frames',
        { positive: true }
    );
    const outputLatencyFrames = requireFrame(
        result.output_latency_frames ?? result.outputLatencyFrames,
        'output_latency_frames',
        { positive: true }
    );
    const measuredRoundtripLatencyFrames = inputLatencyFrames + outputLatencyFrames;
    if (!Number.isSafeInteger(measuredRoundtripLatencyFrames)) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_FRAME, {
            field: 'roundtrip_latency_frames',
            value: measuredRoundtripLatencyFrames
        });
    }
    const roundtripLatencyFrames = requireFrame(
        result.roundtrip_latency_frames ?? result.roundtripLatencyFrames,
        'roundtrip_latency_frames',
        { positive: true }
    );
    const recordOffsetFramesApplied = requireFrame(
        result.record_offset_frames_applied ?? result.recordOffsetFramesApplied,
        'record_offset_frames_applied',
        { positive: true }
    );
    if (roundtripLatencyFrames !== measuredRoundtripLatencyFrames
        || recordOffsetFramesApplied !== roundtripLatencyFrames) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_FRAME, {
            field: 'latency_compensation_frames',
            input_latency_frames: inputLatencyFrames,
            output_latency_frames: outputLatencyFrames,
            roundtrip_latency_frames: roundtripLatencyFrames,
            record_offset_frames_applied: recordOffsetFramesApplied
        });
    }
    const requestedTimelineStartFrame = requireFrame(
        request.timeline_start_frame ?? request.timelineStartFrame,
        'timeline_start_frame'
    );
    const timelineOriginFrame = requireFrame(
        result.timeline_origin_frame ?? result.timelineOriginFrame,
        'timeline_origin_frame'
    );
    if (timelineOriginFrame !== requestedTimelineStartFrame) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CLOCK_MISMATCH, {
            requested_timeline_start_frame: requestedTimelineStartFrame,
            timeline_origin_frame: timelineOriginFrame
        });
    }
    const rawTimelineStartFrame = timelineOriginFrame - roundtripLatencyFrames;
    if (!Number.isSafeInteger(rawTimelineStartFrame)) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_FRAME, {
            field: 'computed_timeline_start_frame',
            value: rawTimelineStartFrame
        });
    }
    const sourceInFrame = Math.max(0, -rawTimelineStartFrame);
    const timelineStartFrame = Math.max(0, rawTimelineStartFrame);
    const durationFrames = frameCount - sourceInFrame;
    if (!Number.isSafeInteger(durationFrames) || durationFrames <= 0) {
        fail(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.EMPTY_RECORDING, {
            frame_count: frameCount,
            source_in_frame: sourceInFrame
        });
    }

    return Object.freeze({
        source: resultSource,
        clock_id: resultClockId,
        clock_reference: resultClockReference,
        clock_epoch: clockEpoch,
        timeline_clock_id: resultTimelineClockId,
        timeline_origin_frame: timelineOriginFrame,
        timeline_sample_rate: timelineSampleRate,
        timeline_start_frame: timelineStartFrame,
        timeline_end_frame: timelineStartFrame + durationFrames,
        duration_frames: durationFrames,
        source_in_frame: sourceInFrame,
        source_out_frame: frameCount,
        capture_start_frame: captureStartFrame,
        playback_start_frame: playbackStartFrame,
        playback_observed_frame: playbackObservedFrame,
        input_latency_frames: inputLatencyFrames,
        output_latency_frames: outputLatencyFrames,
        roundtrip_latency_frames: roundtripLatencyFrames,
        record_offset_frames_applied: recordOffsetFramesApplied,
        provider: safeString(result.provider) || 'unknown'
    });
};
