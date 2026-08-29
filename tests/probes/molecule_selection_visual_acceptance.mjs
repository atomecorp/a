import fs from 'node:fs';
import { PNG } from 'pngjs';
import { assert, recordCenter, waitForStableScene } from './molecule_ui_acceptance_support.mjs';
import { drag, screenshot } from './molecule_ui_drop_core.mjs';

export const assertClosedMoleculePicking = async ({ page, project, ownerId, memberIds, report, outDir }) => {
    const states = () => page.evaluate(async (ids) => Promise.all(ids.map((id) => window.Atome.getStateCurrent(id))), [ownerId, ...memberIds]);
    const position = (state) => {
        const p = state?.properties || state?.props || {};
        return [Number.parseFloat(p.left ?? p.x), Number.parseFloat(p.top ?? p.y)];
    };
    const targets = await Promise.all(memberIds.map((id) => recordCenter(page, project.id, (r) => r.id === id, { sceneCoordinates: true })));
    targets.sort((a, b) => a.x - b.x);
    const left = targets[0].x + targets[0].width / 2;
    const right = targets[1].x - targets[1].width / 2;
    assert(right - left > 25, 'molecule_fixture_requires_empty_gap');
    const gap = { x: (left + right) / 2, y: targets[0].y, coordinate_source: 'scene' };
    const before = (await states()).map(position);
    await drag({ page, source: gap, destination: { ...gap, y: gap.y + 20 } });
    await waitForStableScene(page, project.id);
    assert(JSON.stringify((await states()).map(position)) === JSON.stringify(before), 'empty_molecule_gap_moved_members');
    const shot = await screenshot({ page, report, outDir, name: 'molecule_closed_transparent_gap' });
    const png = PNG.sync.read(fs.readFileSync(shot.file));
    const pixel = (x, y) => Array.from(png.data.subarray((Math.round(y) * png.width + Math.round(x)) * 4,
        (Math.round(y) * png.width + Math.round(x)) * 4 + 4));
    const inside = pixel(gap.x, gap.y), outside = pixel(gap.x, targets[0].y - targets[0].height / 2 - 25);
    assert(inside.every((value, index) => Math.abs(value - outside[index]) < 3), `molecule_body_not_transparent:${inside}:${outside}`);
    for (const id of memberIds) {
        const origin = (await states()).map(position);
        const target = await recordCenter(page, project.id, (r) => r.id === id, { sceneCoordinates: true });
        await drag({ page, source: target, destination: { ...target, x: target.x + 20 } });
        await waitForStableScene(page, project.id);
        const moved = (await states()).map(position);
        assert(moved.every((p, index) => Math.abs(p[0] - origin[index][0] - 20) < 0.01 && p[1] === origin[index][1]),
            `molecule_member_drag_not_solid:${id}:${JSON.stringify({ origin, moved })}`);
    }
    await screenshot({ page, report, outDir, name: 'molecule_closed_moved_from_each_member' });
    return { gapUnchanged: true, transparentBody: true, movedFromMembers: memberIds };
};
