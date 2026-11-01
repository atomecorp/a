// Registry projection of the domain owners: atome types, health bricks and objectives, programmes, activities
// (training exercises, wellbeing, programme bricks, thalasso cares, sleep routine) and health monitors.
// Native ids in a namespace (`wellbeing.meditation`, `program_brick.meditation`) keep apart the names the
// owners reuse with different meanings (architecture §8).
import { ROOT, entryId } from './registry_paths.mjs';

const at = (file) => import(`${ROOT}/${file}`);
const TYPES_FILE = 'atome/src/shared/core_atome_types.js';
const BRICKS_FILE = 'eVe/domains/programs/program_brick_catalog.js';
const LIBRARY_FILE = 'eVe/domains/programs/objective_brick_library.js';
const PROGRAMS_FILE = 'eVe/domains/programs/project_program_model.js';
const OBJECTIVES_FILE = 'eVe/domains/dashboard/dashboard_creation_catalog.js';
const TRAINING_FILE = 'atome/src/shared/training_catalog.js';
const WELLBEING_FILE = 'eVe/domains/dashboard/dashboard_wellbeing.js';
const THALASSO_FILE = 'atome/src/shared/thalasso_stay_contract.js';
const SLEEP_FILE = 'eVe/domains/programs/sleep_routine_model.js';
const AIMS_FILE = 'eVe/domains/programs/objective_followup_model.js';
const MONITORS_FILE = 'atome/src/squirrel/health/health_catalog.js';
const CATEGORIES_FILE = 'atome/src/shared/activity_categories.js';

const projected = (kind, nativeId, owner, fields) => ({ id: entryId(kind, nativeId), kind, native_id: nativeId, origin: 'projected', owner, ...fields });

export async function projectTypes() {
    const { listCoreAtomeTypeDefinitions } = await at(TYPES_FILE);
    const entries = listCoreAtomeTypeDefinitions().map(definition => projected('atome_type', definition.type, TYPES_FILE, {
        atome_kind: definition.kind || null, registered: true, traits: [...(definition.traits || [])].sort(),
        allow_unknown_properties: definition.allow_unknown_properties === true }));
    return { owner: TYPES_FILE, entries, relations: [], findings: [] };
}

// Brick sensitivity is the catalogue's R0–R2 (HEALTH_BRICK_RISKS); S0–S5 is the alert scale only (user decision,
// 30 Oct. 2026).
/** `contractIds`: the commands' contracts; a brick's command that has none is a tool (ui.panel.open). */
export async function projectHealth(contractIds) {
    const { HEALTH_BRICKS, HEALTH_OBJECTIVE_BRICKS, HEALTH_BRICK_RISKS } = await at(BRICKS_FILE);
    const { DASHBOARD_OBJECTIVES, DASHBOARD_PROJECT_GOALS } = await at(OBJECTIVES_FILE);
    const { ATOME_OBJECTIVE_IDS } = await at(TYPES_FILE);
    const { PROGRAM_DEFINITIONS } = await at(PROGRAMS_FILE);
    // How each brick is lived (P015): its execution path's owner says bound (the command it opens) or not executable, and why.
    const { brickExecution } = await at(LIBRARY_FILE);
    const entries = [], relations = [], findings = [];
    for (const brick of HEALTH_BRICKS) {
        const sensitivity = brick.risks.map(risk => {
            if (!HEALTH_BRICK_RISKS.includes(risk)) throw new Error(`registry_brick_sensitivity_unknown:${brick.id}:${risk}`);
            return risk;
        });
        const path = brickExecution(brick.id), bound = path.binding_status === 'executable';
        entries.push(projected('health_brick', brick.id, BRICKS_FILE, { key: brick.key, family: brick.family, status: brick.status,
            sensitivity, version: brick.version, activity: brick.activity || null,
            binding_status: bound ? 'bound' : 'not_executable', binding_reason: bound ? null : path.reason }));
        const contract = entryId('action_contract', path.command || '');
        if (bound) relations.push({ from: entryId('health_brick', brick.id), type: 'executes',
            to: contractIds.has(contract) ? contract : entryId('tool_definition', path.command), owner: LIBRARY_FILE });
        brick.aliases.forEach(alias => relations.push({ from: entryId('doc_brick', alias), type: 'aliases', to: entryId('health_brick', brick.id), status: 'code_declared' }));
        if (brick.activity) relations.push({ from: entryId('health_brick', brick.id), type: 'executes', to: entryId('activity_definition', `program_brick.${brick.activity}`) });
        brick.measures.forEach(monitor => relations.push({ from: entryId('health_brick', brick.id), type: 'observes', to: entryId('data_provider', `health_monitor.${monitor}`) }));
    }
    const byGoal = new Map(DASHBOARD_OBJECTIVES.map(objective => [objective.goal, objective]));
    for (const objectiveId of ATOME_OBJECTIVE_IDS) {
        const objective = DASHBOARD_OBJECTIVES.find(item => item.objective_id === objectiveId);
        if (!objective) { findings.push({ type: 'objective_without_dashboard_offer', id: objectiveId }); continue; }
        entries.push(projected('objective_scenario', objectiveId, OBJECTIVES_FILE, { goal: objective.goal, label_key: objective.label_key,
            label: objective.fallback || null, scenario: 'objective' }));
        const composition = HEALTH_OBJECTIVE_BRICKS[objective.goal];
        for (const role of ['start', 'optional']) for (const brickId of composition?.[role] || []) {
            relations.push({ from: entryId('objective_scenario', objectiveId), type: 'uses_brick', to: entryId('health_brick', brickId), role });
        }
    }
    for (const goal of DASHBOARD_PROJECT_GOALS.health.filter(goal => !byGoal.has(goal))) {
        entries.push(projected('objective_scenario', `goal.health.${goal}`, OBJECTIVES_FILE, { goal, label_key: null, label: null, scenario: 'project_goal' }));
    }
    for (const definition of Object.values(PROGRAM_DEFINITIONS)) {
        const id = entryId('objective_scenario', `program.${definition.key}`);
        entries.push(projected('objective_scenario', `program.${definition.key}`, PROGRAMS_FILE, { goal: definition.key, label_key: null,
            label: definition.name || null, scenario: 'programme', family: definition.family, synonyms: [...definition.aliases] }));
        // A creation programme (music_title) composes tools, not bricks.
        (definition.bricks || []).forEach(brick => relations.push({ from: id, type: 'uses_brick', to: entryId('activity_definition', `program_brick.${brick}`) }));
    }
    return { owner: `${BRICKS_FILE} + ${OBJECTIVES_FILE} + ${PROGRAMS_FILE}`, entries, relations, findings };
}

