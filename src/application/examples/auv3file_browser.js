// AUv3 File Browser Example
// Ajoute un bouton qui ouvre une fenêtre listant les fichiers locaux (Projects / Exports / Recordings / Templates)
// Permet: rafraîchir, ouvrir (charger contenu texte/json) ou copier (download) multi-fichiers, et importer des fichiers (multi) depuis le Document Picker.

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

function importMultipleInto(folder){
	return new Promise((resolve,reject)=>{
		if(!hasBridge()) return reject('bridge absent');
		window.fileSystemCallback = function(res){
			if(res.success){ resolve(res.data.paths); } else { reject(res.error); }
		};
		window.webkit.messageHandlers.fileSystem.postMessage({
			action:'copyMultipleToIOSLocal',
			requestedDestPath: folder.endsWith('/')?folder:folder+'/',
			fileTypes:['m4a','mp3','wav','atome','json']
		});
	});
}

function loadTextFile(relPath){
	return new Promise((resolve,reject)=>{
		if(!hasBridge()) return reject('bridge absent');
		window.fileSystemCallback = function(res){
			if(res.success){ resolve(res.data.content); } else { reject(res.error); }
		};
		window.webkit.messageHandlers.fileSystem.postMessage({action:'loadFile', path: relPath});
	});
}

