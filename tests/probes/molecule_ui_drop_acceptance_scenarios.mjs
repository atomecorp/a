import { runApngImageAcceptance } from './apng_image_acceptance.mjs';
import { runToolTextRecordAcceptance } from './tool_text_record_acceptance.mjs';
import { createDropFixture } from './molecule_ui_drop_core.mjs';
import { validateListMoleculeDrop } from './molecule_ui_drop_list.mjs';
import { validateMatrixMoleculeDrop } from './molecule_ui_drop_matrix.mjs';
import { validateNaturalMoleculeDrop } from './molecule_ui_drop_natural.mjs';
import { runLayeredMediaMoleculeAcceptance } from './molecule_ui_layered_media.mjs';
import { runMoleculeOrderTextRegressions } from './molecule_ui_order_text_regressions.mjs';
import { runMoleculeDragPerformanceAcceptance } from './molecule_drag_performance_acceptance.mjs';

const SCENARIOS = Object.freeze([
    ['natural', validateNaturalMoleculeDrop],
    ['list', validateListMoleculeDrop],
    ['matrix', validateMatrixMoleculeDrop]
]);

export const runMoleculeDropAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    if (process.env.MOLECULE_UI_DRAG_PERF_ONLY === '1') {
        return runMoleculeDragPerformanceAcceptance({ page, report, check, ensureProject });
    }
    if (process.env.MOLECULE_UI_TEXT_TOOLS_ONLY === '1') return runToolTextRecordAcceptance({ page, report, check, ensureProject, outDir });
    if (process.env.MOLECULE_UI_APNG_ONLY === '1') return runApngImageAcceptance({ page, report, check, ensureProject, outDir });
    if (process.env.MOLECULE_UI_ORDER_TEXT_ONLY === '1') {
        return runMoleculeOrderTextRegressions({ page, report, check, ensureProject, outDir });
    }
    const layeredOnly = process.env.MOLECULE_UI_LAYERED_MEDIA_ONLY === '1';
    if (!layeredOnly) {
    const requestedView = String(process.env.MOLECULE_UI_DROP_VIEW || '').trim();
    for (const [mode, validate] of SCENARIOS.filter(([key]) => !requestedView || key === requestedView)) {
        const project = await ensureProject(page, `Molecule Drop ${mode} ${Date.now()}`);
        if (!project?.ok || !project?.id) throw new Error(`${mode}_project_create_failed:${JSON.stringify(project)}`);
        const fixture = await createDropFixture(page, project.id, `drop_${mode}_${Date.now()}`);
        await check(`real ${mode} drop creates one persistent Molecule without floating members`, () => (
            validate({ page, project, fixture, report, outDir })
        ));
    }
    }
    if (layeredOnly || process.env.MOLECULE_UI_SKIP_LAYERED_MEDIA !== '1') {
        await check('real layered video Molecule mixes audio and persists six ordered members', () => (
            runLayeredMediaMoleculeAcceptance({ page, report, ensureProject, outDir })
        ));
    }
};
