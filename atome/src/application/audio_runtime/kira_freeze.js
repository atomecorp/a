// The Kira backend's track freeze (R-370): a strip's stem rendered by the engine while it has room, then heard in
// place of the strip's frozen part (atome-mix-graph freeze*.rs). The page's engine renders a slice at a time when the
// page asks (`freeze_advance`, eVe audio_freeze); a native engine (Tauri, iOS) renders on its own low-priority thread
// and has nothing to advance. Stems live in the engine's memory only. The plan is the proxy's (project_proxy_plan.js),
// its voices in the engine's words.
import { enginePlan } from './kira_render_proxy.js';

const answered = (answer) => {
    if (answer?.success !== true) throw new Error(String(answer?.error || 'freeze_failed'));
    return answer;
};

export const createKiraFreezeMethods = ({ invoke, ensureRuntimeMode, readWasm }) => {
    // The page's engine (a function of its module), else the native one (a command).
    const run = (wasmCall, command, args) => ensureRuntimeMode({ audioManager: true }).then(() => {
        const wasm = readWasm();
        if (wasm) return wasmCall(wasm);
        return invoke(command, args).then(answered);
    });
    return {
        // `{ plan, strip_id }` → `{ key, ready, steps }`.
        freeze_render({ plan, strip_id: stripId } = {}) {
            if (!plan || typeof plan !== 'object') return Promise.reject(new Error('render_plan_invalid:plan_required'));
            const asked = enginePlan(plan);
            return run((wasm) => wasm.audio_freeze_render(asked, stripId), 'audio_freeze_render', { plan: asked, strip_id: stripId });
        },
        // `{ budget_ms }` → whether renders remain to advance on the page (a native engine advances its own: false).
        freeze_advance({ budget_ms: budgetMs = 8 } = {}) {
            const wasm = readWasm();
            return Promise.resolve(wasm ? wasm.audio_freeze_advance(budgetMs) : false);
        },
        freeze_apply({ strip_id: stripId, key } = {}) {
            return run((wasm) => { wasm.audio_freeze_apply(stripId, key); return { success: true }; },
                'audio_freeze_apply', { strip_id: stripId, key });
        },
        freeze_thaw({ strip_id: stripId } = {}) {
            return run((wasm) => { wasm.audio_freeze_thaw(stripId); return { success: true }; },
                'audio_freeze_thaw', { strip_id: stripId });
        },
        // → `{ load, peak, loads: [{ strip_id, load }], frozen: [{ strip_id, key, mix }], renders, used_bytes, budget_bytes }`.
        freeze_status() {
            return run((wasm) => wasm.audio_freeze_status(), 'audio_freeze_status', {});
        },
        freeze_reset_peak() {
            return run((wasm) => { wasm.audio_freeze_reset_peak(); return { success: true }; }, 'audio_freeze_reset_peak', {});
        },
        freeze_retain({ keys = [] } = {}) {
            return run((wasm) => { wasm.audio_freeze_retain(keys); return { success: true }; }, 'audio_freeze_retain', { keys });
        }
    };
};
