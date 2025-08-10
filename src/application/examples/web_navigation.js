// Évaluation: Google dans une iframe peut être limité par X-Frame-Options/CSP.
// Approche: iframe "best-effort" (igu=1) + bouton de retour sans recharger toute la page.

// Références partagées
let searchFrameRef = null;
let statusBarRef = null;
let openTabRef = null; // lien supprimé (non utilisé)

// Barre supérieure avec bouton Retour Google
const topBar = $('div', {
	parent: '#view',
	css: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		padding: '8px 12px',
		backgroundColor: '#fff',
		border: '1px solid #eee',
		borderRadius: '8px',
		margin: '12px auto 8px',
		maxWidth: '960px'
	}
});

const backBtn = Button({
	id: 'back_to_google_btn',
	onText: 'Home',
	offText: 'Google',
	onAction: () => {
		const url = 'https://www.google.com/?igu=1&hl=fr';
		if (statusBarRef) { statusBarRef.$({ text: 'Chargement…' }); }
		if (searchFrameRef) { searchFrameRef.src = url; }
	},
	parent: topBar
});



// Container principal (non plein écran)
const container = $('div', {
	parent: '#view',
	id: 'simple-search-container',
	css: {
		maxWidth: '960px',
		margin: '8px auto 16px',
		border: '1px solid #ddd',
		borderRadius: '8px',
		overflow: 'hidden',
		boxShadow: '0 4px 8px rgba(0,0,0,0.08)'
	}
});

// Header avec contrôles
const header = $('div', {
	parent: container,
	css: {
		display: 'flex',
		gap: '8px',
		alignItems: 'center',
		padding: '12px',
		backgroundColor: '#f8f9fa',
		borderBottom: '1px solid #eee',
		flexWrap: 'wrap'
	}
});

$('div', {
	parent: header,
	css: { fontWeight: '600', color: '#333', marginRight: '8px' },
	text: 'Recherche Web'
});

const input = $('input', {
	parent: header,
	attrs: { type: 'text', placeholder: 'Rechercher sur Google…' },
	css: {
		flex: '1 1 300px',
		minWidth: '200px',
		height: '36px',
		padding: '0 12px',
		border: '1px solid #ddd',
		borderRadius: '18px',
		outline: 'none'
	},
	onkeypress: (e) => { if (e.key === 'Enter') performSearch(); }
});

const typeSelect = $('select', {
	parent: header,
	css: { height: '36px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff' }
});
['all:Tous','videos:Vidéos','images:Images','news:Actualités','audio:Audio'].forEach(p => {
	const [v,l] = p.split(':');
	$('option', { parent: typeSelect, attrs: { value: v }, text: l });
});
// Par défaut, afficher l’onglet Vidéos pour rendre la liste interne visible dès la première recherche
try { typeSelect.value = 'videos'; } catch (_) {}
// Si l'utilisateur change de type sans relancer la recherche, masquer les résultats internes
typeSelect.onchange = () => { if (typeSelect.value !== 'videos') clearInternalResults(); };

const dateSelect = $('select', {
	parent: header,
	css: { height: '36px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fff' }
});
['any:Toutes dates','hour:Dernière heure','day:Dernières 24h','week:Dernière semaine','month:Dernier mois','year:Dernière année'].forEach(p => {
	const [v,l] = p.split(':');
	$('option', { parent: dateSelect, attrs: { value: v }, text: l });
});

const searchBtn = Button({
	id: 'do_search_btn',
	onText: 'Rechercher',
	offText: 'Rechercher',
	onAction: () => performSearch(),
	parent: header
});


// Lien "Ouvrir dans un nouvel onglet" supprimé selon demande

// ===== Résultats internes (Vidéos) contrôlés par l'app — au-dessus de l'iframe =====
const internalResults = $('div', {
	parent: container,
	id: 'internal-results',
	css: { display: 'none', padding: '10px', borderBottom: '1px solid #eee', backgroundColor: '#fff' }
});

// Iframe
searchFrameRef = $('iframe', {
	parent: container,
	id: 'search-frame',
	attrs: { src: 'about:blank', frameborder: '0' },
	css: { width: '100%', height: '70vh', border: 'none', display: 'block', backgroundColor: 'white' }
});

// Barre d'état
statusBarRef = $('div', {
	parent: container,
	css: { padding: '8px 12px', fontSize: '12px', color: '#666', backgroundColor: '#fafafa', borderTop: '1px solid #eee' },
	text: 'Entrez une recherche et appuyez sur Entrée.'
});

