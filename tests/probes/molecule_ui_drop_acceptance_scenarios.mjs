import { createDropFixture } from './molecule_ui_drop_core.mjs';
import { validateListMoleculeDrop } from './molecule_ui_drop_list.mjs';
import { validateMatrixMoleculeDrop } from './molecule_ui_drop_matrix.mjs';
import { validateNaturalMoleculeDrop } from './molecule_ui_drop_natural.mjs';

const SCENARIOS = Object.freeze([
    ['natural', validateNaturalMoleculeDrop],
    ['list', validateListMoleculeDrop],
    ['matrix', validateMatrixMoleculeDrop]
]);

export const runMoleculeDropAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const requestedView = String(process.env.MOLECULE_UI_DROP_VIEW || '').trim();
    for (const [mode, validate] of SCENARIOS.filter(([key]) => !requestedView || key === requestedView)) {
        const project = await ensureProject(page, `Molecule Drop ${mode} ${Date.now()}`);
        if (!project?.ok || !project?.id) throw new Error(`${mode}_project_create_failed:${JSON.stringify(project)}`);
        const fixture = await createDropFixture(page, project.id, `drop_${mode}_${Date.now()}`);
        await check(`real ${mode} drop creates one persistent Molecule without floating members`, () => (
            validate({ page, project, fixture, report, outDir })
        ));
    }
};
