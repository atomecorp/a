import assert from 'node:assert/strict';
import test from 'node:test';

import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const TOOL_CASES = Object.freeze([
    {
        toolId: 'ui.capture.audio',
        boundary: 'audio',
        input: { mode: 'audio', record_source: 'audio' }
    },
    {
        toolId: 'ui.capture.video',
        boundary: 'video',
        input: { mode: 'video', record_source: 'video' }
    },
    {
        toolId: 'ui.detail.record.toggle',
        boundary: 'audio',
        input: { mode: 'media', record_source: 'audio' }
    }
]);

const unwrapResult = (value = null) => {
    let current = value;
    while (
        current
        && typeof current === 'object'
        && !Object.prototype.hasOwnProperty.call(current, 'active')
        && current.result
        && typeof current.result === 'object'
    ) {
        current = current.result;
    }
    return current && typeof current === 'object' ? current : {};
};

test('recording UI tool ids reach the real audio/video start and stop boundaries', async () => {
    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
        const timer = originalSetInterval(...args);
        timer?.unref?.();
        return timer;
    };
    const { window } = installMockBrowserEnv();
    window.__currentProject = { id: 'capture_boundary_probe_project' };
    window.AdoleAPI.atomes.create = async () => ({ ok: true });
    window.AdoleAPI.atomes.alter = async () => ({ ok: true });
    const boundaryCalls = [];
    let detailFallbackCalls = 0;
    let activeToolId = '';

    const createController = (boundary, fileName) => ({
        fileName,
        ...(boundary === 'video' ? {
            previewSourceId: 'capture_boundary_probe_video',
            readPreviewFrame: async () => ({ available: false })
        } : {}),
        stop: async () => {
            boundaryCalls.push({ toolId: activeToolId, boundary, phase: 'stop' });
            return {
                ok: true,
                status: 'stopped',
                fileName,
                path: `/probe/${fileName}`,
                duration: 1,
                duration_sec: 1
            };
        }
    });
    const recordAudio = async (fileName = 'probe.wav') => {
        boundaryCalls.push({ toolId: activeToolId, boundary: 'audio', phase: 'start' });
        return createController('audio', fileName);
    };
    const recordVideo = async (fileName = 'probe.webm') => {
        boundaryCalls.push({ toolId: activeToolId, boundary: 'video', phase: 'start' });
        return createController('video', fileName);
    };

    Object.defineProperty(window, 'record_audio', {
        configurable: true,
        get: () => recordAudio,
        set: () => { }
    });
    Object.defineProperty(window, 'record_video', {
        configurable: true,
        get: () => recordVideo,
        set: () => { }
    });

    const { toolRuntimeV2 } = await import('../../eVe/intuition/runtime/index.js');
    const returnedStates = [];
    const moleculeCalls = [];
    const invoke = (scenario, action, active = null) => toolRuntimeV2.invokeById({
        tool_id: scenario.toolId,
        action,
        input: {
            ...scenario.input,
            ...(typeof active === 'boolean' ? { active } : {})
        },
        source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
        presentation: 'ui'
    });
    try {
        for (const scenario of TOOL_CASES) {
            activeToolId = scenario.toolId;
            if (scenario.toolId === 'ui.detail.record.toggle') {
                window.atome.tools.handlers.set(scenario.toolId, async ({ input = {} } = {}) => {
                    detailFallbackCalls += 1;
                    return {
                        ok: true,
                        active: input.active === true,
                        latched: input.active === true,
                        mode: input.mode || 'key'
                    };
                });
            }
            const started = await invoke(scenario, 'pointer.click');
            const startedAgain = await invoke(scenario, 'state.on', true);
            const stopped = await invoke(scenario, 'pointer.click');
            const stoppedAgain = await invoke(scenario, 'state.off', false);
            returnedStates.push({
                toolId: scenario.toolId,
                start: unwrapResult(started),
                repeatedStart: unwrapResult(startedAgain),
                stop: unwrapResult(stopped),
                repeatedStop: unwrapResult(stoppedAgain)
            });
        }
        window.eveMoleculeTimelineApi = {
            getActiveGroupTimelineId: () => 'group_capture_probe',
            readGroupTimeline: () => ({
                timeline: { transport: { playhead_frame: 24000 }, timebase: { sample_rate: 48000 } }
            }),
            startGroupTimelineRecording: async (detail) => {
                moleculeCalls.push({ phase: 'start', detail });
                return { ok: true, status: 'recording' };
            },
            stopGroupTimelineRecording: async (detail) => {
                moleculeCalls.push({ phase: 'stop', detail });
                return { ok: true, status: 'stopped' };
            }
        };
        window.__HOST_ENV = 'auv3';
        activeToolId = 'ui.detail.record.toggle';
        await toolRuntimeV2.invokeById({
            tool_id: activeToolId,
            action: 'state.on',
            input: { mode: 'media', record_source: 'audio', active: true },
            source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
            presentation: 'ui'
        });
        await toolRuntimeV2.invokeById({
            tool_id: activeToolId,
            action: 'state.off',
            input: { mode: 'media', record_source: 'audio', active: false },
            source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
            presentation: 'ui'
        });
        window.__HOST_ENV = '';
        window.__AUV3_MODE__ = true;
        await toolRuntimeV2.invokeById({
            tool_id: activeToolId,
            action: 'state.on',
            input: { mode: 'media', active: true },
            source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
            presentation: 'ui'
        });
        await toolRuntimeV2.invokeById({
            tool_id: activeToolId,
            action: 'state.off',
            input: { mode: 'media', active: false },
            source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
            presentation: 'ui'
        });
        await toolRuntimeV2.invokeById({
            tool_id: 'ui.detail.record.toggle',
            action: 'state.on',
            input: { mode: 'key', active: true },
            source: { type: 'headless_probe', layer: 'capture_tool_recording_boundary_probe' },
            presentation: 'ui'
        });
    } finally {
        globalThis.setInterval = originalSetInterval;
    }

    const observations = TOOL_CASES.map((scenario) => ({
        toolId: scenario.toolId,
        boundary: scenario.boundary,
        starts: boundaryCalls.filter((entry) => (
            entry.toolId === scenario.toolId
            && entry.boundary === scenario.boundary
            && entry.phase === 'start'
        )).length,
        stops: boundaryCalls.filter((entry) => (
            entry.toolId === scenario.toolId
            && entry.boundary === scenario.boundary
            && entry.phase === 'stop'
        )).length
    }));
    const expected = TOOL_CASES.map((scenario) => ({
        toolId: scenario.toolId,
        boundary: scenario.boundary,
        starts: 1,
        stops: 1
    }));
    const recordingStates = returnedStates.map((entry) => ({
        toolId: entry.toolId,
        startOk: entry.start?.ok === true,
        startActive: entry.start?.active === true,
        repeatedStartIdempotent: entry.repeatedStart?.idempotent === true,
        stopOk: entry.stop?.ok === true,
        stopActive: entry.stop?.active === true,
        repeatedStopIdempotent: entry.repeatedStop?.idempotent === true
    }));
    const expectedRecordingStates = TOOL_CASES.map((scenario) => ({
        toolId: scenario.toolId,
        startOk: true,
        startActive: true,
        repeatedStartIdempotent: true,
        stopOk: true,
        stopActive: false,
        repeatedStopIdempotent: true
    }));

    assert.deepEqual(
        observations,
        expected,
        `UI recording handlers returned state without reaching recorder boundaries: ${JSON.stringify(returnedStates)}`
    );
    assert.deepEqual(
        recordingStates,
        expectedRecordingStates,
        `Recording state transitions failed: ${JSON.stringify(returnedStates)}`
    );
    assert.equal(detailFallbackCalls, 1, 'key/live detail modes must keep using the existing detail handler');
    assert.deepEqual(moleculeCalls.map((entry) => entry.phase), ['start', 'stop', 'start', 'stop']);
    assert.equal(moleculeCalls[0].detail.timeline_start_frame, 24000);
    assert.equal(moleculeCalls[0].detail.clock_reference, 'record_start_render_quantum');
    assert.equal(moleculeCalls[0].detail.capture_source, 'plugin_input');
    assert.equal(moleculeCalls[0].detail.clock_id, 'auv3.render');
    assert.equal(moleculeCalls[2].detail.record_source, 'audio');
    assert.equal(moleculeCalls[2].detail.capture_source, 'plugin_input');
    assert.equal(moleculeCalls[2].detail.clock_id, 'auv3.render');
    assert.equal(moleculeCalls[2].detail.timeline_clock_id, 'auv3.host_transport');
});
