import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { SyncEngine } from '../../atome/src/squirrel/apis/unified/sync_engine.js';
import { setEveLocale } from '../../eVe/i18n/i18n.js';
import { readHomeServerState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import { createHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_state.js';
import { buildHomeContent } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js';

const previousWindow = globalThis.window;
afterEach(() => { globalThis.window = previousWindow; setEveLocale('fr'); });
const flatten = nodes => nodes.flatMap(entry => [entry, ...flatten(entry.children || [])]);
const editing = { displayValue: () => '', fieldView: () => ({}), registerFieldWidth() {} };

test('server version comes from the connected sync peer and disappears on disconnect', () => {
    const engine = new SyncEngine({ env: {}, token: () => '' });
    globalThis.window = {
        __SQUIRREL_VERSIONS__: { atome: '1.19', eve: '1.20' },
        Squirrel: { SyncEngine: engine }
    };
    assert.equal(readHomeServerState().versions.server, null);
    engine.handleMessage(JSON.stringify({ type: 'welcome', version: '1.17' }));
    assert.deepEqual(readHomeServerState().versions, { atome: '1.19', eve: '1.20', server: '1.17' });
    engine.disconnect();
    assert.equal(engine.getState().serverVersion, null);
    assert.equal(readHomeServerState().versions.server, null);
    engine.handleMessage(JSON.stringify({ type: 'welcome' }));
    assert.equal(engine.getState().serverVersion, null, 'a peer without metadata must not reuse the old version');
});

for (const locale of ['fr', 'en']) for (const width of [300, 452]) {
    test(`Version unfolds beside Add (${locale}, ${width}px) with three values and preserves Add action`, () => {
        setEveLocale(locale);
        const state = createHomePanelState();
        state.expanded = 'settings';
        Object.assign(state.subsections, { 'settings.security': true, 'account.server': true });
        state.server.versions = { atome: '1.19', eve: '1.20', server: '1.17' };
        const intents = [];
        const render = () => flatten(buildHomeContent(state, { emit: intent => intents.push(intent), bodyWidth: width, editing }));
        let nodes = render();
        const header = nodes.find(entry => entry.id === 'home_server_versions_accordion_header');
        assert.ok(header);
        assert.equal(nodes.some(entry => entry.id === 'home_server_version_eve'), false);
        header.on.activate();
        assert.deepEqual(intents.pop(), { type: 'home.subaccordion.toggle', section: 'server.versions' });
        state.subsections['server.versions'] = true;
        nodes = render();
        const row = nodes.find(entry => entry.id === 'home_server_actions');
        assert.deepEqual(row.children.map(entry => entry.id), ['home_server_add', 'home_server_versions_accordion']);
        assert.ok(row.style.size[1] >= row.children[1].style.size[1]);
        for (const [key, version] of Object.entries(state.server.versions)) {
            assert.ok(nodes.find(entry => entry.id === `home_server_version_${key}`).text.endsWith(version));
        }
        row.children[0].on.activate();
        assert.deepEqual(intents.pop(), { type: 'home.server.add' });
        state.server.versions.server = null;
        const unavailable = render().find(entry => entry.id === 'home_server_version_server');
        assert.match(unavailable.text, locale === 'fr' ? /Indisponible/ : /Unavailable/);
    });
}
