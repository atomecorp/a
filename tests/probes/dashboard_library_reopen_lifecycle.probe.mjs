import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Script } from 'node:vm';

const compiled = await build({ entryPoints: ['eVe/domains/dashboard/dashboard_library_list.js'],
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'libraryModule',
    plugins: [{ name: 'library-stage-boundary', setup(builder) {
        const fixtures = {
            'i18n.js': 'export const eveT = key => key;',
            'runtime_errors.js': 'export const reportRuntimeError = error => { throw error; };',
            'media_favorites_preference.js': 'export const isMediaFavorite = () => false; export const toggleMediaFavorite = () => {};',
            'dashboard_stage_list.js': `export const createDashboardStageList = options => {
                let opened = false, afterClosed;
                probe.read = options.read;
                return { open: async next => {
                    if (opened) { await options.onClosed(); await afterClosed?.(); }
                    opened = true; afterClosed = next.onClosed;
                    return {ok:true};
                }, paint: async () => { probe.paints++; }, fullscreen: () => false, changed() {}, clearField() {} };
            };`,
            'dashboard_stage_list_view.js': 'export const stageListClock = () => "";',
            'dashboard_stage_pictures.js': 'export const stagePictureNodes = () => []; export const stageMediaFrame = () => ({});',
            'media_library_online.js': 'export const readOnlineMediaFile = () => { throw new Error("unexpected_media_read"); }; export const readOnlineMediaStream = () => { throw new Error("unexpected_stream"); };',
            'dashboard_stage_list_media.js': 'export const createDashboardStageListMedia = () => ({ current: () => null, stop: async () => {}, inspect: () => ({playing:false}) });',
            'dashboard_media_hold.js': 'export const holdMediaRow = () => {};'
        };
        builder.onResolve({ filter: /\.js$/ }, args => {
            const name = args.path.split('/').at(-1);
            return fixtures[name] ? { path: name, namespace: 'library-fixture' } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: 'library-fixture' }, args => ({ contents: fixtures[args.path] }));
    } }] });

test('a replacement library source stays live after the previous presentation closes', async () => {
    const probe = { paints: 0 }, context = { probe };
    new Script(compiled.outputFiles[0].text).runInNewContext(context);
    const list = context.libraryModule.createDashboardLibraryList({ projectId: 'qa', win: {} });
    let firstShow, secondShow, released = 0;
    await list.open({ source: { kind: 'image', title: 'Own', read: show => { firstShow = show; }, release: () => released++ } });
    await firstShow([{ key: 'own', label: 'Own', kind: 'image' }]);
    assert.equal(list.inspect().rows[0].key, 'row_own');
    await list.open({ source: { kind: 'image', title: 'Online', online: true, read: show => { secondShow = show; } } });
    assert.equal(released, 1, 'only the old source is released');
    await secondShow([{ key: 'online', label: 'Online', kind: 'image', online: true }]);
    assert.equal(list.inspect().rows[0].key, 'row_online', 'the new source must replace its pending rows');
    await firstShow([{ key: 'stale', label: 'Stale', kind: 'image' }]);
    assert.equal(list.inspect().rows[0].key, 'row_online', 'late old results stay excluded');
});
