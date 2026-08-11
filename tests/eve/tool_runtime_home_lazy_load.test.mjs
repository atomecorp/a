import { describe, expect, it, vi } from 'vitest';
import { buildPanelRuntimeConfigByToolId } from '../../eVe/intuition/panel_definitions.js';
import { createToolRuntimeBootstrapPanelHandlers } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_panel_handlers.js';

const ensureString = (value, fallback = '') => {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback;
};

const createHomeHandler = ({ ensureToolModule, callWindowRuntimeFunction, buildDynamicImportFailureResult }) => (
    createToolRuntimeBootstrapPanelHandlers({
        DEFAULT_PRESENTATION: 'ui',
        buildDynamicImportFailureResult,
        callWindowRuntimeFunction,
        closePanelSurface: vi.fn(),
        deepClone: (value) => structuredClone(value),
        ensureString,
        ensureToolModule,
        isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        normalizeAction: () => 'pointer.click',
        openPanelSurface: vi.fn(),
        readRegisteredHandlerLatchedState: () => false,
        resolveRegisteredHandlerNextLatchedState: () => true,
        writeRegisteredHandlerLatchedState: vi.fn()
    }).executeBootstrapPanelHandler
);

describe('Runtime V2 Home lazy owner', () => {
    it('loads the canonical Home module before invoking its window owner', async () => {
        const order = [];
        const ensureToolModule = vi.fn(async (moduleKey) => order.push(`module:${moduleKey}`));
        const callWindowRuntimeFunction = vi.fn(async (name) => {
            order.push(`window:${name}`);
            return { ok: true, invoked: true, result: { ok: true } };
        });
        const executeBootstrapPanelHandler = createHomeHandler({
            ensureToolModule,
            callWindowRuntimeFunction,
            buildDynamicImportFailureResult: vi.fn()
        });
        const config = buildPanelRuntimeConfigByToolId()['ui.home.panel'];

        const result = await executeBootstrapPanelHandler({ tool_id: 'ui.home.panel' }, config);

        expect(config).toMatchObject({ module_key: 'home', open_fn: 'open_home_panel' });
        expect(order).toEqual(['module:home', 'window:open_home_panel']);
        expect(result).toMatchObject({ ok: true, active: true, bridged: 'window_function' });
    });

    it('returns the existing typed import failure without invoking the window owner', async () => {
        const error = new Error('home_import_failed');
        const ensureToolModule = vi.fn(async () => { throw error; });
        const callWindowRuntimeFunction = vi.fn();
        const buildDynamicImportFailureResult = vi.fn((owner, cause, details) => ({
            ok: false,
            error: 'dynamic_import_failed',
            owner,
            cause: cause.message,
            ...details
        }));
        const executeBootstrapPanelHandler = createHomeHandler({
            ensureToolModule,
            callWindowRuntimeFunction,
            buildDynamicImportFailureResult
        });

        const result = await executeBootstrapPanelHandler(
            { tool_id: 'ui.home.panel' },
            { module_key: 'home', open_fn: 'open_home_panel', close_fn: 'close_home_panel' }
        );

        expect(result).toMatchObject({
            ok: false,
            error: 'dynamic_import_failed',
            owner: 'home_module',
            tool_id: 'ui.home.panel'
        });
        expect(callWindowRuntimeFunction).not.toHaveBeenCalled();
    });
});
