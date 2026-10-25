// Bounded distribution shell: one link assembled through canonical Squirrel.
import { $, clearChildren } from '../squirrel.js';
import { eveT, registerEveMessages, setEveLocale } from '/eVe/i18n/i18n.js';

registerEveMessages('fr', { 'eve.distribution.install': 'Installer atome', 'eve.distribution.denied': 'Lien indisponible' });
registerEveMessages('en', { 'eve.distribution.install': 'Install atome', 'eve.distribution.denied': 'Link unavailable' });
setEveLocale(navigator.language.startsWith('fr') ? 'fr' : 'en');
const token = location.hash.slice(1);
const shell = $('main', { id: 'ios-install-shell', tag: 'main', parent: document.body,
    css: { display: 'grid', placeItems: 'center', minHeight: '90vh', fontFamily: 'system-ui' } });

// The install link always targets the current release; its capability expires,
// so a tab kept open or restored by Safari asks for a fresh one when shown again.
async function showInstallLink() {
    const response = await fetch('/ios/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const session = await response.json();
    clearChildren(shell);
    if (response.ok) {
        $('a', { id: 'ios-install-link', tag: 'a', parent: shell, text: eveT('eve.distribution.install'), attrs: { href: session.install } });
    } else {
        $('p', { id: 'ios-install-unavailable', tag: 'p', parent: shell, text: eveT('eve.distribution.denied') });
    }
}

await showInstallLink();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') showInstallLink(); });
window.addEventListener('pageshow', event => { if (event.persisted) showInstallLink(); });
