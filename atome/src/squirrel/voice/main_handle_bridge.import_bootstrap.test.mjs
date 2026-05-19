import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { bootstrapMainHandleVoiceEntry } from './main_handle_bridge.js';

const dom = new JSDOM(`
<!doctype html>
<html>
<body>
  <button type="button" data-role="main-toolbox-handle">atome</button>
</body>
</html>
`, {
    url: 'https://example.test/'
});

const { window } = dom;
const handle = window.document.querySelector('[data-role="main-toolbox-handle"]');

let bootstrapCalls = 0;
let openCalls = 0;

const importModule = async (path) => {
    assert.equal(path, './dilas_panel.js', 'main handle bridge should import the Dilas panel module');
    return {
        bootstrapDilasPanel({ env }) {
            bootstrapCalls += 1;
            env.open_dilas_panel = async () => {
                openCalls += 1;
                return true;
            };
        }
    };
};

bootstrapMainHandleVoiceEntry({
    env: window,
    importModule
});

handle.dispatchEvent(new window.MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: 12,
    clientY: 16
}));

await new Promise((resolve) => setTimeout(resolve, 560));

handle.dispatchEvent(new window.MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true
}));

await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(bootstrapCalls, 1, 'main handle bridge should bootstrap the Dilas panel module when it is not initialized yet');
assert.equal(openCalls, 1, 'main handle bridge should open Dilas after bootstrapping the panel module');

console.log('voice_main_handle_bridge_import_bootstrap: ok');
