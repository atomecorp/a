import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SERVER_SOURCE = path.resolve('platforms/desktop-tauri/src/server/mod.rs');

const readSource = () => fs.readFileSync(SERVER_SOURCE, 'utf8');

const assertResponseCarriesOwnerAliases = (source, anchor) => {
    const start = source.indexOf(anchor);
    assert.notEqual(start, -1, `${anchor} response block must exist`);
    const nextHandler = source.indexOf('\nasync fn ', start + anchor.length);
    const block = source.slice(start, nextHandler === -1 ? source.length : nextHandler);
    assert.match(block, /"owner"\s*:\s*user_id/, `${anchor} must expose legacy owner`);
    assert.match(block, /"owner_id"\s*:\s*user_id/, `${anchor} must expose snake_case owner_id`);
    assert.match(block, /"ownerId"\s*:\s*user_id/, `${anchor} must expose camelCase ownerId`);
};

test('Tauri Axum media upload responses expose canonical owner aliases', () => {
    const source = readSource();
    assertResponseCarriesOwnerAliases(source, 'async fn upload_handler');
    assertResponseCarriesOwnerAliases(source, 'async fn local_file_write_handler');
    assertResponseCarriesOwnerAliases(source, 'async fn user_recordings_upload_handler');
});

test('Tauri Axum exposes auth me route for reload hydration', () => {
    const source = readSource();
    assert.match(source, /async fn auth_me_handler\(/, 'auth_me_handler must exist');
    assert.match(source, /"action"\s*:\s*"me"/, 'auth_me_handler must support token identity lookup');
    assert.match(
        source,
        /\.route\("\/api\/auth\/me",\s*get\(auth_me_handler\)\)/,
        '/api/auth/me must be routed on the local Axum server',
    );
});
