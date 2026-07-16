import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ORDER_PATH = 'todo/execution_order.md';
const ALLOWED_PHASE_STATUSES = new Set([
    'Actif',
    'Bloque',
    'Obsolete',
    'Partiel',
    'Specification',
    'Termine verifie'
]);
const ADMINISTRATIVE_CHECKBOX_RE = /^(?:completed|non commencee?s?|partiellement commencee|terminee?)\.?$/i;
const TODO_REFERENCE_RE = /\b(?:todo|done|maps)\/[A-Za-z0-9_.\/-]+(?:\.md|\/)/g;

const normalizePath = (value = '') => String(value).replace(/\\/g, '/').replace(/[),.;:]+$/g, '');
const normalizeTask = (value = '') => String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const walkMarkdownFiles = (directory) => {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkMarkdownFiles(target);
        return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
    });
};

const parseCheckboxes = (text) => text.split('\n').flatMap((line, index) => {
    const match = line.match(/^- \[([ xX])\] (.+)$/);
    if (!match) return [];
    return [{
        line: index + 1,
        checked: match[1].toLowerCase() === 'x',
        text: match[2].trim()
    }];
});

const parsePhaseBlocks = (text) => {
    const lines = text.split('\n');
    const blocks = [];
    let current = null;
    lines.forEach((line, index) => {
        if (/^### Phase\b/.test(line)) {
            if (current) blocks.push(current);
            current = { title: line.slice(4).trim(), line: index + 1, lines: [] };
        }
        if (current) current.lines.push(line);
    });
    if (current) blocks.push(current);
    return blocks.map((block) => {
        const statusIndex = block.lines.findIndex((line) => /^(?:Statut|Status):\s*$/.test(line));
        const status = statusIndex < 0
            ? ''
            : block.lines.slice(statusIndex + 1).find((line) => line.trim())?.trim() || '';
        return { ...block, status, tasks: parseCheckboxes(block.lines.join('\n')) };
    });
};

const isCoveredTodo = (file, references) => references.some((reference) => (
    reference.endsWith('/') ? file.startsWith(reference) : file === reference
));

export const inspectExecutionOrder = ({
    rootDir = process.cwd(),
    orderPath = DEFAULT_ORDER_PATH
} = {}) => {
    const absoluteOrderPath = path.resolve(rootDir, orderPath);
    const text = fs.readFileSync(absoluteOrderPath, 'utf8');
    const checkboxes = parseCheckboxes(text);
    const references = Array.from(new Set((text.match(TODO_REFERENCE_RE) || []).map(normalizePath)));
    const errors = [];

    const taskLocations = new Map();
    checkboxes.forEach((task) => {
        if (ADMINISTRATIVE_CHECKBOX_RE.test(task.text)) {
            errors.push(`line ${task.line}: administrative status must not be a checkbox: ${task.text}`);
        }
        const normalized = normalizeTask(task.text);
        const previous = taskLocations.get(normalized);
        if (previous) errors.push(`lines ${previous} and ${task.line}: duplicate task: ${task.text}`);
        else taskLocations.set(normalized, task.line);
    });

    references.forEach((reference) => {
        const target = path.resolve(rootDir, reference);
        if (!fs.existsSync(target)) errors.push(`missing referenced path: ${reference}`);
    });

    const todoFiles = walkMarkdownFiles(path.resolve(rootDir, 'todo'))
        .map((file) => normalizePath(path.relative(rootDir, file)))
        .filter((file) => file !== normalizePath(orderPath));
    todoFiles.forEach((file) => {
        if (!isCoveredTodo(file, references)) errors.push(`unregistered todo document: ${file}`);
    });

    const phases = parsePhaseBlocks(text);
    phases.forEach((phase) => {
        if (!ALLOWED_PHASE_STATUSES.has(phase.status)) {
            errors.push(`line ${phase.line}: invalid or missing phase status for ${phase.title}: ${phase.status || '<missing>'}`);
            return;
        }
        const open = phase.tasks.filter((task) => !task.checked).length;
        if (phase.status === 'Termine verifie' && open > 0) {
            errors.push(`line ${phase.line}: completed phase contains ${open} open task(s): ${phase.title}`);
        }
        if ((phase.status === 'Actif' || phase.status === 'Partiel') && phase.tasks.length > 0 && open === 0) {
            errors.push(`line ${phase.line}: active phase has no open task: ${phase.title}`);
        }
    });

    const completed = checkboxes.filter((task) => task.checked).length;
    const total = checkboxes.length;
    return {
        errors,
        total,
        completed,
        pending: total - completed,
        percent: total ? Number(((completed / total) * 100).toFixed(2)) : 0,
        references,
        todoFiles,
        phases
    };
};

export const formatExecutionOrderReport = (result) => [
    'Execution order audit',
    `status: ${result.errors.length ? 'FAIL' : 'PASS'}`,
    `tasks: ${result.completed}/${result.total} (${result.percent.toFixed(2)}%)`,
    `pending: ${result.pending}`,
    `registered references: ${result.references.length}`,
    `todo documents: ${result.todoFiles.length}`,
    `violations: ${result.errors.length}`,
    ...result.errors.map((error) => `- ${error}`)
].join('\n');

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
    const result = inspectExecutionOrder();
    console.log(formatExecutionOrderReport(result));
    if (result.errors.length) process.exitCode = 1;
}
