import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Script } from 'node:vm';

const compiled = await build({ entryPoints: ['eVe/domains/dashboard/dashboard_library_online.js'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'feedModule',
    plugins: [{ name: 'online-media-boundary', setup(builder) {
        builder.onResolve({ filter: /media_library_online\.js$/ }, () => ({ path: 'online', namespace: 'fixture' }));
        builder.onResolve({ filter: /runtime_errors\.js$/ }, () => ({ path: 'errors', namespace: 'fixture' }));
        builder.onResolve({ filter: /project_drop_media_runtime\.js$/ }, () => ({ path: 'upload', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'online'
            ? 'export const discoverOnlineMedia = () => probe.list(); export const searchOnlineMedia = () => probe.list(); export const readOnlineMediaFile = () => probe.thumbnail();'
            : path === 'upload' ? 'export const createABoxApiLoader = () => { throw new Error("unexpected_upload"); };'
                : 'export const reportRuntimeError = error => { throw error; };' }));
    } }] });

const setup = () => {
    const active = new Set(), timers = new Map();
    let serial = 0, thumbnail = async () => new Blob(['thumbnail']);
    const probe = { list: async () => [{ id: `image_${serial}`, title: 'Fixture', has_thumb: true }], thumbnail: () => thumbnail() };
    const context = { probe, console, Blob, URL: {
        createObjectURL: () => { const url = `blob:fixture-${++serial}`; active.add(url); return url; },
        revokeObjectURL: url => { assert(active.delete(url), `releasing an unowned URL: ${url}`); }
    }, setTimeout: fn => { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
    new Script(compiled.outputFiles[0].text).runInNewContext(context);
    const feed = context.feedModule.createLibraryOnlineFeed({ kind: 'image', stored: file => file });
    return { feed, active, timers, defer: fn => { thumbnail = fn; } };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

test('100 online-list sessions release thumbnails, watches and notification timers', async () => {
    const { feed, active, timers } = setup();
    let notifications = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
        const run = feed.discover();
        feed.watch(run, () => notifications++);
        await run.ready;
        await settle();
        assert.equal(active.size, 1);
        assert(timers.size > 0);
        feed.release();
        feed.release();
        assert.equal(active.size, 0);
        assert.equal(timers.size, 0);
    }
    assert.equal(notifications, 0);
});

test('a thumbnail finishing after close cannot allocate or notify a closed list', async () => {
    const { feed, active, timers, defer } = setup();
    let finish;
    defer(() => new Promise(resolve => { finish = resolve; }));
    const run = feed.search('fixture');
    feed.watch(run, () => assert.fail('closed list was notified'));
    await run.ready;
    await settle();
    feed.release();
    finish(new Blob(['late thumbnail']));
    await settle();
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
});

test('releasing a pending search prevents its late results from retaining entries', async () => {
    const { feed, active, timers } = setup();
    const run = feed.search('fixture');
    feed.release();
    await run.ready;
    await settle();
    assert.equal(run.entries.length, 0);
    assert.equal(active.size, 0);
    assert.equal(timers.size, 0);
});

const filmBundle = await build({ entryPoints: ['eVe/domains/dashboard/dashboard_film_sources.js'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'filmModule',
    plugins: [{ name: 'film-service-boundaries', setup(builder) {
        const fixtures = {
            'i18n.js': 'export const eveT = key => key;',
            'streaming_services.js': 'export const STREAMING_SERVICES = []; export const streamingService = () => null;',
            'video_services_preference.js': 'export const isFilmFavorite = () => false; export const readFilmFavorites = () => []; export const readFilmHistory = () => []; export const readVideoServices = () => []; export const recordFilmHistory = () => {}; export const toggleFilmFavorite = () => {};',
            'runtime_errors.js': 'export const reportRuntimeError = error => { throw error; };',
            'video_catalog_client.js': 'export const readVideoCatalog = async () => ({ entries: [], next: "" });',
            'media_library_online.js': 'export const discoverOnlineMedia = async () => [{ id: "archive", title: "Fixture" }]; export const readOnlineMediaFile = () => probe.thumbnail();',
            'streaming_view.js': 'export const isStreamingViewAvailable = () => false;'
        };
        builder.onResolve({ filter: /\.js$/ }, args => {
            const name = args.path.split('/').at(-1);
            return fixtures[name] ? { path: name, namespace: 'film-fixture' } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: 'film-fixture' }, args => ({ contents: fixtures[args.path] }));
    } }] });

test('film source releases completed thumbnails and ignores an in-flight completion', async () => {
    let finish, changed = 0, serial = 0;
    const active = new Set();
    const probe = { thumbnail: async () => new Blob(['fixture']) };
    const context = { probe, Blob, URL: {
        createObjectURL: () => { const url = `blob:film-${++serial}`; active.add(url); return url; },
        revokeObjectURL: url => assert(active.delete(url))
    } };
    new Script(filmBundle.outputFiles[0].text).runInNewContext(context);
    const source = context.filmModule.filmsSource({ changed: () => changed++ });
    await source.discover(''); await settle();
    assert.equal(active.size, 1);
    probe.thumbnail = () => new Promise(resolve => { finish = resolve; });
    await source.discover(''); await settle();
    source.release(); source.release();
    finish(new Blob(['late film'])); await settle();
    assert.equal(active.size, 0);
    assert.equal(changed, 1);
});

const stageBundle = await build({ entryPoints: ['eVe/domains/dashboard/dashboard_stage_list.js'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'stageModule',
    plugins: [{ name: 'stage-render-boundaries', setup(builder) {
        const fixtures = {
            'dashboard_stage_cells.js': 'export const createDashboardStageCells = () => ({ open: async () => ({ok:true}), show: async () => {}, close: async () => { probe.order.push("cells"); }, isOpen: () => true }); export const dashboardStagePlateNode = () => {};',
            'dashboard_mystic_sources.js': 'export const dashboardMysticIconContent = () => ({icon:"fixture"});',
            'dashboard_tokens.js': 'export const DASHBOARD_VISUAL_TOKENS = {metrics:{gap:5}};',
            'system_ui_tokens.js': 'export const SYSTEM_UI_METRICS = {halfUnitPx:30};',
            'dashboard_stage_list_view.js': 'export const stageListLayout = () => {}; export const stageListRowsNode = () => {};',
            'bevy_panel_chips.js': 'export const selectableChipGroupNode = () => {};',
            'i18n.js': 'export const eveT = key => key;'
        };
        builder.onResolve({ filter: /\.js$/ }, args => {
            const name = args.path.split('/').at(-1);
            return fixtures[name] ? { path: name, namespace: 'stage-fixture' } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: 'stage-fixture' }, args => ({ contents: fixtures[args.path] }));
    } }] });

test('the shared stage closes media before releasing the source captured by that opening', async () => {
    const probe = { order: [] }, context = { probe };
    new Script(stageBundle.outputFiles[0].text).runInNewContext(context);
    let current;
    const list = context.stageModule.createDashboardStageList({ treeId: 'fixture', rubric: 'fixture',
        read: () => ({ current: false, rows: [], tools: [] }),
        onClosed: () => probe.order.push('media'),
        win: { clearInterval() {}, clearTimeout() {} },
        openPanel: async options => {
            await current?.close();
            current = options.presentation;
            return current.open({ context: {} });
        } });
    await list.open({ title: 'A', onClosed: () => probe.order.push('source_A') });
    await list.open({ title: 'B', onClosed: () => probe.order.push('source_B') });
    assert.deepEqual(probe.order, ['cells', 'media', 'source_A']);
    await current.close();
    assert.deepEqual(probe.order, ['cells', 'media', 'source_A', 'cells', 'media', 'source_B']);
});
