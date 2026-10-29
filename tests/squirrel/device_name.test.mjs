// The name of a device (atome/src/squirrel/apis/unified/adole_api/surfaces.js): the
// account device registry keeps it, the surface only announces it. The registry and the
// wire are recorders; the owner, its one-time transfer of a voice-era name and the
// Home › My hardware runtime and view are the real modules.
import { beforeEach, expect, test, vi } from 'vitest';

const registry = new Map();
const sent = [];
const storage = new Map();
const thisDevice = { current: 'device-mac' };

vi.mock('../../atome/src/squirrel/apis/unified/adole.js', () => ({
    FastifyAdapter: {
        getToken: () => 'token',
        ws: { connectionGeneration: 1, send: async (message) => { sent.push(message); return { success: true, surfaces: [] }; } }
    }
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/auth_methods_account.js', () => ({
    describeThisDevice: () => ({ platform: 'web', label: 'Chrome · Mac' }),
    accountMethods: {
        listDevices: async () => ({ ok: true, devices: [...registry.entries()]
            .map(([deviceId, label]) => ({ deviceId, label, current: deviceId === thisDevice.current })) }),
        renameDevice: async (deviceId, label) => { registry.set(deviceId, label); return { ok: true }; }
    }
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/auth_fastify_token.js', () => ({ ensureFastifyToken: async () => ({ ok: true }) }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => ({ mode: 'authenticated' }) }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/runtime.js', () => ({ isTauriRuntime: () => false }));

globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
};

// A fresh module is a fresh launch: nothing of the previous one is in memory.
const launch = async () => {
    vi.resetModules();
    return import('../../atome/src/squirrel/apis/unified/adole_api/surfaces.js');
};
const lastAnnounce = () => sent.filter((message) => message.action === 'announce').at(-1);

beforeEach(() => {
    registry.clear();
    sent.length = 0;
    storage.clear();
    registry.set('device-mac', 'Chrome · Mac');
    registry.set('device-tv', 'Télé du salon');
});

test('the announced name is the account registry one, and a rename is kept there and announced', async () => {
    const surfaces = await launch();
    await surfaces.ensureSurfaceAnnounced();
    expect(lastAnnounce()).toMatchObject({ type: 'surface', label: 'Chrome · Mac' });

    const renamed = await surfaces.renameLocalSurface('  Mac du bureau  ');
    expect(renamed).toMatchObject({ ok: true, name: 'Mac du bureau', announced: true });
    expect(registry.get('device-mac')).toBe('Mac du bureau');
    expect(registry.get('device-tv')).toBe('Télé du salon');
    expect(lastAnnounce().label).toBe('Mac du bureau');
    // Nothing of the name stays on the device: the account is its only keeper.
    expect([...storage.keys()].filter((key) => key !== 'squirrel.surface_id')).toEqual([]);
    await expect(surfaces.renameLocalSurface('   ')).rejects.toThrow('surface_name_required');
});

test('a reinstall (no local storage, same device key) announces the name the account kept', async () => {
    registry.set('device-mac', 'Mac du bureau');
    const surfaces = await launch();
    expect(await surfaces.readLocalSurfaceName()).toBe('Mac du bureau');
    await surfaces.ensureSurfaceAnnounced();
    expect(lastAnnounce().label).toBe('Mac du bureau');
});

test('a name given by voice before 1.37 joins the account once, then leaves the device', async () => {
    storage.set('squirrel.surface_label', 'Télé de la chambre');
    const surfaces = await launch();
    expect(await surfaces.readLocalSurfaceName()).toBe('Télé de la chambre');
    expect(registry.get('device-mac')).toBe('Télé de la chambre');
    expect(storage.has('squirrel.surface_label')).toBe(false);
});

test('a device enrolled without a name is called what its enrollment calls it', async () => {
    registry.set('device-mac', '');
    const surfaces = await launch();
    expect(await surfaces.readLocalSurfaceName()).toBe('Chrome · Mac');
});

test('Home › My hardware reads and renames through the same owner, and restores the name on a refusal', async () => {
    const surfaces = await launch();
    const others = [{ surface_id: 's-tv', label: 'Télé du salon', platform: 'browser' }];
    globalThis.window = Object.assign(new EventTarget(), { AdoleAPI: { surfaces: {
        localName: surfaces.readLocalSurfaceName,
        rename: surfaces.renameLocalSurface,
        list: async ({ excludeSelf }) => ({ ok: excludeSelf === true, own: others, surfaces: others })
    } } });
    const { createHomeHardwareRuntime, emptyHomeHardware } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_hardware.js');
    const notices = [];
    const state = { hardware: emptyHomeHardware() };
    const hardware = createHomeHardwareRuntime({ state, setNotice: (text, error) => notices.push({ text, error }) });

    expect(await hardware.refresh()).toEqual({ ok: true });
    expect(state.hardware).toEqual({ deviceName: 'Chrome · Mac', devices: others });
    expect(hardware.owns('hardware.deviceName')).toBe(true);

    state.hardware.deviceName = 'Mac du bureau';
    expect(await hardware.commit()).toEqual({ ok: true });
    expect(registry.get('device-mac')).toBe('Mac du bureau');
    expect(lastAnnounce().label).toBe('Mac du bureau');

    state.hardware.deviceName = ' ';
    expect(await hardware.commit()).toMatchObject({ ok: false, error: 'surface_name_required' });
    expect(state.hardware.deviceName).toBe('Mac du bureau');
    expect(notices.at(-1).error).toBe(true);
});

test('the section shows the name field and the other devices; a guest gets the account notice', async () => {
    const { buildHomeSettingsFocus } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_settings_view.js');
    const editing = { registerFieldWidth: () => {}, displayValue: () => 'Mac du bureau', fieldView: () => ({}) };
    const state = { guest: false, subsections: {}, hardware: { deviceName: 'Mac du bureau',
        devices: [{ surface_id: 's-tv', label: 'Télé du salon', platform: 'browser' }] } };
    const ids = [];
    const texts = [];
    const walk = (node) => {
        if (!node) return;
        if (node.id) ids.push(node.id);
        if (typeof node.text === 'string') texts.push(node.text);
        (node.children || []).forEach(walk);
    };
    walk(buildHomeSettingsFocus({ focus: 'hardware', state, width: 400, editing, emit: () => {} }));
    expect(ids).toContain('home_hardware_device_name_input');
    expect(texts).toContain('Télé du salon');
    expect(texts).toContain('Mac du bureau');

    const guestIds = [];
    const collect = (node) => { if (!node) return; if (node.id) guestIds.push(node.id); (node.children || []).forEach(collect); };
    collect(buildHomeSettingsFocus({ focus: 'hardware', state: { ...state, guest: true }, width: 400, editing, emit: () => {} }));
    expect(guestIds).toContain('home_hardware_content_notice');
    expect(guestIds).not.toContain('home_hardware_device_name_input');
}, 60000);
