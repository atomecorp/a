// Native import picker contract.
//
// A picture import must reach Apple Photos, which the Files provider cannot
// browse; an import that declares no type at all asks the host for both
// sources; every other import keeps the document vocabulary untouched.
// This probe drives the real runtime against the host bridge and reads what
// the web layer asks the native side for.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window } = installMockBrowserEnv();

window.__HOST_ENV = 'app';
const calls = [];
let answer = { success: true, data: { files: [{ name: 'IMG_0001.jpg', base64: 'AAAA' }] } };
window.AtomeFileSystem = {
    loadFilesWithDocumentPicker: (fileTypes, callback, multiple) => {
        calls.push({ fileTypes, multiple });
        callback(answer);
    }
};

const { requestProjectImportFiles } = await import('../../eVe/intuition/runtime/project_media_import_runtime.js');

calls.length = 0;
const picture = await requestProjectImportFiles({ accept: 'image/*', multiple: false });
assert.deepEqual(calls, [{ fileTypes: ['photos'], multiple: false }],
    'a picture import asks the host for the photo library, one picture at a time');
assert.equal(picture.ok, true);
assert.equal(picture.files.length, 1);
assert.equal(picture.files[0].name, 'IMG_0001.jpg', 'the picked picture keeps its name');
assert.equal(picture.files[0].type, 'image/jpeg', 'and its type, so the image readers accept it');

calls.length = 0;
await requestProjectImportFiles();
assert.deepEqual(calls, [{ fileTypes: ['*'], multiple: true }],
    'an undeclared media import asks the host for a source, because it may be a picture');

calls.length = 0;
await requestProjectImportFiles({ accept: '*' });
assert.deepEqual(calls, [{ fileTypes: ['*'], multiple: true }],
    'an explicit any-type request is the same undeclared request');

calls.length = 0;
await requestProjectImportFiles({ accept: 'image/*,application/pdf' });
assert.deepEqual(calls, [{ fileTypes: [], multiple: true }],
    'a mixed request is not a photo-library request');

calls.length = 0;
answer = { success: false, error: 'User cancelled' };
const cancelled = await requestProjectImportFiles({ accept: 'image/*', multiple: false });
assert.deepEqual(calls, [{ fileTypes: ['photos'], multiple: false }]);
assert.deepEqual(cancelled, { ok: false, error: 'cancelled', files: [] },
    'closing the photo picker stays a cancellation, not a failure');

console.log('project_media_import_native_picker_contract.test: PASS');
