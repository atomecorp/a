// AUv3 File Browser (simplifié)
// Ouvre une fenêtre qui affiche l'arborescence complète (Projects / Exports / Recordings / Templates) de façon récursive.
// Fonctions retirées: sélection de dossier, import multiple, ouverture texte, copie de chemins.

// Vérif bridge
function hasBridge(){
	return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem);
}

// API helpers
function listFolder(folder){
	return new Promise((resolve,reject)=>{
		if(!hasBridge()) return reject('bridge absent');
		window.fileSystemCallback = function(res){
			if(res.success){ resolve(res.data.files||[]); } else { reject(res.error); }
		};
		window.webkit.messageHandlers.fileSystem.postMessage({action:'listFiles', folder});
	});
}

// === Construction récursive du tree ===
async function buildFullTree(){
	const roots = ['./'];
	const lines = [];
	for(const root of roots){
		try {
			await traverse(root, root, 0, lines);
		} catch(e){
			lines.push(root+': <erreur '+e+'>');
		}
	}
	return lines.join('\n');
}

async function traverse(displayName, folderPath, depth, lines, maxDepth=20){
	const indent = '  '.repeat(depth);
	lines.push(indent + displayName + '/');
	if(depth >= maxDepth) { lines.push(indent + '  ... (max depth)'); return; }
	let entries = [];
	try { entries = await listFolder(folderPath); } catch(e){ lines.push(indent+'  <error '+e+'>'); return; }
	entries.sort((a,b)=> a.name.localeCompare(b.name));
	for(const e of entries){
		if(e.isDirectory){
			await traverse(e.name, folderPath + '/' + e.name, depth+1, lines, maxDepth);
		} else {
			lines.push(indent + '  ' + e.name);
		}
	}
}

