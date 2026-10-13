import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    formatExecutionOrderReport,
    inspectExecutionOrder
} from '../../scripts/check_execution_order.mjs';

const roots = [];
const createRoot = ({ order, todos = {} }) => {
    const fixtureParent = path.resolve('temp');
    fs.mkdirSync(fixtureParent, { recursive: true });
    const root = fs.mkdtempSync(path.join(fixtureParent, 'execution-order-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'todo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'todo/execution_order.md'), order);
    Object.entries(todos).forEach(([relativePath, content]) => {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    });
    return root;
};

afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('execution order governance', () => {
    it('counts executable tasks and accepts registered todo directories', () => {
        const root = createRoot({
            order: [
                '# Order',
                'todo/feature/',
                '### Phase 1 - Feature',
                'Statut:',
                'Partiel',
                '- [x] Implement the stable contract.',
                '- [ ] Validate the remaining runtime path.'
            ].join('\n'),
            todos: { 'todo/feature/spec.md': '# Specification' }
        });
        const result = inspectExecutionOrder({ rootDir: root });
        expect(result.errors).toEqual([]);
        expect(result).toMatchObject({ total: 2, completed: 1, pending: 1, percent: 50 });
        expect(formatExecutionOrderReport(result)).toContain('status: PASS');
    });

    it('registers canonical todo paths whose directory names contain spaces', () => {
        const root = createRoot({
            order: [
                '# Order',
                'todo/New work/spec.md',
                '### Phase 1 - Feature',
                'Statut:',
                'Specification',
                '- [ ] Implement the specification.'
            ].join('\n'),
            todos: { 'todo/New work/spec.md': '# Specification' }
        });
        const result = inspectExecutionOrder({ rootDir: root });
        expect(result.errors).toEqual([]);
        expect(result.references).toContain('todo/New work/spec.md');
    });

    it('rejects drift in paths, statuses, duplicates, and unregistered todos', () => {
        const root = createRoot({
            order: [
                '# Order',
                'todo/missing.md',
                '### Phase 1 - Invalid',
                'Statut:',
                'Termine verifie',
                '- [ ] Non commencee',
                '- [ ] Duplicate task',
                '- [ ] Duplicate task'
            ].join('\n'),
            todos: { 'todo/orphan.md': '# Orphan' }
        });
        const result = inspectExecutionOrder({ rootDir: root });
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('administrative status'),
            expect.stringContaining('duplicate task'),
            expect.stringContaining('missing referenced path'),
            expect.stringContaining('unregistered todo document'),
            expect.stringContaining('completed phase contains')
        ]));
    });

    it('recognizes exact quoted filenames with punctuation, Unicode and a space before the extension', () => {
        const filenames = [
            'todo/!!!!urgent.md',
            'todo/00_UI_spécifications.md',
            'todo/development .md',
            'todo/To sort/spec(1).md'
        ];
        const root = createRoot({
            order: filenames.map((filename) => `- \`${filename}\``).join('\n'),
            todos: Object.fromEntries(filenames.map((filename) => [filename, '# Specification']))
        });
        const result = inspectExecutionOrder({ rootDir: root });
        expect(result.errors).toEqual([]);
        expect(result.references).toEqual(filenames);
    });

    it('still reports missing quoted paths instead of accepting registration without a file', () => {
        const root = createRoot({ order: '`todo/!spécification absente.md`' });
        expect(inspectExecutionOrder({ rootDir: root }).errors).toContain(
            'missing referenced path: todo/!spécification absente.md'
        );
    });
});
