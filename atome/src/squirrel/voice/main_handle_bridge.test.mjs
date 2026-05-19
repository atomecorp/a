import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { bootstrapMainHandleVoiceEntry } from './main_handle_bridge.js';

const dom = new JSDOM(`
<!doctype html>
<html>
<body>
  <div id="menu_container_v2">
    <div class="eve-toolbox-v2-row">
      <button type="button" data-role="main-toolbox-handle">atome</button>
    </div>
  </div>
</body>
</html>
`, {
    url: 'https://example.test/'
});

const { window } = dom;
const handle = window.document.querySelector('[data-role="main-toolbox-handle"]');

let opened = 0;
let parentClicks = 0;
window.open_dilas_panel = async () => {
    opened += 1;
};
handle.parentElement.addEventListener('click', () => {
    parentClicks += 1;
});

bootstrapMainHandleVoiceEntry({ env: window });

handle.dispatchEvent(new window.MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: 30
}));

await new Promise((resolve) => setTimeout(resolve, 560));

const clickResult = handle.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true
}));

handle.dispatchEvent(new window.MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true
}));

await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(opened, 1, 'voice main-handle bridge should open Dilas on long press');
assert.equal(parentClicks, 0, 'voice main-handle bridge should suppress the synthetic click after long press');
assert.equal(clickResult, false, 'voice main-handle bridge should cancel the click event after long press');

console.log('voice_main_handle_bridge: ok');
