import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../../eVe/intuition/matrix/core/project_data.js', () => ({ activateProjectWorkspace: vi.fn(async () => ({ ok: true })) }));
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { createToolRuntimeBootstrapTransportHandlers } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_transport_handlers.js';

it('delegates main clipboard actions with the canonical project selection context', async () => {
    const loadActionProxyModule = vi.fn(async () => ({}));
    const invokeActionProxy = vi.fn(async () => ({ ok: true, result: { copied: true } }));
    const runtime = createToolRuntimeBootstrapTransportHandlers({
        BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE: {}, BOOTSTRAP_TRANSPORT_RUNTIME_STATE: {},
        ensureString: (value, fallback = '') => String(value || fallback),
        executeBootstrapCaptureHandler: vi.fn(), executeBootstrapMomentaryHandler: vi.fn(),
        executeMoleculeRecordToggleHandler: vi.fn(), invokeActionProxy,
        isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        loadActionProxyModule,
        normalizeAction: (action, event) => action || event || 'pointer.click',
        readRegisteredHandlerLatchedState: vi.fn(), resolveRegisteredHandlerNextLatchedState: vi.fn(),
        writeRegisteredHandlerLatchedState: vi.fn()
    });
    const result = await runtime.executeBootstrapActionProxyHandler({
        action: 'pointer.click',
        input: { target_id: 'eve_bevy_ui_main_menu_tool_copy', dom_id: 'eve_bevy_ui_main_menu_tool_copy' },
        runtime_context: { project_id: 'project_a', selection: { ids: ['molecule_a'] } },
        presentation: 'ui', source: { type: 'ui', layer: 'bevy_ui_main_menu' }
    }, { kind: 'clipboard', operation: 'copy', proxy_tool_id: 'ui.copy.action' });

    expect(loadActionProxyModule).toHaveBeenCalledWith('ui.copy.action');
    expect(invokeActionProxy).toHaveBeenCalledWith(expect.objectContaining({
        tool_id: 'ui.copy.action', input: { project_id: 'project_a', selection_ids: ['molecule_a'] }
    }));
    expect(result).toMatchObject({ ok: true, proxied: true, proxy_tool_id: 'ui.copy.action' });
});

