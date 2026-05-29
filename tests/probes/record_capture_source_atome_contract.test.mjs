import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

const readModule = (path) => fs.readFileSync(path, 'utf8');

test('Recording persistence creates source Atomes on the current project', () => {
    const captureRuntime = readModule('eVe/domains/mtrax/media/record_capture_runtime.js');
    const addClipRuntime = readModule('eVe/domains/mtrax/clips/add_clip_runtime.js');

    assert.match(
        captureRuntime,
        /const resolveCurrentProjectId = \(\) => \{/,
        'record capture runtime must resolve the active project before persisting recorded media'
    );
    assert.doesNotMatch(
        captureRuntime,
        /createSourceAtome:\s*false/,
        'record capture persistence must not suppress source Atome creation'
    );
    assert.equal(
        (captureRuntime.match(/createSourceAtome:\s*true/g) || []).length,
        2,
        'both recorder persistence paths must request source Atome creation'
    );
    assert.equal(
        (captureRuntime.match(/projectId:\s*resolveCurrentProjectId\(\)/g) || []).length,
        2,
        'both recorder persistence paths must target the current project'
    );
    assert.match(
        addClipRuntime,
        /projectId:\s*options\.projectId\s*\|\|\s*options\.project_id\s*\|\|\s*null/,
        'clip import must forward the project id into media Atome creation'
    );
});
