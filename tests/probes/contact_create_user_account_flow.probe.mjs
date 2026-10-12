// Verify the compact Contact footer hands account creation to its canonical owner.
// The shared phone flow has separate first-launch runtime and payment tests.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
const { window } = installMockBrowserEnv();
window.__authCheckComplete = true;
window.__authCheckResult = { complete: true, authenticated: true, userId: 'current_user' };
window.AdoleAPI.directory = { list: async () => ({ entries: [] }) };
window.Squirrel = { contacts: {
    list: () => ({ items: [] }), ensureReady: async () => ({ ok: true, items: [] }),
    sources: () => ({ items: [] }), deleteLocalContact: async () => ({ ok: true })
} };
const { contactSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js');
const userModule = await import('../../eVe/intuition/tools/user.js');
assert.equal(window.open_create_user_panel, userModule.open_create_user_panel,
    'the canonical account owner registers its exported entry point');
const requests = [], intents = [];
window.open_create_user_panel = async payload => { requests.push(payload); return { ok: true }; };
const footer = contactSurface.buildFooterContent(contactSurface.readState(), {
    emit: intent => intents.push(intent), bodyWidth: 388
});
assert.equal(footer.length, 3);
const create = footer.find(node => node.id === 'contact_create_user');
assert.ok(create?.accessibility?.label, 'account creation has an accessible label');
create.on.activate();
assert.deepEqual(intents, [{ type: 'contact.create_user' }]);
const release = contactSurface.onOpen({ context: {}, refresh: () => {} });
try {
    await contactSurface.handleEvent({ type: 'contact.refresh' });
    const result = await contactSurface.handleEvent(intents[0]);
    assert.equal(result?.ok, true);
    assert.deepEqual(requests, [{ source: { type: 'contact.create_user' } }],
        'the footer delegates once to the shared account flow with its source');
} finally { release?.(); await contactSurface.onClose?.(); }
console.log('contact_create_user_account_flow.probe: PASS (canonical handoff)');

window.close();
// The account module owns long-lived application subscriptions; this isolated probe is complete.
process.exit(0);
