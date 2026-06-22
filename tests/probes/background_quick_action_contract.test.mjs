import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const userPanelSource = await readFile(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');
const userBackgroundActionsSource = await readFile(new URL('../../eVe/intuition/tools/user_background_actions.js', import.meta.url), 'utf8');
const backgroundSource = await readFile(new URL('../../eVe/intuition/tools/background.js', import.meta.url), 'utf8');
const userSurfaceBackgroundSource = await readFile(new URL('../../eVe/user/background.js', import.meta.url), 'utf8');
const randomBackgroundSource = await readFile(new URL('../../eVe/intuition/tools/background_random_runtime.js', import.meta.url), 'utf8');

test('user background download quick action uses the wallpaper download owner', () => {
    assert.ok(
        userPanelSource.includes("createUserBackgroundActions({ setUserNotice, clearUserNotice })"),
        'user panel must consume the shared background quick-action owner'
    );
    assert.ok(
        userBackgroundActionsSource.includes("const result = await window.download_random_background_image()"),
        'download quick action must use the background download API'
    );
    assert.ok(
        userBackgroundActionsSource.includes("background_download_failed"),
        'download quick action must surface download failures through the existing user notice'
    );
    assert.ok(
        backgroundSource.includes('picsum.photos') && backgroundSource.includes('download_random_background_image'),
        'background runtime must expose the explicit wallpaper download action'
    );
    assert.ok(
        backgroundSource.includes('publishBackgroundPreferences') && backgroundSource.includes("source: 'background_panel'"),
        'background panel changes must publish through the existing profile preferences event'
    );
    assert.ok(
        userSurfaceBackgroundSource.includes('bindProfilePreferencesListener')
            && userSurfaceBackgroundSource.includes("window.addEventListener('eve:profile-preferences-updated'")
            && userSurfaceBackgroundSource.includes('applyPreferencesObject(prefs, { emitEvent: false })'),
        'user surface background runtime must consume profile preference updates from the existing event'
    );
    assert.ok(
        randomBackgroundSource.includes('buildGeneratedRandomBackgroundParams'),
        'generated random background params must have a focused owner'
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