// (résultats internes déplacés au-dessus de l'iframe)

function getApiBase() {
	try {
		const origin = (window && window.location && window.location.origin) ? window.location.origin : '';
		if (!origin || origin === 'null' || origin.startsWith('file:')) return 'http://localhost:3001';
		return origin;
	} catch (_) { return 'http://localhost:3001'; }
}

function clearInternalResults() {
	internalResults.style.display = 'none';
	internalResults.innerHTML = '';
}

function renderVideoResults(items) {
	internalResults.innerHTML = '';
	const count = (items && items.length) ? items.length : 0;
	if (!items || !items.length) {
		$('div', { parent: internalResults, css: { color: '#666', fontSize: '14px' }, text: 'Aucun résultat vidéo (interne)' });
		statusBarRef && statusBarRef.$({ text: 'Aucun résultat vidéo (interne).' });
	} else {
		$('div', { parent: internalResults, css: { fontWeight: '600', marginBottom: '8px' }, text: 'Résultats vidéos (internes) · ' + count });
		items.forEach((it) => {
			const vid = (it.id && (it.id.videoId || it.id)) || '';
			const sn = it.snippet || {};
			const title = sn.title || 'Sans titre';
			const channel = sn.channelTitle || '';
			const thumb = (sn.thumbnails && (sn.thumbnails.medium && sn.thumbnails.medium.url))
				|| (sn.thumbnails && (sn.thumbnails.high && sn.thumbnails.high.url))
				|| (vid ? ('https://img.youtube.com/vi/' + vid + '/hqdefault.jpg') : '');

			const row = $('div', {
				parent: internalResults,
				css: {
					display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', border: '1px solid #eee', borderRadius: '6px',
					cursor: 'pointer', marginBottom: '8px', backgroundColor: '#fafafa'
				},
				onclick: () => {
					if (vid) {
						const embed = 'https://www.youtube.com/embed/' + vid + '?autoplay=1&rel=0&modestbranding=1';
						statusBarRef.$({ text: 'Lecture (embed)…' });
						searchFrameRef.src = embed;
					}
				}
			});
			$('img', { parent: row, attrs: { src: thumb, alt: title }, css: { width: '120px', height: '68px', objectFit: 'cover', borderRadius: '4px', backgroundColor: '#ddd' } });
			const meta = $('div', { parent: row, css: { display: 'flex', flexDirection: 'column' } });
			$('div', { parent: meta, css: { fontSize: '14px', fontWeight: '600' }, text: title });
			$('div', { parent: meta, css: { fontSize: '12px', color: '#666' }, text: channel });
		});
		statusBarRef && statusBarRef.$({ text: 'Résultats vidéos: ' + count });
	}
	internalResults.style.display = 'block';
	try { internalResults.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
}

async function fetchVideoResults(query) {
	try {
		// État de chargement interne
		internalResults.innerHTML = '';
		$('div', { parent: internalResults, css: { color: '#333', fontSize: '14px' }, text: 'Recherche vidéos…' });
		internalResults.style.display = 'block';
		const base = getApiBase();
		const res = await fetch(base + '/api/youtube/search?q=' + encodeURIComponent(query));
		const data = await res.json();
		const items = Array.isArray(data.items) ? data.items : [];
		renderVideoResults(items);
	} catch (e) {
		internalResults.innerHTML = '';
		$('div', { parent: internalResults, css: { color: '#a00', fontSize: '14px' }, text: 'Erreur chargement résultats internes' });
		internalResults.style.display = 'block';
	}
}

function buildGoogleUrl(q, type, date) {
	const params = new URLSearchParams();
	params.set('igu', '1');
	params.set('hl', 'fr');
	params.set('q', q);
	if (type === 'videos') params.set('tbm', 'vid');
	else if (type === 'images') params.set('tbm', 'isch');
	else if (type === 'news') params.set('tbm', 'nws');
	if (type === 'audio') {
		const add = ' (filetype:mp3 OR filetype:wav OR site:soundcloud.com OR site:bandcamp.com)';
		params.set('q', q + add);
	}
	const mapDate = { hour:'h', day:'d', week:'w', month:'m', year:'y' };
	if (date && date !== 'any') params.set('tbs', 'qdr:' + mapDate[date]);
	return 'https://www.google.com/search?' + params.toString();
}

function performSearch() {
	const q = (input.value || '').trim();
	if (!q) { statusBarRef.$({ text: 'Tapez une requête.' }); return; }

	// Si l'utilisateur colle un lien YouTube, ouvrir directement en embed
	const maybeEmbed = parseEmbedFromFreeText(q);
	if (maybeEmbed) {
		statusBarRef.$({ text: 'Lecture YouTube (embed)…' });
		searchFrameRef.src = maybeEmbed;
		return;
	}
	const type = typeSelect.value;
	const date = dateSelect.value;
	// Affichage interne pour vidéos (liste cliquable) + iframe pour lecture
	if (type === 'videos') {
		statusBarRef.$({ text: 'Recherche vidéos (interne)…' });
		fetchVideoResults(q);
		// Charger aussi Google vidéos dans l’iframe en parallèle (référence)
		const url = buildGoogleUrl(q, type, date);
		searchFrameRef.src = url;
	} else {
		clearInternalResults();
		const url = buildGoogleUrl(q, type, date);
		statusBarRef.$({ text: 'Chargement…' });
		searchFrameRef.src = url;
	}
}

searchFrameRef.addEventListener('load', () => {
	statusBarRef.$({ text: 'Page chargée.' });
});

// ====== Auto-embed YouTube: réécrit les URL watch vers /embed/ ======
let iframeUrlWatcher = null;

function parseEmbedFromUrl(href) {
	try {
		if (!href) return null;
		const u = new URL(href);

		// Cas Google redirect /url?q=...
			if (/^www\.google\.[^/]+$/.test(u.hostname) && u.pathname === '/url') {
				const target = u.searchParams.get('q') || u.searchParams.get('url') || '';
			if (target) return parseEmbedFromUrl(target);
		}

		// YouTube domaines
		const host = u.hostname.replace(/^m\./, '');

		// youtu.be/<id>
		if (host === 'youtu.be') {
			const id = u.pathname.replace(/^\//, '').split('/')[0];
			if (id) return 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
		}

		// youtube.com/shorts/<id>
		if (host.endsWith('youtube.com') && u.pathname.startsWith('/shorts/')) {
			const id = u.pathname.split('/')[2];
			if (id) return 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
		}

		// youtube.com/watch?v=<id>
		if (host.endsWith('youtube.com') && u.pathname === '/watch') {
			const id = u.searchParams.get('v');
			const list = u.searchParams.get('list');
			if (id) {
				let embed = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
				if (list) embed += '&list=' + encodeURIComponent(list);
				return embed;
			}
		}

		// Déjà un embed
		if (host.endsWith('youtube.com') && u.pathname.startsWith('/embed/')) {
			return null;
		}
	} catch (_) {}
	return null;
}

function ensureIframeWatcher() {
	if (iframeUrlWatcher) return;
	iframeUrlWatcher = setInterval(() => {
		try {
			const current = searchFrameRef ? (searchFrameRef.src || '') : '';
			const embed = parseEmbedFromUrl(current);
			if (embed && !/\/embed\//.test(current)) {
				statusBarRef && statusBarRef.$({ text: 'Lecture YouTube (embed)…' });
				searchFrameRef.src = embed;
			}
		} catch (_) {}
	}, 500);
}

// Activer le watcher dès l'initialisation
ensureIframeWatcher();

// Détection de lien YouTube collé dans la barre de recherche
function parseEmbedFromFreeText(text) {
	try {
		const t = (text || '').trim();
		if (!t) return null;
		let href = t;
		// Autoriser entrées sans protocole
		if (/^www\./.test(href)) href = 'https://' + href;
		if (/^(youtube\.com|m\.youtube\.com|youtu\.be|www\.youtube\.com)/.test(href)) href = 'https://' + href;
		// Si ce n'est pas une URL, essayer d'extraire une URL dedans
		if (!/^https?:\/\//i.test(href)) {
			const m = t.match(/https?:\/\/[^\s]+/i);
			if (m) href = m[0];
		}
		return parseEmbedFromUrl(href);
	} catch (_) { return null; }
}

async function openEmbedFromClipboard() {
	try {
		if (!navigator.clipboard) {
			statusBarRef && statusBarRef.$({ text: 'Clipboard non disponible' });
			return;
		}
		const clip = (await navigator.clipboard.readText()) || '';
		const embed = parseEmbedFromFreeText(clip);
		if (embed) {
			statusBarRef && statusBarRef.$({ text: 'Lecture YouTube (embed)…' });
			searchFrameRef.src = embed;
		} else {
			statusBarRef && statusBarRef.$({ text: 'Aucun lien YouTube détecté dans le presse-papiers' });
		}
	} catch (e) {
		statusBarRef && statusBarRef.$({ text: 'Erreur lecture presse-papiers' });
	}
}

