// Swift server helper UI (dynamic port + tree)
// Bouton: interroge ATOME_LOCAL_HTTP_PORT / __ATOME_LOCAL_HTTP_PORT__
// Panel draggable: affiche le port puis le tree complet servi par /tree

// --- Port helpers ---
function _getServerPortSync() {
	return (
		window.ATOME_LOCAL_HTTP_PORT ||
		window.__ATOME_LOCAL_HTTP_PORT__ ||
		null
	);
}

function _waitServerPort(timeoutMs = 10000, intervalMs = 120) {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		(function poll(){
			const p = _getServerPortSync();
			if (p) return resolve(p);
			if (Date.now() - start > timeoutMs) return reject(new Error('Port non injecté (timeout)'));
			setTimeout(poll, intervalMs);
		})();
	});
}

async function _fetchTree(port){
	const url = `http://127.0.0.1:${port}/tree`;
	const r = await fetch(url, { cache:'no-store' });
	if(!r.ok) throw new Error('HTTP '+r.status);
	return r.json().catch(()=>({error:'JSON invalide'}));
}

function _formatTree(data){
	// Tente de générer une vue hiérarchique simple.
	const lines = [];
	function rec(node, indent){
		if (node == null) { lines.push(indent+'<null>'); return; }
		if (Array.isArray(node)) {
			node.forEach(n=> rec(n, indent));
			return;
		}
		if (typeof node !== 'object') { lines.push(indent+String(node)); return; }
		// Heuristiques: name / children / isDirectory
		if ('name' in node && (node.isDirectory || node.children)) {
			lines.push(indent + (node.isDirectory? '📁 ':'📄 ') + node.name);
			if (node.children) rec(node.children, indent+'  ');
			return;
		}
		// Objet générique: afficher clés
		const keys = Object.keys(node);
		if (keys.length === 0){ lines.push(indent+'{}'); return; }
		keys.forEach(k=>{
			const v = node[k];
			if (Array.isArray(v) || (v && typeof v === 'object')){
				lines.push(indent + k + ':');
				rec(v, indent+'  ');
			} else {
				lines.push(indent + k + ': ' + String(v));
			}
		});
	}
	// Si structure { tree: ... }
	if (data && typeof data === 'object' && ('tree' in data)) {
		rec(data.tree, '');
	} else {
		rec(data, '');
	}
	return lines.join('\n');
}

// --- Panel creation ---
function _ensurePanel(){
	if (document.querySelector('#swift_srv_panel')) return;
	$('div', {
		id: 'swift_srv_panel',
		parent: '#view',
		css: {
			position: 'absolute',
			top: '120px',
			left: '40px',
			width: '380px',
			height: '300px',
			backgroundColor: '#111',
			color: '#ddd',
			fontFamily: 'monospace',
			fontSize: '11px',
			border: '1px solid #333',
			borderRadius: '6px',
			boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
			zIndex: '9999'
		}
	});
	$('div', {
		id: 'swift_srv_header',
		parent: '#swift_srv_panel',
		css: {
			backgroundColor: '#222',
			padding: '4px 8px',
			cursor: 'move',
			userSelect: 'none',
			fontWeight: 'bold',
			borderBottom: '1px solid #333',
			fontSize: '12px'
		},
		text: 'Swift Server'
	});
	$('div', {
		id: 'swift_srv_body',
		parent: '#swift_srv_panel',
		css: {
			flex: '1',
			padding: '6px 8px',
			overflow: 'auto',
			whiteSpace: 'pre',
			lineHeight: '14px'
		},
		text: 'En attente du port...'
	});
	_makePanelDraggable('#swift_srv_panel', '#swift_srv_header');
}

async function _fillPanel(){
	_ensurePanel();
	const body = document.querySelector('#swift_srv_body');
	if(!body) return;
	body.textContent = 'Recherche du port...';
	let port;
	try {
		port = await _waitServerPort();
	} catch(e){
		body.textContent = 'Port introuvable: '+e.message;
		return;
	}
	body.textContent = 'Port: '+port+'\nChargement du tree...';
	try {
		const data = await _fetchTree(port);
		const treeStr = _formatTree(data) || '(vide)';
		body.textContent = 'Port: '+port+'\n\n'+treeStr;
	} catch(err){
		body.textContent = 'Port: '+port+'\nErreur tree: '+err.message;
	}
}

// --- Delete panel ---
function _deletePanel(){
	const p = document.querySelector('#swift_srv_panel');
	if(p) p.remove();
}

// --- Draggable ---
function _makePanelDraggable(panelSel, handleSel){
	const panel = typeof panelSel==='string'? document.querySelector(panelSel): panelSel;
	const handle = typeof handleSel==='string'? document.querySelector(handleSel): handleSel;
	if(!panel || !handle) return;
	let drag=false,sx=0,sy=0,ox=0,oy=0;
	handle.style.touchAction='none';
	handle.addEventListener('pointerdown', e=>{
		if(e.button!==0) return;
		drag=true; sx=e.clientX; sy=e.clientY; const r=panel.getBoundingClientRect(); ox=r.left; oy=r.top; handle.setPointerCapture(e.pointerId);
	});
	handle.addEventListener('pointermove', e=>{
		if(!drag) return; panel.style.left=(ox + (e.clientX - sx))+'px'; panel.style.top=(oy + (e.clientY - sy))+'px';
	});
	['pointerup','pointercancel'].forEach(ev=> handle.addEventListener(ev, e=>{ drag=false; try{ handle.releasePointerCapture(e.pointerId);}catch(_){}; }));
}

// --- Button to open panel ---
if(!document.querySelector('#swift_srv_btn')){
	Button({
		id: 'swift_srv_btn',
		parent:'#view',
		onText:'SwiftSrv',
		offText:'SwiftSrv',
		onAction: _fillPanel,
		offAction: _deletePanel,
		css:{
			position:'absolute',
			top:'80px',
			left:'40px',
			width:'88px',
			height:'30px',
			backgroundColor:'#444',
			color:'#fff',
			borderRadius:'6px',
			border:'2px solid rgba(255,255,255,0.25)',
			cursor:'pointer',
			fontSize:'12px'
		}
	});
	console.log('[swift_server.js] Bouton SwiftSrv ajouté');
}

// Export minimal
window.SwiftServerPanel = { open: _fillPanel };
