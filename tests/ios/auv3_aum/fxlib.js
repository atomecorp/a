const mcp = (m, p) => window.handleAtomeMCPRequestAsync({ jsonrpc: '2.0', id: m, method: m, params: p }, { source: { type: 'system', layer: 'probe' } });
const res = (r) => r?.result?.result?.result ?? r?.result?.result ?? r?.result ?? r;
const rack = await import('/chunks/shared/__FX__');
const peaks = async (n = 10) => { const out = []; for (let i = 0; i < n; i++) { await wait(100); const l = await rack.getFxRackRuntime().levels(); out.push(l.map((x) => +(x.peak || 0).toFixed(3))); } return out; };
const strips = async () => (res(await mcp('audio_fx.catalog', {})).strips || []).map((s) => ({ id: s.strip_id, on: s.on, input: s.device_id || s.input?.device_id || s.instrument_id, mods: s.modules.map((m) => `${m.key}${m.bypass ? '(byp)' : ''}`) }));
const yes = async (m, p) => { const f = res(await mcp(m, p)); return f?.confirmation_required ? res(await mcp(m, { ...p, confirmed: true, confirmation_id: f.confirmation_id })) : f; };
