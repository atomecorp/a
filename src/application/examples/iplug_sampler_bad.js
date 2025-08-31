// Console redefinition (robust, forwards all args to Swift and original console)
	window.console.log = (function(oldLog) {
	  return function() {
		try { oldLog.apply(console, arguments); } catch(_) {}
		try {
		  var parts = Array.prototype.slice.call(arguments).map(function(x){
			if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch(_) { return String(x); } }
			return String(x);
		  });
		  window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console && window.webkit.messageHandlers.console.postMessage("LOG: " + parts.join(' '));
		} catch(_) {}
	  }
	})(window.console.log);

	window.console.error = (function(oldErr) {
	  return function() {
		try { oldErr.apply(console, arguments); } catch(_) {}
		try {
		  var parts = Array.prototype.slice.call(arguments).map(function(x){
			if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch(_) { return String(x); } }
			return String(x);
		  });
		  window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console && window.webkit.messageHandlers.console.postMessage("ERROR: " + parts.join(' '));
		} catch(_) {}
	  }
	})(window.console.error);



// (boot diagnostics removed)


function ios_file_chooser(multiple) {
  try {
	// Only proceed if the iOS file bridge is available
	if (!window.AtomeFileSystem) { console.warn('AtomeFileSystem unavailable'); return; }

	// Accept boolean true, string 'true', number 1, or an object with { multiple: true }
	const allowMulti = (multiple === true) || (multiple === 'true') || (multiple === 1) || (!!multiple && multiple.multiple === true);
	let dest = './';
	try { const st = window.__auv3_browser_state; if (st && st.path) dest = st.path; } catch(_) {}
	try { if (typeof normalizePath === 'function') dest = normalizePath(dest); } catch(_) {}
	const types = ['m4a', 'mp3', 'wav', 'aif', 'aiff', 'caf', 'ogg', 'flac'];

	const toastId = null;

  const onDone = (res) => {
	  if (res && res.success) {
  try { console.log('[Import] success', JSON.stringify(res)); } catch(_) {}
  // Extract imported paths for highlighting
  let importedPaths = [];
  try {
    if (res.data && Array.isArray(res.data.paths)) importedPaths = res.data.paths;
    else if (res.data && res.data.path) importedPaths = [res.data.path];
  } catch(_) {}
	  // no toast
  try { if (typeof listRecordings === 'function') listRecordings(); } catch(_){ }
  // If the browser panel is currently visible, refresh it, otherwise do nothing
  try {
	const st = window.__auv3_browser_state;
	if (st && st.target) {
	  const host = document.querySelector(st.target);
	  if (host && host.querySelector('#auv3-file-list')) {
		navigate_auv3(st.path || '.', st.target, st.opts);
		// After a short delay, scroll to and highlight the first imported file
		if (importedPaths && importedPaths.length) {
		  const first = importedPaths[0];
		  const id = 'auv3-item-' + String(first).replace(/[^\w\-]/g, '_');
		  setTimeout(()=>{
			try{
			  const el = document.getElementById(id);
			  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			  if (el && el.style) {
				const prev = el.style.backgroundColor; el.style.backgroundColor = 'rgba(80,160,255,0.25)';
				setTimeout(()=>{ try{ el.style.backgroundColor = prev || ''; }catch(_){ } }, 1200);
			  }
			} catch(_){}
		  }, 350);
		}
	  }
	}
  } catch(_){ }
	  } else {
		console.warn('Import failed', res && res.error);
		// Fallback: if we filtered by extensions, retry once WITHOUT filter using copy APIs into current folder
		try {
		  if (Array.isArray(types) && types.length) {
			console.log('[Import] retry without type filter into', dest);
			if (allowMulti && typeof window.AtomeFileSystem.copy_multiple_to_ios_local === 'function') {
			  window.AtomeFileSystem.copy_multiple_to_ios_local(dest, [], onDone);
			  return;
			}
			if (typeof window.AtomeFileSystem.copy_to_ios_local === 'function') {
			  window.AtomeFileSystem.copy_to_ios_local(dest, [], onDone);
			  return;
			}
			// Last resort: open a generic picker (no saving), just to unblock the user
			if (typeof window.AtomeFileSystem.loadFilesWithDocumentPicker === 'function') {
			  window.AtomeFileSystem.loadFilesWithDocumentPicker([], onDone);
			  return;
			}
		  }
		} catch(_) {}
	  }
	};

	if (allowMulti && typeof window.AtomeFileSystem.copy_multiple_to_ios_local === 'function') {
	  // iOS multiple selection (DocumentPicker with allowsMultipleSelection)
	  window.AtomeFileSystem.copy_multiple_to_ios_local(dest, types, onDone);
	} else if (allowMulti && typeof window.AtomeFileSystem.loadFilesWithDocumentPicker === 'function') {
	  // Fallback multi via generic picker API
	  window.AtomeFileSystem.loadFilesWithDocumentPicker(types, onDone);
	} else if (typeof window.AtomeFileSystem.copy_to_ios_local === 'function') {
	  // Single file selection
	  window.AtomeFileSystem.copy_to_ios_local(dest, types, onDone);
	} else if (typeof window.AtomeFileSystem.loadFilesWithDocumentPicker === 'function') {
	  // Last resort single via generic picker
	  window.AtomeFileSystem.loadFilesWithDocumentPicker(types, onDone);
	}
  } catch (e) {
	console.warn('import error', e);
  }
}

