import { findBevyUiNodeTarget, wait } from './molecule_ui_acceptance_support.mjs';

// A projected plate can still be in its opening wave. The context owner
// intentionally dismisses a press before that plate is eligible; projection
// alone therefore does not prove that a real tap can activate it.
export const awaitMysticItemTarget = async (page, key, { timeoutMs = 8000 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        const target = await findBevyUiNodeTarget(page, {
            nodePrefix: `eve_bevy_ui_mystic_item_${key}_`, treeId: 'eve_bevy_ui_mystic', step: 2
        });
        if (target) {
            last = await page.evaluate(async ({ x, y, expected }) => {
                const runtime = (await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js')).getMysticRuntime();
                const button = runtime?.resolveButtonFromPoint?.({ x, y });
                return { ok: button?.key === expected, button: button?.key || '', measure: runtime?.measure?.() };
            }, { x: target.x, y: target.y, expected: key });
            if (last.ok) return target;
        }
        await wait(100);
    }
    throw new Error(`mystic_item_not_ready:${key}:${JSON.stringify(last)}`);
};
