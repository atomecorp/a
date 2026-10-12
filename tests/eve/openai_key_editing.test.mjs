import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const calls = vi.hoisted(() => ({ store: vi.fn(), save: vi.fn(), credential: vi.fn(), mail: vi.fn() }));
const panels = vi.hoisted(() => ({ reveal: vi.fn(() => false), sourceTrees: new Map() }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', async original => ({
    ...await original(), getPanelRuntime: () => ({ revealTreeNode: panels.reveal, state: { sourceTrees: panels.sourceTrees } })
}));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js', async original => ({
    ...await original(),
    loadHomeProfile: async () => ({ ok: true, userId: 'fixture-owner', profile: { name: 'Fixture' } }),
    persistHomeProfile: (...args) => calls.save(...args)
}));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault.js', () => ({
    storeHomeAiToken: (...args) => calls.store(...args), lockHomeVault() {},
    storeHomeCredential: (...args) => calls.credential(...args), storeHomeMailSecret: (...args) => calls.mail(...args),
    mailVaultEntryId: ({ userId }) => `mail.auth.${userId}`,
    readHomeVaultState: async () => ({ unlocked: true, credentials: [], mailConfigured: false,
        providers: [{ id: 'openai', kind: 'chat', configured: true, models: ['fixture-model'] }] })
}));
vi.mock('../../atome/src/squirrel/voice/bootstrap.js', () => ({
    bootstrapGlobalVoice: () => ({ wake: { subscribe: () => () => {} } })
}));
import { homeSurface, handleHomeCardEvent, readHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js';

const fixture = async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    calls.store.mockReset().mockResolvedValue({ ok: true, configured: true });
    calls.credential.mockReset().mockImplementation(async ({ credential }) => ({ ok: true, credential: { ...credential, configured: true } }));
    calls.mail.mockReset().mockResolvedValue({ ok: true });
    calls.save.mockReset().mockImplementation(async ({ profile }) => ({ ok: true, profile }));
    const release = homeSurface.onOpen({ context: { guest: false }, refresh() {} });
    await vi.waitFor(() => expect(readHomePanelState().loading).toBe(false));
    await handleHomeCardEvent({ type: 'home.accordion.toggle', section: 'settings' });
    await handleHomeCardEvent({ type: 'home.subaccordion.toggle', section: 'settings.passkeys' });
    await handleHomeCardEvent({ type: 'home.field.focus', field: 'security.aiKeys.openai', event: {} }, { refresh() {} });
    const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
    expect(editor).not.toBeNull();
    return { dom, editor, close() { release(); dom.window.close(); Object.assign(globalThis, previous); } };
};
for (const action of ['native blur', 'Enter', 'Bevy blur']) test(action + ' stores the OpenAI draft through the existing vault owner exactly once', async () => {
    const f = await fixture();
    try {
        f.editor.value = 'fixture-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        if (action === 'native blur') f.editor.blur();
        if (action === 'Enter') f.editor.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (action === 'Bevy blur') await handleHomeCardEvent({ type: 'home.field.blur', field: 'security.aiKeys.openai' });
        await vi.waitFor(() => expect(calls.store).toHaveBeenCalledOnce());
        expect(calls.store).toHaveBeenCalledWith({ userId: 'fixture-owner', providerId: 'openai', apiKey: 'fixture-key' });
        await vi.waitFor(() => expect(calls.save).toHaveBeenCalledOnce());
        expect(JSON.stringify(calls.save.mock.calls)).not.toContain('fixture-key');
        await handleHomeCardEvent({ type: 'home.field.blur', field: 'security.aiKeys.openai' });
        expect(calls.store).toHaveBeenCalledOnce();
    } finally { f.close(); }
});
test('focusing and leaving an empty replacement never overwrites a configured key', async () => {
    const f = await fixture();
    try { f.editor.blur(); await Promise.resolve(); expect(calls.store).not.toHaveBeenCalled(); }
    finally { f.close(); }
});