// Simple state for the AUv3 file browser (current path, last opts/target)
window.__auv3_browser_state = { path: '.', target: '#view', opts: null, visible: false };

function path_join(base, name){
  if (!base || base === '.' || base === './') return name;
  if (!name || name === '.' || name === './') return base;
  return (base.replace(/\/$/, '')) + '/' + (name.replace(/^\//, ''));
}
function parent_of(path){
  if (!path || path === '.' || path === './' || path === '/') return '.';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  const p = parts.length ? parts.join('/') : '.';
  // Normalize appgroup scheme root
  return (p === 'appgroup:') ? 'appgroup:/' : p;
}
// Normalize special scheme and slashes
function normalizePath(p){
  try {
	if (!p) return '.';
	// Ensure appgroup root has trailing slash
	if (p === 'appgroup:') return 'appgroup:/';
	// Collapse duplicate slashes after the scheme
	if (p.startsWith('appgroup:')) {
	  const rest = p.slice('appgroup:'.length);
	  const norm = rest.replace(/\/+/g, '/');
	  return 'appgroup:' + (norm.startsWith('/') ? norm : '/' + norm);
	}
	return p;
  } catch(_) { return p || '.'; }
}

async function navigate_auv3(path='.', target='#view', opts=null){
  const np = normalizePath(path);
  window.__auv3_browser_state = { path: np, target, opts, visible: true };
  const listing = await get_auv3_files(np);
	// (listing debug removed)
  display_files(target, listing, opts);
}

// Open the AUv3 browser with a sensible default location
async function ubrowse(target = '#view'){
  try{
  // Always render on body for maximum visibility in AUv3 host
  let tgt = 'body';
	// Persist the body target immediately for subsequent actions (Up/Refresh/etc.)
  try { window.__auv3_browser_state = { path: 'Recordings', target: 'body', opts: {}, visible: true }; } catch(_) {}
	// Prefer mirrored iCloud content from App Group first, then local
	const candidates = [
	  'appgroup:/Samples',
	  'appgroup:/iCloud',
	  'appgroup:/Documents/Samples',
	  'appgroup:/Documents',
	  'Recordings',
	  '.'
	];
	let startPath = '.';
	for (let i=0;i<candidates.length;i++){
	  const cand = candidates[i];
	  try {
		const probe = await get_auv3_files(cand);
		const hasAny = (probe && ((probe.folders && probe.folders.length) || (probe.files && probe.files.length)));
		if (hasAny) { startPath = cand; break; }
	  } catch(_){}
	}
  await navigate_auv3(startPath, tgt, (window.__auv3_browser_state && window.__auv3_browser_state.opts) || {});
  } catch(e){ console.warn('ubrowse error', e); }
}

// (toggle_auv3_browser removed)


// --- File type utilities and decision routing ---
function detect_file_type(fileName = ''){
  const ext = String(fileName).split('.').pop().toLowerCase();
  if(!ext || ext === fileName.toLowerCase()) return 'unknown';
  if(['m4a','mp3','wav','aif','aiff','caf','ogg','flac'].includes(ext)) return 'audio';
  if(['atome','atomeproj'].includes(ext)) return 'project';
  if(['txt','json','lrc','lrx','md','csv'].includes(ext)) return 'text';
  if(['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  return 'unknown';
}
function strip_ext(fileName=''){ const i=fileName.lastIndexOf('.'); return i>0? fileName.slice(0,i) : fileName; }

// Main router called when a file is clicked in our custom file browser
// Signature keeps type as first param as requested; extra args provide context
async function file_type_decision(type, fileEntry, fullPath){
  try{
	// Ensure we have some context objects
	const audio = (window.Squirrel && Squirrel.av && Squirrel.av.audio) ? Squirrel.av.audio : null;
	const AU = window.AUv3API || null;
	const parent = (typeof parent_of === 'function') ? parent_of(fullPath||'') : '.';

	switch(type){
	  case 'audio': {
	if(!audio){ console.warn('Audio backend unavailable'); return; }
		// Optionally ensure the file is local if the bridge provides it (no-op otherwise)
		try{
		  if (window.AtomeFileSystem && typeof window.AtomeFileSystem.ensureLocal === 'function') {
	  try { console.log('[JS] ensureLocal before preview path=', fullPath||fileEntry?.name); } catch(_){}
			await new Promise((resolve)=>{
			  try { window.AtomeFileSystem.ensureLocal(fullPath||fileEntry?.name, ()=>resolve()); } catch(_){ resolve(); }
			});
		  }
		}catch(_){ }
		const id = 'file:'+ (fullPath||fileEntry?.name||Math.random().toString(36).slice(2));
		audio.create_clip && audio.create_clip({ id, path_or_bookmark: fullPath||fileEntry?.name, mode: 'preload' });
		audio.play && audio.play({ clip_id:id, when:{type:'now'}, start:0, end:'clip_end', loop:{mode:'off'} });
		break;
	  }
	  case 'project': {
  if(!AU || typeof AU.auv3_file_loader !== 'function'){ console.warn('Project loading unavailable'); return; }
		const base = strip_ext(fileEntry?.name||'');
  try { await AU.auv3_file_loader(parent || 'Projects', base); } catch(e){ console.warn('Project load failed', e); }
		break;
	  }
	  case 'text': {
		// Optional: preview or process text later; for now log selection
  console.log('Text selected:', fullPath || (fileEntry && fileEntry.name));
		break;
	  }
	  case 'image': {
  console.log('Image selected:', fullPath || (fileEntry && fileEntry.name));
		break;
	  }
	  default: {
  console.log('File selected (unknown type):', fullPath || (fileEntry && fileEntry.name));
	  }
	}
  }catch(e){ console.warn('file_type_decision error', e); }
}
// expose globally for external use
window.file_type_decision = window.file_type_decision || file_type_decision;

// Returns an object { path, folders:[{name,size,modified}], files:[{name,size,modified}] }
async function get_auv3_files(path = '.') {
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.listFiles !== 'function') {
	console.warn('AtomeFileSystem.listFiles unavailable');
	return { path, folders: [], files: [] };
  }
  const normalize = (arr) => {
	const folders = [];
	const files = [];
	(arr || []).forEach((it) => {
	  const name = it && (it.name || it.fileName || it.path || '');
	  const isDir = !!(it && (it.isDirectory || it.directory));
	  const size = (it && it.size) || 0;
	  const modified = (it && it.modified) || 0;
  const isCloud = !!(it && (it.isCloud || it.cloud || it.ubiq));
  const downloadingStatus = (it && (it.downloadingStatus || it.status)) || '';
  const entry = { name, size, modified, isDirectory: isDir, isCloud, downloadingStatus };
	  if (isDir) folders.push(entry); else files.push(entry);
	});
	return { folders, files };
  };

  // Always use callback style to avoid double invocations on the Swift bridge
  return new Promise((resolve) => {
	try {
	  window.AtomeFileSystem.listFiles(path, (res) => {
		const ok = res && (res.success === undefined ? true : !!res.success);
		const items = ok ? (res.files || res.items || (res.data && res.data.files) || []) : [];
		const { folders, files } = normalize(items);
		resolve({ path, folders, files });
	  });
	} catch (e) {
	  console.warn('listFiles error', e); resolve({ path, folders: [], files: [] });
	}
  });
}

// --- Context menu helpers and delete action reuse ---
function close_file_context_menu(){
  try{
	const menu = document.getElementById('auv3-file-menu');
	if (menu) menu.remove();
	if (window.__file_menu_doc_close) {
	  document.removeEventListener('mousedown', window.__file_menu_doc_close, true);
	  document.removeEventListener('touchstart', window.__file_menu_doc_close, true);
	  window.__file_menu_doc_close = null;
	}
  }catch(_){ }
}

function request_delete_file(fullPath, li, listing){
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.deleteFile !== 'function') {
	console.warn('AtomeFileSystem.deleteFile unavailable');
	return;
  }
  try {
	window.AtomeFileSystem.deleteFile(fullPath, (res)=>{
	  if (res && (res.success === undefined || res.success === true)) {
		try { navigate_auv3(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }
		catch(_){ try{ li && li.remove && li.remove(); }catch(__){} }
	  } else {
		console.warn('Delete failed', res && res.error);
	  }
	});
  } catch(e){ console.warn('deleteFile error', e); }
}

function show_file_context_menu(anchorEl, fileItem, fullPath, listing){
  try{
	close_file_context_menu();
	const rect = anchorEl.getBoundingClientRect();
	const left = Math.min(window.innerWidth - 160, Math.max(8, rect.left));
	const top = Math.min(window.innerHeight - 60, rect.bottom + 6);
	const menu = $('div', {
	  id: 'auv3-file-menu',
	  parent: document.body,
	  css: {
		position: 'fixed',
		left: left + 'px',
		top: top + 'px',
		zIndex: '9999',
		backgroundColor: '#1b1f27',
		color: '#eee',
		border: '1px solid #2c343d',
		borderRadius: '8px',
		padding: '6px',
		boxShadow: '0 6px 18px rgba(0,0,0,.6)'
	  }
	});

	// Title
  $('div', { parent: menu, text: fileItem && fileItem.name ? fileItem.name : 'File', css: { fontSize: '11px', color: '#9db2cc', marginBottom: '6px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });

	// Delete action
	Button({
	  id: 'auv3-menu-delete',
	  onText: 'Delete',
	  offText: 'Delete',
	  onAction: ()=>{ request_delete_file(fullPath, anchorEl, listing); close_file_context_menu(); },
	  offAction: ()=>{ request_delete_file(fullPath, anchorEl, listing); close_file_context_menu(); },
	  parent: menu,
	  css: {
		width: '96px',
		height: '24px',
		color: '#fff',
		backgroundColor: '#e74c3c',
		border: 'none',
		borderRadius: '6px',
		cursor: 'pointer',
		boxShadow: '0 1px 2px rgba(0,0,0,.6)'
	  }
	});

	// Outside click to close
	window.__file_menu_doc_close = function(ev){
	  try{
		const m = document.getElementById('auv3-file-menu');
		if (!m) return;
		if (!m.contains(ev.target)) close_file_context_menu();
	  }catch(_){ }
	};
	document.addEventListener('mousedown', window.__file_menu_doc_close, true);
	document.addEventListener('touchstart', window.__file_menu_doc_close, true);
  }catch(e){ console.warn('show_file_context_menu error', e); }
}

// Render a skinnable, navigable list into target using Squirrel components
function display_files(target, listing, opts = {}) {
  try {
  // Normalize options to avoid null deref on opts.css
  opts = opts || {};
	// Remove any previous global panel to avoid duplicates hidden in wrong containers
	try { const old = document.getElementById('auv3-file-list'); if (old) old.remove(); } catch(_){ }

	// Resolve host robustly, allowing selector strings, DOM nodes, or foreign wrappers
	function resolveHost(t){
	  try{
		if (!t) return document.body;
		if (typeof t === 'string') return document.querySelector(t) || document.body;
		if (t === document || t === window) return document.body;
		if (t && (t.nodeType === 1 || t === document.body || t === document.documentElement)) return t;
		if (t && t.el && (t.el.nodeType === 1)) return t.el;
		if (t && t.element && (t.element.nodeType === 1)) return t.element;
		if (t && t.id) { const byId = document.getElementById(t.id); if (byId) return byId; }
	  }catch(_){ }
	  return document.body;
	}
	let host = resolveHost(target);
	// If target not found or not visible, fallback to body
	let hostIsBody = false;
	try {
	  const r = host && host.getBoundingClientRect ? host.getBoundingClientRect() : { width: 0, height: 0 };
	  if (!host || !r || r.width < 30 || r.height < 30) {
		host = document.body; hostIsBody = true;
	  } else {
		hostIsBody = (host === document.body || host === document.documentElement);
	  }
	} catch(_) { host = document.body; hostIsBody = true; }

	// Remove previous container if any (guard when host isn't a standard Element)
	try { const prev = host && host.querySelector ? host.querySelector('#auv3-file-list') : null; if (prev) prev.remove(); } catch(_){ }

	const defaults = {
	  container: { marginTop: '40px', backgroundColor: '#111', border: '1px solid #2c343d', borderRadius: '6px', padding: '8px', color: '#e6e6e6', fontFamily: 'monospace', fontSize: '12px', position: 'relative', zIndex: '9999' },
	  header: { marginBottom: '6px', color: '#9db2cc', display: 'flex', alignItems: 'center', gap: '8px' },
	  crumb: { color: '#8fd', cursor: 'pointer' },
	  sectionTitle: { margin: '6px 0 2px 0', color: '#8fd' },
	  list: { margin: '0', paddingLeft: '16px' },
	  item: { cursor: 'pointer' },
	  upButton: { width: '40px', height: '20px', color: 'black', backgroundColor: 'lightgray', borderRadius: '4px', position: 'relative', border: 'none', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,1)' }
	};
  const theme = opts.css || {};

  // Container
	const overlayCSS = hostIsBody ? {
	  position: 'fixed',
	  left: '12px', right: '12px', top: '48px', bottom: '12px',
	  zIndex: '2147483647',
	  overflow: 'auto'
	} : {};
	// Create or reuse a full-screen overlay so the panel is always visible
	try { const oldOv = document.getElementById('auv3-file-overlay'); if (oldOv) oldOv.remove(); } catch(_){ }
	let overlay = null;
	try {
	  overlay = $('div', { id: 'auv3-file-overlay', parent: 'body', css: {
	  position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
	  backgroundColor: 'rgba(0,0,0,0.35)', zIndex: '2147483600',
	  display: 'block', opacity: '1', pointerEvents: 'auto'
	}});
	} catch(e) {
	  console.log('overlay creation failed', e && (e.message||e));
	  return;
	}

	let wrap = null;
	try {
	  wrap = $('div', { id: 'auv3-file-list', parent: '#auv3-file-overlay', css: {
		...defaults.container,
		position: 'absolute', left: '5%', right: '5%', top: '10%', bottom: '10%',
		overflow: 'auto', zIndex: '2147483647',
		display: 'block', opacity: '1', pointerEvents: 'auto',
		...overlayCSS, ...theme.container
	  } });
	} catch(e) {
	  console.log('panel render failed', e && (e.message||e));
	  return;
	}
	// Minimal placeholder to ensure something visible even if list building fails later
	try { $('div', { parent: wrap, text: '📁 AUv3 Browser', css: { color: '#9db2cc', marginBottom: '4px', fontSize: '12px' } }); } catch(_){ }

  // Header with Up button, Refresh, Close, and breadcrumbs
  const header = $('div', { parent: wrap, css: { ...defaults.header, ...theme.header, justifyContent: 'space-between' } });
  const leftHdr = $('div', { parent: header, css: { display: 'flex', alignItems: 'center', gap: '8px' } });
  const rightHdr = $('div', { parent: header, css: { display: 'flex', alignItems: 'center', gap: '8px' } });

	// Local helper to create a button using Squirrel Button if available, else fallback to a plain button element via $
	function addBtn({ id, text, parent, css, onClick }){
	  try{
		if (typeof Button === 'function') {
		  Button({ id, onText: text, offText: text, onAction: onClick, offAction: onClick, parent, css });
		} else {
		  $('button', { id, parent, text, css: { ...css, position: css && css.position || 'relative' }, onclick: onClick });
		}
	  }catch(e){ console.log('addBtn error', e && (e.message||e)); }
	}

	// Up button
	addBtn({
	  id: 'auv3-up', text: '..', parent: leftHdr,
	  css: { ...defaults.upButton, ...(theme.upButton||{}) },
	  onClick: ()=> navigate_auv3(parent_of(listing.path), window.__auv3_browser_state.target, window.__auv3_browser_state.opts)
	});

	// Refresh button
	addBtn({
	  id: 'auv3-refresh', text: '↻', parent: leftHdr,
	  css: { ...defaults.upButton, width: '32px', ...(theme.refreshButton||{}) },
	  onClick: ()=> navigate_auv3(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts)
	});

	// Quick location toggles
		addBtn({
			id: 'auv3-import', text: 'Import', parent: rightHdr,
			css: { ...defaults.upButton, width: '64px' },
			onClick: ()=> ios_file_chooser(true)
		});

	// Breadcrumbs
	const crumbs = listing.path && listing.path !== '.' ? listing.path.split('/').filter(Boolean) : [];
  const bc = $('div', { parent: leftHdr });
	// Root crumb
	$('span', { parent: bc, text: '.', css: { ...defaults.crumb, ...(theme.crumb||{}) }, onclick: ()=> navigate_auv3('.', window.__auv3_browser_state.target, window.__auv3_browser_state.opts) });
	let acc = '';
	crumbs.forEach((seg) => {
	  $('span', { parent: bc, text: ' / ', css: { color: '#666' } });
	  acc = path_join(acc || '.', seg);
	  $('span', { parent: bc, text: seg, css: { ...defaults.crumb, ...(theme.crumb||{}) }, onclick: ()=> navigate_auv3(acc, window.__auv3_browser_state.target, window.__auv3_browser_state.opts) });
	});

	// Sections
	const mkSection = (label, items, isDir) => {
	  const sec = $('div', { parent: wrap });
	  $('div', { parent: sec, text: label, css: { ...defaults.sectionTitle, ...(theme.sectionTitle||{}) } });
	  const ul = $('ul', { parent: sec, css: { ...defaults.list, ...(theme.list||{}) } });
	  (items || []).forEach((it) => {
		const fullPath = path_join(listing.path, it.name);
		const liId = 'auv3-item-' + String(fullPath).replace(/[^\w\-]/g, '_');
		let longPressFired = false;
		const li = $('li', {
		  parent: ul,
		  id: liId,
		  css: {
			...defaults.item,
			...(theme.item||{}),
			...(isDir ? (theme.folderItem||{}) : (theme.fileItem||{})),
			...(isDir ? {} : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' })
		  },
		  onclick: ()=>{
			if (longPressFired) { longPressFired = false; return; }
			if (isDir) {
			  if (opts && typeof opts.onFolderClick === 'function') opts.onFolderClick(it, fullPath);
			  else navigate_auv3(fullPath, window.__auv3_browser_state.target, window.__auv3_browser_state.opts);
			} else if (opts && typeof opts.onFileClick === 'function') {
			  // Custom handler provided by caller
			  opts.onFileClick(it, fullPath);
			} else {
			  // Default behavior: route by file type
			  try { const t = detect_file_type(it.name); file_type_decision(t, it, fullPath); } catch(e){ console.warn('onFileClick fallback error', e); }
			}
		  }
		});
		// Optional cloud icon and file name label
		const leftWrap = $('span', { parent: li, css: { display: 'inline-flex', alignItems: 'center', gap: '6px' } });
		if (!isDir && it.isCloud && String(it.downloadingStatus||'') !== 'current') {
		  const dl = $('button', {
			parent: leftWrap,
			text: '☁️',
			title: 'Download from iCloud',
			css: { border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px', fontSize: '14px' },
			onclick: (ev)=>{
			  try{ ev && ev.stopPropagation && ev.stopPropagation(); }catch(_){ }
			  try{
				if (window.AtomeFileSystem && typeof window.AtomeFileSystem.ensureLocal === 'function') {
				  window.AtomeFileSystem.ensureLocal(fullPath, ()=>{
					try{ navigate_auv3(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }catch(_){ }
				  });
				}
			  }catch(_){ }
			}
		  });
		}
		$('span', { parent: leftWrap, text: it.name });
		// Add delete icon for files only
		if (!isDir) {
		  const delBtnCss = {
			cursor: 'pointer',
			border: 'none',
			background: 'transparent',
			color: '#f66',
			padding: '0 4px',
			fontSize: '14px',
			lineHeight: '1',
		  };
		  $('button', {
			parent: li,
			text: '🗑',
			title: 'Delete',
			css: { ...delBtnCss, ...(theme.deleteButton||{}) },
			onclick: (ev)=>{
			  try{ ev && ev.stopPropagation && ev.stopPropagation(); }catch(_){ }
			  request_delete_file(fullPath, li, listing);
			}
		  });

		  // Long-press to open menu
		  try{
			let pressTimer = null; let startX=0, startY=0;
			const start = (e)=>{
			  try{ close_file_context_menu(); }catch(_){ }
			  const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
			  startX = pt.clientX||0; startY = pt.clientY||0;
			  if (pressTimer) { clearTimeout(pressTimer); }
			  pressTimer = setTimeout(()=>{ longPressFired = true; show_file_context_menu(li, it, fullPath, listing); }, 450);
			};
			const move = (e)=>{
			  if (!pressTimer) return;
			  const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
			  const dx = Math.abs((pt.clientX||0) - startX), dy = Math.abs((pt.clientY||0) - startY);
			  if (dx > 8 || dy > 8) { clearTimeout(pressTimer); pressTimer=null; }
			};
			const cancel = ()=>{ if (pressTimer) { clearTimeout(pressTimer); pressTimer=null; } };
			li.addEventListener('pointerdown', start);
			li.addEventListener('pointermove', move);
			li.addEventListener('pointerup', cancel);
			li.addEventListener('pointerleave', cancel);
			li.addEventListener('touchstart', start, { passive: true });
			li.addEventListener('touchmove', move, { passive: true });
			li.addEventListener('touchend', cancel);
			li.addEventListener('touchcancel', cancel);
		  }catch(_){ }
		}
	  });
	};

  mkSection('Folders', (listing && listing.folders) || [], true);
  mkSection('Files', (listing && listing.files) || [], false);
  } catch (e) {
	try { console.log('display_files error', (e && e.message) ? e.message : e); } catch(_) { console.log('display_files error {}'); }
  }
}

// Removed redundant top-level Import and List buttons; Ubrowse provides these flows within its header.
  // Third button: open the persistent browser with default location
  const ubrowseBtn = Button({
	id:'btn-ubrowse',
	onText: 'Ubrowse',
	offText: 'Ubrowse',
	onAction: ()=> { try{ ubrowse('#view'); } catch(e){ console.warn('Ubrowse error', e); } },
	offAction: ()=> { try{ ubrowse('#view'); } catch(e){ console.warn('Ubrowse error', e); } },
	parent: '#view',
	css: {
		width: '70px',
		height: '24px',
		left: '130px',
		top: '12px',
		color: 'black',
		borderRadius: '6px',
		backgroundColor: 'lightgray',
		position: 'relative',
		border: 'none',
		cursor: 'pointer',
		transition: 'background-color 0.3s ease',
		boxShadow: '0 2px 4px rgba(0,0,0,1)',
	}
  });