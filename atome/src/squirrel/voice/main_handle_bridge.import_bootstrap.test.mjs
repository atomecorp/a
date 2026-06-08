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

let openCalls = 0;

window.open_aVa_panel = async () => {
    openCalls += 1;
    return true;
};

bootstrapMainHandleVoiceEntry({ env: window });

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

assert.equal(openCalls, 1, 'main handle bridge should open the Dilas panel installed by the eVe layer');

console.log('voice_main_handle_bridge_import_bootstrap: ok');