for (const outcome of ['focused', 'cancelled', 'unavailable']) test('requested OpenAI focus after projection: ' + outcome, async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    let paint, ready;
    const painted = new Promise(resolve => { paint = resolve; });
    calls.store.mockClear(); calls.save.mockClear(); panels.reveal.mockClear();
    panels.sourceTrees.clear();
    const refresh = () => {
        if (readHomePanelState().loading) return;
        const children = homeSurface.buildContent(readHomePanelState(), { emit() {}, bodyWidth: 400 });
        panels.sourceTrees.set('eve_bevy_panel_home', { tree: { root: { id: 'home', children: outcome === 'unavailable' ? [] : children } } });
        return painted;
    };
    const release = homeSurface.onOpen({ context: { section: 'settings', subsections: ['settings.passkeys', 'passkeys.keys'],
        revealNodeId: 'home_key_openai_api', focusField: 'security.aiKeys.openai', onHomeNavigationReady: task => { ready = task; } }, refresh });
    try {
        await vi.waitFor(() => expect(readHomePanelState().loading).toBe(false));
        expect(dom.window.document.querySelector('#eve_hidden_text_service textarea')).toBeNull();
        if (outcome === 'cancelled') release();
        paint(); const result = await ready;
        if (outcome === 'cancelled') {
            expect(result.cancelled).toBe(true); expect(panels.reveal).not.toHaveBeenCalled();
            expect(dom.window.document.querySelector('#eve_hidden_text_service textarea')).toBeNull();
        } else if (outcome === 'unavailable') {
            expect(result).toEqual({ ok: false, error: 'home_focus_target_unavailable' });
            expect(dom.window.document.querySelector('#eve_hidden_text_service textarea')).toBeNull();
        } else {
            expect(result.ok).toBe(true);
            expect(panels.reveal).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'home_key_openai_api' }));
            const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
            expect(dom.window.document.activeElement).toBe(editor); expect(editor.value).toBe('');
        }
        expect(calls.store).not.toHaveBeenCalled(); expect(calls.save).not.toHaveBeenCalled();
    } finally { release(); panels.sourceTrees.clear(); dom.window.close(); Object.assign(globalThis, previous); }
});

test('a key saves automatically without Enter or blur', async () => {
    const f = await fixture();
    try {
        f.editor.value = 'fixture-autosave-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(calls.store).toHaveBeenCalledOnce(), { timeout: 1200 });
        expect(calls.store.mock.calls[0][0].apiKey).toBe('fixture-autosave-key');
        expect(f.dom.window.document.activeElement).toBe(f.editor);
    } finally { f.close(); }
});

test('close flushes the current key before cleanup without keyboard validation', async () => {
    const f = await fixture();
    try {
        f.editor.value = 'fixture-close-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        expect(typeof homeSurface.beforeClose).toBe('function');
        expect(await homeSurface.beforeClose({ context: { source: { type: 'panel.close' } } })).toMatchObject({ ok: true });
        expect(calls.store).toHaveBeenCalledOnce();
        expect(calls.store.mock.calls[0][0].apiKey).toBe('fixture-close-key');
    } finally { f.close(); }
});

test('a refused key save preserves the replacement draft for a retry', async () => {
    const f = await fixture();
    try {
        calls.store.mockResolvedValue({ ok: false, error: 'invalid_api_key' });
        f.editor.value = 'fixture-refused-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        const result = await handleHomeCardEvent({ type: 'home.field.blur', field: 'security.aiKeys.openai' });
        expect(result.ok).toBe(false);
        await handleHomeCardEvent({ type: 'home.field.focus', field: 'security.aiKeys.openai', event: {} }, { refresh() {} });
        expect(f.dom.window.document.querySelector('#eve_hidden_text_service textarea').value).toBe('fixture-refused-key');
        expect(calls.save).not.toHaveBeenCalled();
    } finally { f.close(); }
});

test('a failed close keeps the editor and its draft instead of cleaning up', async () => {
    const f = await fixture();
    try {
        calls.store.mockResolvedValue({ ok: false, error: 'provider_connection_failed' });
        f.editor.value = 'fixture-pending-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        expect(typeof homeSurface.beforeClose).toBe('function');
        expect(await homeSurface.beforeClose({ context: {} })).toMatchObject({ ok: false });
        expect(f.editor.isConnected).toBe(true);
        expect(f.editor.value).toBe('fixture-pending-key');
    } finally { f.close(); }
});

