// Bounded distribution shell: one link assembled through canonical Squirrel.
import { $ } from '../squirrel.js';
import { eveT, registerEveMessages, setEveLocale } from '/eVe/i18n/i18n.js';

registerEveMessages('fr', { 'eve.distribution.install': 'Installer atome', 'eve.distribution.denied': 'Lien indisponible' });
registerEveMessages('en', { 'eve.distribution.install': 'Install atome', 'eve.distribution.denied': 'Link unavailable' });
setEveLocale(navigator.language.startsWith('fr') ? 'fr' : 'en');
const token = location.hash.slice(1);
const response = await fetch('/ios/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
const session = await response.json();
const shell = $('main', { id: 'ios-install-shell', tag: 'main', parent: document.body,
    css: { display: 'grid', placeItems: 'center', minHeight: '90vh', fontFamily: 'system-ui' } });
if (response.ok) {
    $('a', { id: 'ios-install-link', tag: 'a', parent: shell, text: eveT('eve.distribution.install'), attrs: { href: session.install } });
} else {
    $('p', { id: 'ios-install-unavailable', tag: 'p', parent: shell, text: eveT('eve.distribution.denied') });
}