// UI creation helpers (squirrel syntax requirement)
function createBrowserUI(){
	const overlay = $('div', { id:'auv3_fb_overlay', css:{ position:'fixed', left:'0', top:'0', width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.45)', zIndex:'9998' }});
	const panel = $('div', { id:'auv3_fb_panel', parent:'#auv3_fb_overlay', css:{ position:'absolute', width:'80%', height:'70%', left:'10%', top:'15%', backgroundColor:'#121417', border:'1px solid #2c343d', borderRadius:'10px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px', padding:'10px', overflow:'hidden', display:'flex', flexDirection:'column' }});
	const header = $('div', { parent:'#auv3_fb_panel', css:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }, text:'AUv3 File Browser'});
	const closeBtn = Button({ onText:'X', offText:'X', parent:'#auv3_fb_panel', onAction: ()=>{ removeBrowser(); }, offAction:()=>{ removeBrowser(); }, css:{ position:'absolute', right:'8px', top:'6px', width:'28px', height:'24px', backgroundColor:'#b33', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }});
	const toolbar = $('div', { id:'auv3_fb_toolbar', parent:'#auv3_fb_panel', css:{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'8px' }});
	const foldersSelect = $('select', { id:'auv3_fb_folder', parent:'#auv3_fb_toolbar', css:{ backgroundColor:'#1d2329', color:'#fff', border:'1px solid #2d3a45', padding:'4px', borderRadius:'4px' }});
	['Projects','Exports','Recordings','Templates'].forEach(f=> $('option',{ parent:'#auv3_fb_folder', text:f, value:f }));
	const refreshBtn = Button({ onText:'Refresh', offText:'Refresh', parent:'#auv3_fb_toolbar', onAction: refreshList, offAction:refreshList, css:{ backgroundColor:'#2d6cdf', color:'#fff', width:'90px', height:'28px', borderRadius:'4px', fontSize:'12px' }});
	const importBtn = Button({ onText:'Import+', offText:'Import+', parent:'#auv3_fb_toolbar', onAction: ()=>doImport(), offAction:()=>doImport(), css:{ backgroundColor:'#28a745', color:'#fff', width:'80px', height:'28px', borderRadius:'4px', fontSize:'12px' }});
	const openBtn = Button({ onText:'OpenTxt', offText:'OpenTxt', parent:'#auv3_fb_toolbar', onAction: openSelectedText, offAction:openSelectedText, css:{ backgroundColor:'#7952b3', color:'#fff', width:'90px', height:'28px', borderRadius:'4px', fontSize:'12px' }});
	const copyBtn = Button({ onText:'CopyPaths', offText:'CopyPaths', parent:'#auv3_fb_toolbar', onAction: copySelectedPaths, offAction:copySelectedPaths, css:{ backgroundColor:'#17a2b8', color:'#fff', width:'94px', height:'28px', borderRadius:'4px', fontSize:'12px' }});
	const listWrap = $('div', { id:'auv3_fb_list_wrap', parent:'#auv3_fb_panel', css:{ flex:'1', overflow:'auto', border:'1px solid #2c343d', borderRadius:'6px', padding:'4px', backgroundColor:'#0f1215' }});
	const list = $('div', { id:'auv3_fb_list', parent:'#auv3_fb_list_wrap', css:{ display:'flex', flexDirection:'column', gap:'4px' }});
	const preview = $('textarea', { id:'auv3_fb_preview', parent:'#auv3_fb_panel', css:{ height:'120px', marginTop:'6px', width:'100%', backgroundColor:'#101317', color:'#d7d7d7', border:'1px solid #2c343d', borderRadius:'6px', padding:'6px', fontSize:'11px', resize:'vertical' }});
	refreshList();
}

function removeBrowser(){
	const ov = document.querySelector('#auv3_fb_overlay');
	if(ov) ov.remove();
}

async function refreshList(){
	const folder = document.querySelector('#auv3_fb_folder')?.value || 'Projects';
	const list = document.querySelector('#auv3_fb_list');
	if(!list) return;
	list.innerHTML = 'Loading...';
	try{
		const files = await listFolder(folder);
		list.innerHTML = '';
		if(!files.length){ list.innerHTML = '<i>Empty</i>'; return; }
		files.sort((a,b)=> a.name.localeCompare(b.name));
		files.forEach(f=>{
			const row = $('div', { parent:'#auv3_fb_list', css:{ display:'flex', alignItems:'center', gap:'6px', padding:'4px', backgroundColor:'#182026', border:'1px solid #25303a', borderRadius:'4px', cursor:'pointer' }});
			const chk = $('input', { parent: row, type:'checkbox', value:f.name });
			$('span', { parent: row, text: f.isDirectory? '📁 '+f.name : '📄 '+f.name, css:{ flex:'1', userSelect:'none', fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis' }});
			$('span', { parent: row, text: f.isDirectory? '-' : humanSize(f.size), css:{ fontSize:'11px', opacity:'0.65' }});
			row.addEventListener('dblclick', ()=>{ if(!f.isDirectory && isTextual(f.name)) openSingleText(folder + '/' + f.name); });
		});
	}catch(e){ list.innerHTML = '<span style="color:#e55">Erreur: '+e+'</span>'; }
}

function getSelectedPaths(){
	const folder = document.querySelector('#auv3_fb_folder')?.value || 'Projects';
	return Array.from(document.querySelectorAll('#auv3_fb_list input[type=checkbox]:checked')).map(i=> folder + '/' + i.value);
}

function copySelectedPaths(){
	const paths = getSelectedPaths();
	if(!paths.length){ console.warn('rien de sélectionné'); return; }
	navigator.clipboard && navigator.clipboard.writeText(paths.join('\n')).then(()=> console.log('copié', paths));
}

async function openSelectedText(){
	const sel = getSelectedPaths().filter(p=> isTextual(p));
	if(!sel.length){ console.warn('aucun fichier texte sélectionné'); return; }
	const preview = document.querySelector('#auv3_fb_preview');
	preview.value = 'Loading...';
	try{
		const contents = [];
		for(const p of sel){
			const c = await loadTextFile(p);
			contents.push('=== '+p+' ===\n'+c);
		}
		preview.value = contents.join('\n\n');
	}catch(e){ preview.value = 'Erreur: '+e; }
}

function openSingleText(path){
	loadTextFile(path).then(c=>{ const pv = document.querySelector('#auv3_fb_preview'); pv.value = '=== '+path+' ===\n'+c; }).catch(err=> console.warn(err));
}

async function doImport(){
	const folder = document.querySelector('#auv3_fb_folder')?.value || 'Projects';
	try{
		const paths = await importMultipleInto(folder+'/');
		console.log('importés:', paths);
		refreshList();
	}catch(e){ console.warn('import multiple échec', e); }
}

function isTextual(name){
	return /(\.json|\.txt|\.atome)$/i.test(name);
}
function humanSize(bytes){
	if(bytes < 1024) return bytes+' B';
	if(bytes < 1024*1024) return (bytes/1024).toFixed(1)+' KB';
	return (bytes/1024/1024).toFixed(1)+' MB';
}

// Bouton principal pour ouvrir le browser
const auv3FileBrowserBtn = Button({
	onText:'Browse Auv3 Files',
	offText:'Browse Auv3 Files',
	parent:'#view',
	onAction: ()=>{ if(!document.querySelector('#auv3_fb_overlay')) createBrowserUI(); },
	offAction: ()=>{ if(!document.querySelector('#auv3_fb_overlay')) createBrowserUI(); },
	css:{
		width:'90px',height:'30px',left:'360px',top:'120px',borderRadius:'6px',backgroundColor:'#444',color:'#fff',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'13px'
	}
});

console.log('[auv3file_browser] bouton Files ajouté');
