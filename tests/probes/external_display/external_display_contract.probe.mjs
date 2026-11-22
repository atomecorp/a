// R-212 — connected screens, the pure contract: the place's view math, the link, the Web screens' choice and life.
// Run: node tests/probes/external_display/external_display_contract.probe.mjs
import { externalDisplayViewOf, externalDisplayFollowerView, normalizeExternalDisplayPlace, externalDisplayPlaceChanges } from '../../../eVe/domains/rendering/external_display_place.js';
import { openExternalDisplayLink } from '../../../eVe/domains/rendering/external_display_link.js';
import { pickExternalDisplayScreen, watchExternalDisplayScreens, externalDisplayWindowFeatures } from '../../../eVe/domains/rendering/external_display_web_screens.js';

let failed = 0;
const check = (label, ok, detail = '') => { console.log(ok ? 'OK  ' : 'FAIL', label, ok ? '' : JSON.stringify(detail)); if (!ok) failed += 1; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1. Same spot, same scale, more room: a phone 390×844 zoomed ×2 on project point (100, 50).
const phone = { x: 0, y: 0, width: 390, height: 844 }, tv = { x: 0, y: 0, width: 1920, height: 1080 };
const phoneView = { zoom: 2, x: 195 - 100 * 2, y: 422 - 50 * 2 };
const place = externalDisplayViewOf(phoneView, phone);
check('le centre du téléphone est lu en coordonnées projet', near(place.cx, 100) && near(place.cy, 50) && place.zoom === 2, place);
const tvView = externalDisplayFollowerView(place, tv);
check('la télé pose le même point au même zoom en son centre', tvView.zoom === 2 && near((960 - tvView.x) / 2, 100) && near((540 - tvView.y) / 2, 50), tvView);
const visible = { width: tv.width / tvView.zoom, height: tv.height / tvView.zoom };
check('la télé montre plus de place à son format, jamais étirée', visible.width * visible.height > (phone.width / 2) * (phone.height / 2) && visible.width / visible.height === 1920 / 1080, visible);

// 2. A place normalised; what changed.
const home = normalizeExternalDisplayPlace({ surface: 'dashboard', dashboard: { rubric: { rubric: 'contacts' }, page: null } });
check('accueil : pas de projet, pas de vue', home.surface === 'dashboard' && home.projectId === '' && home.view === null, home);
const project = normalizeExternalDisplayPlace({ surface: 'project', projectId: 'p1', viewMode: 'natural', view: place });
check('projet sans id = accueil', normalizeExternalDisplayPlace({ surface: 'project' }).surface === 'dashboard');
const c1 = externalDisplayPlaceChanges(project, home);
check('accueil → projet : tout est refait', c1.surface && c1.view && c1.viewMode, c1);
const c2 = externalDisplayPlaceChanges({ ...project, view: { ...project.view, cx: 7 } }, project);
check('un pan seul : seule la vue', !c2.surface && c2.view && !c2.viewMode && !c2.dashboard && !c2.playing, c2);
const playing = normalizeExternalDisplayPlace({ ...project, playing: [{ id: 'v1', at: 12.5 }, { id: 'a1', at: null }, { id: '' }] });
check('lecture : ce qui joue, avec le temps d’une vidéo', JSON.stringify(playing.playing) === JSON.stringify([{ id: 'v1', at: 12.5 }, { id: 'a1', at: null }]), playing.playing);
check('lecture lancée : seule la lecture change', externalDisplayPlaceChanges(playing, project).playing && !externalDisplayPlaceChanges(playing, project).view);
check('le temps qui avance ne relance rien', !externalDisplayPlaceChanges(normalizeExternalDisplayPlace({ ...playing, playing: [{ id: 'v1', at: 13 }, { id: 'a1', at: null }] }), playing).playing);
check('à l’accueil : rien ne joue', normalizeExternalDisplayPlace({ surface: 'dashboard', playing: [{ id: 'v1' }] }).playing.length === 0);
// The Timeline's transport: the playhead follows during a playback and a take (user, 19 Nov. 2026).
const rolling = normalizeExternalDisplayPlace({ ...project, transport: { groupId: 'g1', seconds: 3.2, playing: true, recordingTrackIds: ['t1', ''] } });
check('transport : groupe, position, lecture, prises', JSON.stringify(rolling.transport) === JSON.stringify({ groupId: 'g1', seconds: 3.2, playing: true, recordingTrackIds: ['t1'] }), rolling.transport);
check('transport sans groupe : aucun', normalizeExternalDisplayPlace({ ...project, transport: { seconds: 2 } }).transport === null);
check('à l’accueil : aucun transport', normalizeExternalDisplayPlace({ surface: 'dashboard', transport: { groupId: 'g1' } }).transport === null);
const moved = normalizeExternalDisplayPlace({ ...rolling, transport: { ...rolling.transport, seconds: 3.3 } });
const c3 = externalDisplayPlaceChanges(moved, rolling);
check('la tête avance : seul le transport change', c3.transport && !c3.view && !c3.playing && !c3.surface, c3);
check('rien ne bouge : transport inchangé', !externalDisplayPlaceChanges(rolling, rolling).transport);
// The timelines the device saved (a take, an edit): carried as they are, for the screen's open sessions.
const saved = normalizeExternalDisplayPlace({ ...project, timelines: [{ groupId: 'g1', timeline: { timeline_id: 'tl_g1' } }, { groupId: '', timeline: {} }, { groupId: 'g2' }] });
check('timelines enregistrées : seules les valides', saved.timelines.length === 1 && saved.timelines[0].groupId === 'g1' && saved.timelines[0].timeline.timeline_id === 'tl_g1', saved.timelines);
// The device's work mode: the screen shows the same tools (user, 19 Nov. 2026: « des deux côtés »).
const editing = normalizeExternalDisplayPlace({ ...project, workMode: 'edit' });
check('mode de travail : porté, inconnu ignoré', editing.workMode === 'edit' && normalizeExternalDisplayPlace({ ...project, workMode: 'x' }).workMode === '');
const c4 = externalDisplayPlaceChanges(normalizeExternalDisplayPlace({ ...project, workMode: 'consultation' }), editing);
check('Consultation ↔ Édition : seul le mode change', c4.workMode && !c4.view && !c4.surface, c4);
check('à l’accueil : aucune timeline', normalizeExternalDisplayPlace({ surface: 'dashboard', timelines: [{ groupId: 'g1', timeline: {} }] }).timelines.length === 0);

// 3. The link between two same-origin pages (BroadcastChannel); a relayed page (iOS) only receives.
const fakeWin = () => ({ BroadcastChannel, location: { origin: 'http://localhost:1' } });
const got = [];
const a = openExternalDisplayLink({ win: fakeWin(), onMessage: m => got.push(m) });
const bWin = fakeWin();
const b = openExternalDisplayLink({ win: bWin, onMessage: m => got.push(m) });
b.send({ type: 'hello' });
await new Promise(resolve => setTimeout(resolve, 50));
check('le hello du suiveur arrive au meneur', got.some(m => m.type === 'hello'), got);
a.close(); b.close();
const relayedWin = { __eveExternalDisplayRelay: true, location: { origin: 'null' } };
const r = openExternalDisplayLink({ win: relayedWin, onMessage: m => got.push(m) });
relayedWin.__eveExternalDisplayReceive({ type: 'place', place: home });
check('page relayée (iOS) : reçoit par l’app', got.at(-1)?.type === 'place' && r.native === false);
let threw = '';
try { openExternalDisplayLink({ win: { location: { origin: 'null' } }, onMessage: () => {} }); } catch (error) { threw = error.message; }
check('sans canal ni relais : erreur explicite', threw === 'external_display_link_unavailable', threw);
const posted = [];
const nativeWin = { webkit: { messageHandlers: { swiftBridge: { postMessage: m => posted.push(m) } } }, location: { origin: 'null' } };
openExternalDisplayLink({ win: nativeWin, onMessage: () => {} }).send({ type: 'place', place: home });
check('meneur iOS : la place part par le pont natif', posted[0]?.action === 'externalDisplay' && posted[0].message.type === 'place', posted);

// 4. The Web screens: the external one chosen; opened at the next touch; closed when unplugged.
const internal = { isInternal: true, availLeft: 0, availTop: 0, availWidth: 1440, availHeight: 900 };
const external = { isInternal: false, availLeft: 1440, availTop: 0, availWidth: 1920, availHeight: 1080 };
check('l’écran externe est choisi', pickExternalDisplayScreen({ screens: [internal, external], currentScreen: internal }) === external);
check('seul : aucun écran', pickExternalDisplayScreen({ screens: [internal], currentScreen: internal }) === null);
check('fenêtre posée sur tout l’écran', externalDisplayWindowFeatures(external) === 'popup,left=1440,top=0,width=1920,height=1080');
const listeners = {}, detailsListeners = {}, opens = [];
const details = { screens: [internal], currentScreen: internal, addEventListener: (name, fn) => { detailsListeners[name] = fn; } };
const popup = { closed: false, close() { this.closed = true; } };
const win = { location: { href: 'http://localhost:9/index.html#x' }, screen: { isExtended: false, addEventListener: (name, fn) => { listeners[`screen:${name}`] = fn; } },
    getScreenDetails: async () => details, open: (...args) => { opens.push(args); popup.closed = false; return popup; },
    addEventListener: (name, fn) => { listeners[name] = fn; } };
const watch = watchExternalDisplayScreens(win);
check('API présente : suivie', watch.supported === true);
win.screen.isExtended = true; details.screens = [internal, external]; listeners['screen:change']();
await new Promise(resolve => setTimeout(resolve, 10));
check('écran branché : ouverture armée au prochain toucher', watch.inspect().armed && opens.length === 0, watch.inspect());
listeners.pointerdown();
check('au toucher : la page suiveuse s’ouvre sur l’écran', opens.length === 1 && opens[0][0] === 'http://localhost:9/index.html?display=follower' && opens[0][2].includes('left=1440'), opens);
details.screens = [internal]; detailsListeners.screenschange();
check('débranché : sa fenêtre se ferme', popup.closed === true && !watch.inspect().target, watch.inspect());
details.screens = [internal, external]; detailsListeners.screenschange();
check('rebranché : réarmé', watch.inspect().armed === true);
check('navigateur sans API : rien', watchExternalDisplayScreens({ screen: {} }).supported === false);

console.log(failed ? `\n${failed} FAIL` : '\nALL OK');
process.exit(failed ? 1 : 0);
