import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkEveAiGuardrails } from './check_eve_ai_guardrails.mjs';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-ai-guardrails-'));

fs.mkdirSync(path.join(fixtureRoot, 'src/squirrel/voice'), { recursive: true });
fs.mkdirSync(path.join(fixtureRoot, 'src/squirrel/ai'), { recursive: true });

fs.writeFileSync(
    path.join(fixtureRoot, 'src/squirrel/voice/orchestrator.js'),
    'export const ok = () => callRuntimeTool({ tool_id: "ui.circle" });\n',
    'utf8'
);
fs.writeFileSync(
    path.join(fixtureRoot, 'src/squirrel/voice/ai_planner.js'),
    'const rule = /mail.*read_contact/i;\n',
    'utf8'
);
fs.writeFileSync(
    path.join(fixtureRoot, 'src/squirrel/ai/runtime_bridge.js'),
    'function mutate(instance) { instance.left = 20; }\n',
    'utf8'
);

const result = checkEveAiGuardrails({
    rootDir: fixtureRoot,
    canonicalPaths: [
        'src/squirrel/voice/orchestrator.js',
        'src/squirrel/voice/ai_planner.js',
        'src/squirrel/ai'
    ]
});

assert.equal(result.ok, false, 'guardrail checker should reject forbidden patterns');
assert.equal(result.violations.some((entry) => entry.code === 'regex_business_understanding'), true, 'guardrail checker should reject regex-based business understanding');
assert.equal(result.violations.some((entry) => entry.code === 'direct_runtime_property_mutation'), true, 'guardrail checker should reject direct runtime property mutation');

console.log('check_eve_ai_guardrails.test: PASS');
