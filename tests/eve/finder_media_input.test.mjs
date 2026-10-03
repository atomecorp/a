import { test, expect } from 'vitest';
import { createFinderPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js';
import { searchYoutube } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_data.js';
import { FastifyAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
import { buildSelectionKey } from '../../eVe/intuition/tools/finder_record_model.js';

const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])]);
const setup = options => {
    let callbacks, active = false, stopped = 0;
    const session = { start(value) { callbacks = value; active = true; }, stop(args) { active = false; stopped++; if (args?.notifyBlur) callbacks?.onBlur(); },
        active: () => active, beginSelection() {} };
    const runtime = createFinderPanelSurface({ events: { on: () => () => {} }, createQuerySession: () => session,
        loadRecords: async () => [], ...options });
    const draw = () => flatten(runtime.surface.buildContent(runtime.readState(), { bodyWidth: 500, bodyHeight: 450, emit() {} }));
    return { runtime, draw, type(value) { callbacks.onInput(value, { value, active: true, selection: { start: value.length, end: value.length, caret: value.length } }); },
        submit: () => callbacks.onSubmit(), stopped: () => stopped };
};
const tvRows = [{ id: 'france2', type: 'tv_channel', name: 'France 2', textIndex: 'france 2 fr2', categories: ['general'] },
    { id: 'bfm', type: 'tv_channel', name: 'BFM', textIndex: 'bfm news', categories: ['news'] }];
test('TV composes shared input, ignores inherited filters, filters without requests, and restores context', async () => {
    let loads = 0, activates = 0, closes = 0;
    const { runtime, draw, type, submit, stopped } = setup();
    await runtime.applyToolContext({ scope: 'images', query: 'previous' });
    runtime.state.selectedTags = ['health']; runtime.state.family = 'music';
    await runtime.applyToolContext({ owner: 'tv', scope: 'tv', query: '', lockScope: true,
        source: { load: async () => { loads++; return tvRows; }, activate: () => { activates++; return { ok: true }; }, onClose: () => closes++ } });
    const nodes = draw(); expect(nodes.some(node => node.id === 'finder_query')).toBe(true);
    expect(runtime.readState()).toMatchObject({ scopeChipsVisible: false, tagsVisible: false, conditionsVisible: false, canTransfer: false });
    expect(runtime.readState().records).toHaveLength(2);
    await runtime.handleEvent({ type: 'finder.query.field.focus', key: 'query' });
    type('fr2'); expect(runtime.readState().records.map(row => row.id)).toEqual(['france2']);
    submit(); expect(activates).toBe(0); expect(loads).toBe(1);
    await runtime.handleEvent({ type: 'finder.query.field.focus', key: 'query' });
    type(''); expect(runtime.readState().records).toHaveLength(2); expect(loads).toBe(1);
    await runtime.handleEvent({ type: 'finder.row.activate', key: buildSelectionKey(tvRows[0]) }); expect(activates).toBe(1);
    runtime.surface.onClose(); expect(closes).toBe(1); expect(stopped()).toBeGreaterThan(0);
    expect(runtime.state).toMatchObject({ scope: 'images', query: 'previous', family: 'music', selectedTags: ['health'] });
});
test('YouTube submits only on Enter, preserves pagination and ignores responses after edit or close', async () => {
    let finish; const requests = [];
    const { runtime, draw, type, submit } = setup({ searchVideos: request => { requests.push(request); return new Promise(resolve => { finish = resolve; }); } });
    await runtime.applyToolContext({ owner: 'youtube', scope: 'youtube', query: '', source: { load: async () => [] } });
    draw(); await runtime.handleEvent({ type: 'finder.query.field.focus', key: 'query' });
    type('piano'); expect(requests).toHaveLength(0); submit(); expect(requests).toEqual([{ query: 'piano', pageToken: '' }]);
    finish({ records: [{ id: 'abcDEFghi12', type: 'image', name: 'Piano' }], nextPageToken: 'page2' });
    await new Promise(resolve => setTimeout(resolve, 0)); expect(runtime.readState().query).toBe('piano');
    const page = runtime.handleEvent({ type: 'finder.youtube.more' }); expect(requests[1].pageToken).toBe('page2');
    await runtime.handleEvent({ type: 'finder.query.field.focus', key: 'query' }); type('drums');
    finish({ records: [{ id: 'late', type: 'image', name: 'Late' }], nextPageToken: '' }); await page;
    expect(runtime.readState().records).toEqual([]); submit(); runtime.surface.onClose();
    finish({ records: [{ id: 'closed', type: 'image' }], nextPageToken: '' });
    await new Promise(resolve => setTimeout(resolve, 0)); expect(runtime.state.records).toEqual([]);
});
test('YouTube reads canonical WebSocket envelope, pagination and precise service errors', async () => {
    const send = FastifyAdapter.ws.send;
    try {
        FastifyAdapter.ws.send = async () => ({ ok: true, status: 'ok', data: { ok: true, results: [{ videoId: 'abcDEFghi12', title: 'Piano', channel: 'Artist', thumbnail: 'https://example.test/thumb' }], nextPageToken: 'next' } });
        expect(await searchYoutube({ query: 'piano' })).toMatchObject({ records: [{ id: 'abcDEFghi12', name: 'Piano' }], nextPageToken: 'next' });
        FastifyAdapter.ws.send = async () => ({ ok: true, data: { ok: false, error: 'youtube_quota_exceeded' } });
        await expect(searchYoutube({ query: 'piano' })).rejects.toThrow('youtube_quota_exceeded');
        FastifyAdapter.ws.send = async () => ({ ok: true, data: {} });
        await expect(searchYoutube({ query: 'piano' })).rejects.toThrow('youtube_search_invalid_response');
    } finally { FastifyAdapter.ws.send = send; }
});