export async function projectActivities() {
    const { TRAINING_EXERCISES } = await at(TRAINING_FILE);
    const { PROGRAM_BRICKS } = await at(PROGRAMS_FILE);
    const { WELLBEING_BRICKS } = await at(WELLBEING_FILE);
    const { THALASSO_CARES } = await at(THALASSO_FILE);
    const { SLEEP_ROUTINE_KEYS, SLEEP_ROUTINE_TIPS } = await at(SLEEP_FILE);
    const { OBJECTIVE_AIMS } = await at(AIMS_FILE);
    const entries = [], relations = [];
    TRAINING_EXERCISES.forEach(exercise => entries.push(projected('activity_definition', `training.${exercise.id}`, TRAINING_FILE, {
        domain: 'training', training_kind: exercise.kind, group: exercise.group, equipment: exercise.equipment || null,
        execution_ref: { contract: 'training.open_exercise', input: { exercise_id: exercise.id } } })));
    Object.values(PROGRAM_BRICKS).forEach(brick => entries.push(projected('activity_definition', `program_brick.${brick.id}`, PROGRAMS_FILE, {
        domain: 'program_brick', label_key: brick.label_key || null, icon: brick.icon || null,
        execution_ref: null })));
    WELLBEING_BRICKS.forEach(key => {
        entries.push(projected('activity_definition', `wellbeing.${key}`, WELLBEING_FILE, { domain: 'wellbeing',
            label_key: PROGRAM_BRICKS[key]?.label_key || null, execution_ref: { contract: 'brick_session.open', input: { brick_id: key } } }));
        if (PROGRAM_BRICKS[key]) relations.push({ from: entryId('activity_definition', `wellbeing.${key}`), type: 'refers_to', to: entryId('activity_definition', `program_brick.${key}`) });
    });
    THALASSO_CARES.forEach(care => entries.push(projected('activity_definition', `thalasso.${care.id}`, THALASSO_FILE, { domain: 'thalasso',
        label_key: care.label_key || null, execution_ref: null })));
    SLEEP_ROUTINE_KEYS.forEach(key => entries.push(projected('activity_definition', `sleep_routine.${key}`, SLEEP_FILE, { domain: 'sleep_routine', execution_ref: null })));
    SLEEP_ROUTINE_TIPS.forEach(key => entries.push(projected('taxonomy_node', `sleep_tip.${key}`, SLEEP_FILE, { role: 'leaf', label_key: null, label: null })));
    Object.keys(OBJECTIVE_AIMS).forEach(goal => entries.push(projected('taxonomy_node', `objective_aim.${goal}`, AIMS_FILE, {
        role: 'level', label_key: null, label: null, values: [...OBJECTIVE_AIMS[goal]] })));
    return { owner: [TRAINING_FILE, PROGRAMS_FILE, WELLBEING_FILE, THALASSO_FILE, SLEEP_FILE, AIMS_FILE].join(' + '), entries, relations, findings: [] };
}

export async function projectMonitorsAndCategories() {
    const { HEALTH_MONITORS } = await at(MONITORS_FILE);
    const { ACTIVITY_CATEGORIES } = await at(CATEGORIES_FILE);
    const entries = [
        ...HEALTH_MONITORS.map(monitor => projected('data_provider', `health_monitor.${monitor.id}`, MONITORS_FILE, {
            provider: 'health_owner reading', data_source: monitor.meaning || null, label_key: monitor.labelKey || null,
            family: monitor.family, unit: monitor.unit || null })),
        ...ACTIVITY_CATEGORIES.map(category => projected('taxonomy_node', `activity_category.${category.slug}`, CATEGORIES_FILE, {
            role: 'category', label_key: null, label: null, synonyms: [...(category.words || [])] }))
    ];
    return { owner: `${MONITORS_FILE} + ${CATEGORIES_FILE}`, entries, relations: [], findings: [] };
}
