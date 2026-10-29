import { validateParams } from '../ai/agent_gateway_normalize.js';

// Code projects (user, 29 Oct. 2026): a project of the Projets rubric whose panel holds the discussion with eVe,
// its objective and its plan's steps — a way to structure a task, never a code runner. Plan mode: eVe writes the
// objective and the steps, then asks what she needs to validate them with the person; out of it, she carries the
// steps out with the existing commands and checks each one. On the developer's Mac only (a debug build from the
// source checkout), she also reads the repository and files each plan in todo/code_projects/. Run by
// eVe/domains/code_projects/code_project_runtime.js.
export const CODE_PROJECT_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'NO_PROJECT', 'CREATE_FAILED', 'OPEN_FAILED',
    'WRITE_FAILED', 'STEP_NOT_FOUND', 'REPO_UNAVAILABLE', 'REPO_REFUSED', 'PRESENTATION_UNAVAILABLE']);
export const CODE_PROJECT_MAX_STEPS = 24;

const id = { type: 'string', minLength: 1, maxLength: 200 };
const line = { type: 'string', minLength: 1, maxLength: 300, pattern: '\\S' };
const path = { type: 'string', maxLength: 400 };
const definitions = {
    create: [{ name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' } }, ['name'],
        'Create a code project named `name` (a project of the Projets rubric for a task to structure) and open its panel.', true],
    open: [{ code_project_id: id }, ['code_project_id'], 'Open a code project\'s panel: its discussion, its objective and its steps (code_project_id: its project_id from projects.list with type code).', false],
    state: [{ code_project_id: id }, [], 'Read a code project: its name, objective, steps (done or not), whether plan mode is on, whether the repository can be read here, the todo file of its plan. No code_project_id: the code project whose panel is open (the same for every code_project command).', false],
    plan: [{ code_project_id: id, objective: line, steps: { type: 'array', minItems: 1, maxItems: CODE_PROJECT_MAX_STEPS, items: line } }, ['objective', 'steps'],
        'Write the objective and the steps of a code project\'s plan (a step kept with the same text keeps its check). Where the repository can be read, the plan is also filed in todo/code_projects/.', true],
    check: [{ code_project_id: id, step: { type: 'integer', minimum: 1, maximum: CODE_PROJECT_MAX_STEPS }, done: { type: 'boolean' } }, ['step', 'done'],
        'Check (done true) or uncheck one step of a code project\'s plan, `step` counted from 1.', true],
    mode: [{ code_project_id: id, plan: { type: 'boolean' } }, ['plan'], 'Turn a code project\'s plan mode on (plan true) or off, as its Plan tool does.', true],
    repo_list: [{ path }, [], 'List a folder of the repository (path relative to its root, empty for the root). Only on the developer\'s Mac.', false],
    repo_read: [{ path: { ...path, minLength: 1 }, from_line: { type: 'integer', minimum: 1 }, lines: { type: 'integer', minimum: 1, maximum: 400 } }, ['path'],
        'Read lines of a repository file (path relative to its root), from `from_line` (1) for `lines` (200). Only on the developer\'s Mac.', false],
    repo_search: [{ text: { type: 'string', minLength: 2, maxLength: 200 }, path }, ['text'],
        'Search the repository\'s text files (or one folder, `path`) for `text`, at most 50 lines found. Only on the developer\'s Mac.', false]
};
const stepSchema = { type: 'object', required: ['text', 'done'], properties: { text: { type: 'string' }, done: { type: 'boolean' } } };
export const CODE_PROJECT_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `code_project.${action}`, action, description, persistent, capability: persistent ? 'code_project.write' : 'code_project.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: CODE_PROJECT_ERRORS },
        project_id: { type: 'string' }, name: { type: 'string' }, objective: { type: 'string' }, steps: { type: 'array', items: stepSchema },
        plan_mode: { type: 'boolean' }, repository: { type: 'boolean' }, todo_path: { type: 'string' },
        entries: { type: 'array', items: { type: 'object' } }, file: { type: 'object' }, hits: { type: 'array', items: { type: 'object' } } } }
})));
export const validateCodeProjectInput = (action, input) => {
    const contract = CODE_PROJECT_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const CODE_PROJECT_ASSISTANT_INSTRUCTIONS = 'Code projects: « crée un projet de code <nom> » calls code_project.create; '
    + '« ouvre le projet <nom> » for a code project calls code_project.open (code_project_id: its project_id from projects.list). While a code project\'s panel is open, '
    + 'its notes say whether plan mode is on: follow them.';
