import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const userPanelSource = await readFile(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');
const userBackgroundActionsSource = await readFile(new URL('../../eVe/intuition/tools/user_background_actions.js', import.meta.url), 'utf8');
const backgroundSource = await readFile(new URL('../../eVe/intuition/tools/background.js', import.meta.url), 'utf8');

test('user background download quick action handles failed download results', () => {
    assert.ok(
        userPanelSource.includes("createUserBackgroundActions({ setUserNotice, clearUserNotice })"),
        'user panel must consume the shared background quick-action owner'
    );
    assert.ok(
        userBackgroundActionsSource.includes("const result = await window.download_random_background_image()"),
        'download quick action must inspect the wallpaper download result'
    );
    assert.ok(
        userBackgroundActionsSource.includes("result?.ok !== true") && userBackgroundActionsSource.includes("setUserNotice?.('eve.user.error'"),
        'download quick action must surface failure through the existing user notice'
    );
});

test('background selection and import actions return structured status', () => {
    assert.ok(
        backgroundSource.includes("return { ok: false, reason: 'selected_image_missing' }"),
        'selection background action must return a missing-selection failure'
    );
    assert.ok(
        backgroundSource.includes("return { ok: false, reason: 'upload_api_unavailable' }"),
        'background image import must return upload API failures'
    );
});