test('switching to another field immediately saves the old key before its editor is replaced', async () => {
    const f=await fixture();
    try {
        f.editor.value='qa-switch-key'; f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
        await handleHomeCardEvent({type:'home.field.focus',field:'security.aiKeys.anthropic',event:{}},{refresh(){}});
        await vi.waitFor(()=>expect(calls.store).toHaveBeenCalledOnce());
        expect(calls.store.mock.calls[0][0]).toMatchObject({providerId:'openai',apiKey:'qa-switch-key'});
    } finally { f.close(); }
});

test('a metadata failure keeps the key receipt and retry does not rewrite the credential',async()=>{
    const f=await fixture();
    try {
        calls.save.mockResolvedValueOnce({ok:false,error:'qa-metadata-failed'});
        f.editor.value='qa-partial-key'; f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
        expect(await homeSurface.beforeClose({context:{}})).toMatchObject({ok:false,credentialSaved:true,metadataSaved:false});
        expect(f.editor.value).toBe('qa-partial-key');
        expect(await homeSurface.beforeClose({context:{}})).toMatchObject({ok:true});
        expect(calls.store).toHaveBeenCalledOnce(); expect(calls.save).toHaveBeenCalledTimes(2);
    } finally { f.close(); }
});

test('an older response never clears a newer draft; repeated close waits for the last version',async()=>{
    const f=await fixture(); let resolve;
    try {
        calls.store.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
        f.editor.value='qa-old-key'; f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
        const first=handleHomeCardEvent({type:'home.key.save',provider:'openai'});
        await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
        f.editor.value='qa-new-key'; f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
        const a=homeSurface.beforeClose({context:{}}),b=homeSurface.beforeClose({context:{}});
        resolve({ok:true,configured:true}); await first;
        expect(f.editor.value).toBe('qa-new-key');
        expect((await a).ok).toBe(true); expect((await b).ok).toBe(true);
        expect(calls.store.mock.calls.map(c=>c[0].apiKey)).toEqual(['qa-old-key','qa-new-key']);
        expect(JSON.stringify(readHomePanelState())).not.toContain('qa-new-key');
    } finally { f.close(); }
});

test('an absent selected model remains selected after the key is saved',async()=>{
    const f=await fixture();
    try {
        await handleHomeCardEvent({type:'home.key.model.set',provider:'openai',value:'qa-retired-model'});
        calls.save.mockClear();
        f.editor.value='qa-model-key'; f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
        expect((await homeSurface.beforeClose({context:{}})).ok).toBe(true);
        expect(readHomePanelState().profile.passkeys.keys.find(k=>k.provider==='openai').model).toBe('qa-retired-model');
    } finally { f.close(); }
});

for (const kind of ['credential', 'mail']) test(`${kind} composes the same secure editor and pre-close save without Enter`, async () => {
 const f=await fixture();
 try {
  const input=async(field,value)=>{await handleHomeCardEvent({type:'home.field.focus',field,event:{}},{refresh(){}});f.editor.value=value;f.editor.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));};
  let field;
  if(kind==='credential') {
   await handleHomeCardEvent({type:'home.credential.add'},{refresh(){}});
   const id=readHomePanelState().vault.credentials[0].id;
   await input(`credentials.${id}.name`,'QA');await input(`credentials.${id}.login`,'qa-login');field=`security.credentialPasswords.${id}`;
  }else field='security.mailPassword';
  await input(field,`qa-${kind}-secret`);
  expect((await homeSurface.beforeClose({context:{}})).ok).toBe(true);
  const store=kind==='credential'?calls.credential:calls.mail;
  expect(store).toHaveBeenCalledOnce();expect(store.mock.calls[0][0].password).toBe(`qa-${kind}-secret`);
  expect(JSON.stringify(readHomePanelState())).not.toContain(`qa-${kind}-secret`);
  expect(JSON.stringify(calls.save.mock.calls)).not.toContain(`qa-${kind}-secret`);
 }finally{f.close();}
});
