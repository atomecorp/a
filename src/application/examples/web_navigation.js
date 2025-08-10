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
	onText: '← Retour Google',
	offText: '← Retour Google',
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
	const type = typeSelect.value;
	const date = dateSelect.value;
	const url = buildGoogleUrl(q, type, date);
	statusBarRef.$({ text: 'Chargement…' });
	searchFrameRef.src = url;
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
			const target = u.searchParams.get('q') || '';
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