// UI creation helpers (squirrel syntax requirement)
function createBrowserUI(){
	const overlay = $('div', { id:'auv3_fb_overlay', css:{ position:'fixed', left:'0', top:'0', width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.45)', zIndex:'9998' }});
	const panel = $('div', { id:'auv3_fb_panel', parent:'#auv3_fb_overlay', css:{ position:'absolute', width:'70%', height:'70%', left:'15%', top:'15%', backgroundColor:'#121417', border:'1px solid #2c343d', borderRadius:'10px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px', padding:'10px', overflow:'hidden', display:'flex', flexDirection:'column' }});
	$('div', { parent:'#auv3_fb_panel', css:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' }, html:'<span style="font-weight:bold">AUv3 File Tree</span>'});
	Button({ onText:'X', offText:'X', parent:'#auv3_fb_panel', onAction: removeBrowser, offAction: removeBrowser, css:{ position:'absolute', right:'8px', top:'6px', width:'28px', height:'24px', backgroundColor:'#b33', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }});
	Button({ onText:'Refresh', offText:'Refresh', parent:'#auv3_fb_panel', onAction: refreshTree, offAction: refreshTree, css:{ position:'absolute', right:'46px', top:'6px', width:'70px', height:'24px', backgroundColor:'#2d6cdf', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }});
	const treeWrap = $('div', { id:'auv3_fb_tree_wrap', parent:'#auv3_fb_panel', css:{ flex:'1', overflow:'auto', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', backgroundColor:'#0f1215', whiteSpace:'pre', fontFamily:'monospace', fontSize:'12px', lineHeight:'1.3' }, text:'Loading tree...' });
	refreshTree();
}

function removeBrowser(){
	const ov = document.querySelector('#auv3_fb_overlay');
	if(ov) ov.remove();
}

async function refreshTree(){
	const wrap = document.querySelector('#auv3_fb_tree_wrap');
	if(!wrap) return;
	wrap.textContent = 'Building tree...';
	try{
		const treeStr = await buildFullTree();
		wrap.textContent = treeStr || '(vide)';
	}catch(e){
		wrap.textContent = 'Erreur: '+e;
	}
}

// Fonctions retirées (text, import, sélection) => code supprimé pour simplification totale.

// Bouton principal pour ouvrir le browser
const auv3FileBrowserBtn = Button({
	onText:'Browse files',
	offText:'Browse Files',
	parent:'#view',
	onAction: ()=>{ if(!document.querySelector('#auv3_fb_overlay')) createBrowserUI(); },
	offAction: ()=>{ if(!document.querySelector('#auv3_fb_overlay')) createBrowserUI(); },
	css:{
		width:'90px',height:'30px',left:'360px',top:'120px',borderRadius:'6px',backgroundColor:'#444',color:'#fff',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'13px'
	}
});

// === Server tree browser ===
function createServerBrowserUI(){
	const existing = document.querySelector('#auv3_server_overlay');
	if(existing) return; // already open
	const overlay = $('div', { id:'auv3_server_overlay', css:{ position:'fixed', left:'0', top:'0', width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.45)', zIndex:'9998' }});
	const panel = $('div', { id:'auv3_server_panel', parent:'#auv3_server_overlay', css:{ position:'absolute', width:'70%', height:'70%', left:'15%', top:'15%', backgroundColor:'#121417', border:'1px solid #2c343d', borderRadius:'10px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px', padding:'10px', overflow:'hidden', display:'flex', flexDirection:'column' }});
	$('div', { parent:'#auv3_server_panel', css:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' }, html:'<span style="font-weight:bold">HTTP Server /tree</span>'});
	Button({ onText:'X', offText:'X', parent:'#auv3_server_panel', onAction: ()=>removeServerBrowser(), offAction: ()=>removeServerBrowser(), css:{ position:'absolute', right:'8px', top:'6px', width:'28px', height:'24px', backgroundColor:'#b33', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }});
	Button({ onText:'Refresh', offText:'Refresh', parent:'#auv3_server_panel', onAction: refreshServerTree, offAction: refreshServerTree, css:{ position:'absolute', right:'46px', top:'6px', width:'70px', height:'24px', backgroundColor:'#2d6cdf', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }});
	const treeWrap = $('div', { id:'auv3_server_tree_wrap', parent:'#auv3_server_panel', css:{ flex:'1', overflow:'auto', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', backgroundColor:'#0f1215', whiteSpace:'pre', fontFamily:'monospace', fontSize:'12px', lineHeight:'1.3' }, text:'Loading server tree...' });
	refreshServerTree();
}

function removeServerBrowser(){
	const ov = document.querySelector('#auv3_server_overlay');
	if(ov) ov.remove();
}

function formatServerNode(node, depth, lines){
	const indent = '  '.repeat(depth);
	if(!node) { lines.push(indent+'<empty>'); return; }
	lines.push(indent + node.name + (node.isDirectory ? '/' : ''));
	if(node.children){
		for(const c of node.children){
			formatServerNode(c, depth+1, lines);
		}
	}
}

async function refreshServerTree(){
	const wrap = document.querySelector('#auv3_server_tree_wrap');
	if(!wrap) return;
	wrap.textContent = 'Fetching /tree...';
	try {
		const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
		if(!port){ wrap.textContent = 'No local HTTP port available'; return; }
		const url = 'http://127.0.0.1:'+port+'/tree';
		const res = await fetch(url);
		if(!res.ok){ wrap.textContent = 'Error HTTP '+res.status; return; }
		const json = await res.json();
		const lines = [];
		lines.push('root: '+json.root);
		formatServerNode(json.tree, 0, lines);
		wrap.textContent = lines.join('\n');
	} catch(e){
		wrap.textContent = 'Erreur: '+e;
	}
}

const auv3ServerBrowserBtn = Button({
	onText:'Browse server',
	offText:'Browse Server',
	parent:'#view',
	onAction: ()=>{ if(!document.querySelector('#auv3_server_overlay')) createServerBrowserUI(); },
	offAction: ()=>{ if(!document.querySelector('#auv3_server_overlay')) createServerBrowserUI(); },
	css:{
		width:'110px',height:'30px',left:'460px',top:'120px',borderRadius:'6px',backgroundColor:'#555',color:'#fff',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'13px'
	}
});

	console.log('[auv3file_browser] bouton Files ajouté (version simplifiée tree).');
	console.log('[auv3file_browser] bouton Server ajouté (/tree).');