describe('Runtime V2 built-in tool fast path', () => {
    let toolRuntimeV2;
    let storageList;

    beforeAll(async () => {
        const { window } = installMockBrowserEnv();
        window.__authCheckComplete = false;
        window.__authCheckResult = {
            complete: false,
            authenticated: false,
            anonymous: false,
            userId: null
        };
        const registryModule = await import('../../eVe/intuition/tools/core/tool_registry.js');
        storageList = vi.spyOn(registryModule.toolRegistryV2.storage, 'list')
            .mockImplementation(() => new Promise(() => {}));
        ({ toolRuntimeV2 } = await import('../../eVe/intuition/tools/core/tool_runtime.js'));
    });


    it.each([{ type: 'project' }, { atome_type: 'project' }, { properties: { kind: 'project' } }])('opens a canonical project representation %j through the registered handler', async shape => {
        const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
        await toolRuntimeV2.resolveTool('ui.project.open');
        const handler = window.atome.tools.handlers.get('ui.project.open'), previous = window.Atome;
        const project = { id: 'canonical-project', properties: { name: 'Visible programme' }, ...shape };
        window.Atome = { getStateCurrent: vi.fn(async () => project) };
        try {
            expect(await handler({ input: { project_id: project.id } })).toMatchObject({ ok: true, project_id: project.id });
            expect(activateProjectWorkspace).toHaveBeenLastCalledWith({ ...project, name: project.properties.name });
            const count = activateProjectWorkspace.mock.calls.length;
            window.Atome.getStateCurrent.mockResolvedValue({ properties: { kind: 'text' } });
            expect(await handler({ input: { project_id: 'text' } })).toMatchObject({ ok: false, error: 'project_not_found' });
            expect(activateProjectWorkspace).toHaveBeenCalledTimes(count);
        } finally { window.Atome = previous; }
    });

    it('resolves Home from the canonical in-memory definitions while auth persistence is pending', async () => {
        const startedAt = performance.now();
        const tool = await Promise.race([
            toolRuntimeV2.resolveTool('tool.main.home'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('built_in_resolution_timeout')), 100))
        ]);

        expect(tool).toMatchObject({ id: 'tool.main.home', tool_key: 'main_home' });
        expect(performance.now() - startedAt).toBeLessThan(100);
        expect(storageList).not.toHaveBeenCalled();
    });

    it('publishes the existing built-in handler without starting registry persistence', async () => {
        const tool = await toolRuntimeV2.resolveTool('ui.dummy.hello');
        const handler = window.atome?.tools?.handlers?.get?.('ui.dummy.hello');

        expect(tool).toMatchObject({ id: 'ui.dummy.hello' });
        expect(handler).toBeTypeOf('function');
        expect(storageList).not.toHaveBeenCalled();
    });
    it('executes the first preuploaded drop without bootstrap or an upload API', async () => {
        const { createProjectDropExternalRuntime } = await import('../../eVe/intuition/tools/project_drop_external_runtime.js');
        const boot = vi.spyOn(toolRuntimeV2, 'bootstrap').mockImplementation(() => { throw new Error('bootstrap_forbidden'); });
        const previousBase = window.eveToolBase;
        const createAtome = vi.fn(async () => ({ ok: true, id: 'media_atome' }));
        window.eveToolBase = { createAtome };
        const runtime = createProjectDropExternalRuntime({
            ensureABoxApi: async () => { throw new Error('upload_api_forbidden'); },
            computeDropBase: () => ({ left: 10, top: 20 }), resolveDropType: () => 'image',
            readDroppedTextContent: async () => null, buildDropOffset: () => ({ dx: 0, dy: 0 }),
            buildExtraProperties: () => ({}), resolveCreatorResultAtomeId: result => result?.result?.atome_id
        });
        try {
            const result = await runtime.importFilesToProjectViaCreator({
                entries: [{ width: 640, height: 480, preuploaded: {
                    type: 'image', fileName: 'photo.png', mediaUrl: '/media/photo.png'
                } }], projectId: 'media_project'
            });
            expect(result).toMatchObject({ ok: true, created: 1 });
            expect(createAtome).toHaveBeenCalledTimes(1);
            expect(boot).not.toHaveBeenCalled();
            expect(storageList).not.toHaveBeenCalled();
        } finally {
            window.eveToolBase = previousBase;
            boot.mockRestore();
        }
    });
    it('discovers tools without waiting for bootstrap writes and retains stored disabling', async () => {
        const { toolRegistryV2 } = await import('../../eVe/intuition/tools/core/tool_registry.js');
        const boot = vi.spyOn(toolRuntimeV2, 'bootstrap').mockImplementation(() => new Promise(() => {}));
        const list = vi.spyOn(toolRegistryV2, 'listTools').mockResolvedValue([
            { id: 'ui.draw.edit', capabilities: { disabled: true } },
            { id: 'custom_tool', tool_key: 'custom', type: 'tool', capabilities: {} }
        ]);
        try {
            const tools = await Promise.race([
                toolRuntimeV2.listTools(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('catalog_waited_for_bootstrap_writes')), 100))
            ]);
            expect(tools.some(tool => tool.id === 'ui.draw.edit')).toBe(false);
            expect(tools.some(tool => tool.id === 'ui.ai.image.generate')).toBe(true);
            expect(tools.some(tool => tool.id === 'custom_tool')).toBe(true);
            expect(boot).not.toHaveBeenCalled();
            const all = await toolRuntimeV2.listTools({ includeDisabled: true });
            expect(all.find(tool => tool.id === 'ui.draw.edit')?.capabilities?.disabled).toBe(true);
        } finally { boot.mockRestore(); list.mockRestore(); }
    });

    it('discovers graphical built-ins even when the persisted native catalog is empty', async () => {
        const { toolRegistryV2 } = await import('../../eVe/intuition/tools/core/tool_registry.js');
        const boot = vi.spyOn(toolRuntimeV2, 'bootstrap').mockResolvedValue({ ok: true });
        const list = vi.spyOn(toolRegistryV2, 'listTools').mockResolvedValue([]);
        try {
            const tools = await toolRuntimeV2.listTools();
            expect(tools.find(tool => tool.id === 'ui.draw.edit')?.input_schema?.properties?.mode).toBeDefined();
            expect(tools.find(tool => tool.id === 'ui.ai.image.generate')?.input_schema?.properties?.prompt).toBeDefined();
        } finally { boot.mockRestore(); list.mockRestore(); }
    });

});

// Boot reconciliation re-applies every tool: an identical patch must not
// re-save it with a fresh `updated_at` (one history version per tool and launch).
it('an update that changes nothing does not re-save the tool', async () => {
    const { ToolRegistryV2, InMemoryToolRegistryStorage } = await import('../../eVe/intuition/tools/core/tool_registry.js');
    const storage = new InMemoryToolRegistryStorage();
    let saves = 0;
    const save = storage.save.bind(storage);
    storage.save = async (tool) => { saves += 1; return save(tool); };
    const registry = new ToolRegistryV2({ storage });
    await registry.createTool({ id: 'probe_tool', tool_key: 'probe', type: 'tool', schema_version: 2,
        ui: { label_key: 'eve.probe', label_fallback: 'Probe' }, behavior: {}, capabilities: {}, bindings: {} }, { actor: 'system' });
    const created = saves;
    await registry.updateTool('probe', { ui: { label_fallback: 'Probe' } }, { actor: 'system' });
    expect(saves).toBe(created);
    await registry.updateTool('probe', { ui: { label_fallback: 'Other' } }, { actor: 'system' });
    expect(saves).toBe(created + 1);
});
