// R-212 — the device's keyboard for the screen's page (external_display_keyboard.js): an editable that takes the focus
// asks the app for the keyboard, one that loses it gives it back; each key the app hands back is typed into the
// focused element as a browser types it. The app is stood in for by a recorder of the page's messages.
// Run: node tests/probes/external_display/external_display_keyboard.probe.mjs   (HEADLESS=0 to watch)
import { createReport, openHome, sleep } from '../../helpers/probe_home.mjs';

const R = createReport('external_display_keyboard');
const { check, note, report } = R;
const { page, close } = await openHome({ ...R, view: 'phone' });

try {
    await page.evaluate(async () => {
        window.__keyboardSent = [];
        // The screen's page as the app makes it (ExternalDisplaySceneDelegate.swift): marked relayed, its own handler.
        window.__eveExternalDisplayRelay = true;
        window.webkit = { messageHandlers: { externalDisplayFollower: { postMessage: (m) => window.__keyboardSent.push(JSON.parse(JSON.stringify(m))) } } };
        (await import('/eVe/domains/rendering/external_display_keyboard.js')).installExternalDisplayKeyboard(window);
        const text = Object.assign(document.createElement('div'), { id: 'kb_text', contentEditable: 'true' });
        const field = Object.assign(document.createElement('input'), { id: 'kb_field', type: 'text' });
        const button = Object.assign(document.createElement('button'), { id: 'kb_button', textContent: 'ok' });
        document.body.append(text, field, button);
        window.__kbInputs = 0;
        text.addEventListener('input', () => { window.__kbInputs += 1; });
        text.focus();
    });
    await sleep(100);
    check('un texte prend le focus : le clavier est demandé', JSON.stringify(await page.evaluate(() => window.__keyboardSent)) === JSON.stringify([{ type: 'keyboard', open: true }]));
    const typed = await page.evaluate(() => {
        for (const c of ['S', 'a', 'l', 'u', 't']) window.__eveExternalDisplayKeyboard({ insert: c });
        window.__eveExternalDisplayKeyboard({ delete: true });
        window.__eveExternalDisplayKeyboard({ insert: 'é' });
        return { text: document.getElementById('kb_text').textContent, inputs: window.__kbInputs };
    });
    check('les touches s’écrivent dans le texte, l’effacement aussi, avec ses événements input', typed.text === 'Salué' && typed.inputs === 7, typed);
    const field = await page.evaluate(async () => {
        document.getElementById('kb_field').focus();
        await new Promise(resolve => setTimeout(resolve, 50));
        let entered = 0;
        document.getElementById('kb_field').addEventListener('keydown', (event) => { if (event.key === 'Enter') entered += 1; });
        window.__eveExternalDisplayKeyboard({ insert: 'ab' });
        window.__eveExternalDisplayKeyboard({ key: 'Enter' });
        return { value: document.getElementById('kb_field').value, entered, sent: window.__keyboardSent.length };
    });
    check('d’un texte à un champ : le clavier reste, sans nouvelle demande', field.sent === 1, field);
    check('le champ reçoit ses touches, et Entrée comme une touche', field.value === 'ab' && field.entered === 1, field);
    await page.evaluate(() => document.getElementById('kb_button').focus());
    await sleep(100);
    check('un bouton prend le focus : le clavier est rendu', JSON.stringify((await page.evaluate(() => window.__keyboardSent)).at(-1)) === JSON.stringify({ type: 'keyboard', open: false }));
    // A text whose edit ends while it keeps the focus (a click elsewhere in Atome): the keyboard goes back all the same.
    await page.evaluate(async () => {
        document.getElementById('kb_text').focus();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.getElementById('kb_text').contentEditable = 'false';
    });
    await sleep(600);
    const ended = await page.evaluate(() => ({ last: window.__keyboardSent.at(-1), focused: document.activeElement?.id }));
    check('un texte qui cesse d’être éditable en gardant le focus : le clavier est rendu', JSON.stringify(ended.last) === JSON.stringify({ type: 'keyboard', open: false }), ended);
    check('sans élément éditable, une touche ne fait rien', await page.evaluate(() => window.__eveExternalDisplayKeyboard({ insert: 'x' })) === false);
} catch (error) {
    check('sans exception', false, String(error?.stack || error));
} finally {
    note('erreurs', report.errors);
    R.write();
    await close();
}
console.log(R.state.failed ? `\n${R.state.failed} FAIL` : '\nALL OK');
process.exit(R.state.failed ? 1 : 0);
