import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    formatExecutionOrderReport,
    inspectExecutionOrder
} from '../../scripts/check_execution_order.mjs';

const roots = [];
const createRoot = ({ order, todos = {} }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-order-'));
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
});
