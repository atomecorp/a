import assert from 'node:assert/strict';
import { test } from 'vitest';

import { renderProjectScene } from '../../eVe/domains/rendering/project_scene_runtime.js';
import { createTestCompositor, installDom, makeMixedRecords } from './unified_rendering_test_helpers.mjs';

// Un rendu complet reconstruit toute la scene. Quand un proprietaire le rejoue
// en boucle, l'appareil se fige et le seul temoin disponible est le milestone
// natif : il portait le nombre d'atomes, jamais l'appelant. Sans le nom, le log
// dit qu'il y a une boucle et rien de plus — c'est exactement la ou l'enquete
// terrain s'arretait.
//
// Le nom ne peut pas venir de la pile : le runtime livre est un bundle minifie
// ou chaque frame est un `chunk-XXXXXXXX.js` anonyme, mesure sur appareil, ou
// dix rendus ont rendu `scene.start.26.chunk` pour tout le monde. Il vient donc
// d'un libelle explicite, et un appelant qui n'en pose pas est `direct` : un
// point d'entree non etiquete, pas un inconnu.

const installBridge = (windowRef) => {
    const stages = [];
    windowRef.webkit = {
        messageHandlers: {
            swiftBridge: {
                postMessage: (message) => { stages.push(String(message?.stage || '')); }
            }
        }
    };
    return stages;
};

const renderOnce = async (stages, options = {}) => {
    await renderProjectScene({
        projectId: 'scene_render_owner_milestone',
        records: makeMixedRecords(3),
        host: globalThis.document.getElementById('project'),
        compositor: createTestCompositor(),
        ...options
    });
    return stages.filter((stage) => stage.startsWith('scene.start.'));
};

test('a full scene render names the entry point that asked for it', async () => {
    const dom = installDom('<!doctype html><html><body><main id="project"></main></body></html>');
    const stages = installBridge(dom.window);

    const starts = await renderOnce(stages);
    assert.equal(starts.length, 1, `one full render publishes one start milestone, got ${JSON.stringify(stages)}`);
    assert.match(starts[0], /^scene\.start\.\d+\.direct$/, 'an unlabelled entry point stays visible as direct');
    assert.equal(
        starts[0],
        `scene.start.${Number(stages.find((stage) => stage.startsWith('scene.normalized.')).split('.').pop())}.direct`,
        'the announced count is the normalized one, not the received array length'
    );
});

test('an explicit owner label survives as a bare bounded identifier', async () => {
    const dom = installDom('<!doctype html><html><body><main id="project"></main></body></html>');
    const stages = installBridge(dom.window);

    const [start] = await renderOnce(stages, { renderOwner: 'projectLoad' });
    assert.match(start, /^scene\.start\.\d+\.projectLoad$/);

    const [sanitized] = await renderOnce(installBridge(dom.window), { renderOwner: 'odd owner/with.space' });
    const owner = sanitized.split('.')[2] || sanitized.split('.').pop();
    assert.match(owner, /^[A-Za-z0-9_-]+$/, 'the owner stays a milestone-safe identifier');
    assert.ok(owner.length <= 48, 'the owner is bounded so the native stage stays readable');
});
