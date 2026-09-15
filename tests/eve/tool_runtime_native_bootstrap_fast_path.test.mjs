import { beforeAll, describe, expect, it, vi } from 'vitest';
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
