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




function ios_file_chooser(multiple, destFolder) {
  try {
    // Only proceed if the iOS file bridge is available
    if (!window.AtomeFileSystem) { console.warn('AtomeFileSystem indisponible'); return; }

    // Accept boolean true, string 'true', number 1, or an object with { multiple: true }
    const allowMulti = (multiple === true) || (multiple === 'true') || (multiple === 1) || (!!multiple && multiple.multiple === true);
    // Destination folder: explicit param wins, else current browser path, else root
    const dest = (typeof destFolder === 'string' && destFolder)
      ? destFolder
      : ((window.__auv3_browser_state && window.__auv3_browser_state.path) || './');
    const types = ['m4a'];

    const onDone = (res) => {
      if (res && res.success) {
  try { if (typeof listRecordings === 'function') listRecordings(); } catch(_){ }
  // If the browser panel is currently visible, refresh it, otherwise do nothing
  try {
    const st = window.__auv3_browser_state;
    if (st && st.target) {
      const host = document.querySelector(st.target);
      if (host && host.querySelector('#auv3-file-list')) {
        navigate_auv3(st.path || '.', st.target, st.opts);
      }
    }
  } catch(_){ }
      } else {
        console.warn('Import échoué', res && res.error);
      }
    };

  if (allowMulti && typeof window.AtomeFileSystem.copy_multiple_to_ios_local === 'function') {
      // iOS multiple selection (DocumentPicker with allowsMultipleSelection)
      window.AtomeFileSystem.copy_multiple_to_ios_local(dest, types, onDone);
    } else {
      // Single file selection
      window.AtomeFileSystem.copy_to_ios_local(dest, types, onDone);
    }
  } catch (e) {
    console.warn('import error', e);
  }
}

// Simple state for the AUv3 file browser (current path, last opts/target)
window.__auv3_browser_state = { path: '.', target: '#view', opts: null, visible: false };

// Selection state and helpers
window.__auv3_selection = window.__auv3_selection || {
  set: new Set(),
  anchor: null,
  focus: null,
  shiftLock: false,
  clipboard: []
};

function sel_clear(){ window.__auv3_selection.set.clear(); window.__auv3_selection.anchor = null; window.__auv3_selection.focus = null; }
function sel_is_selected(path){ return window.__auv3_selection.set.has(path); }
function sel_add(path){ window.__auv3_selection.set.add(path); }
function sel_remove(path){ window.__auv3_selection.set.delete(path); }
function sel_replace(paths){ window.__auv3_selection.set = new Set(paths); }
function sel_list(){ return Array.from(window.__auv3_selection.set); }
function is_shift_active(ev){ return (ev && !!ev.shiftKey) || !!window.__auv3_selection.shiftLock; }
function update_selection_ui(container){
  try{
    const items = container.querySelectorAll('li[data-fullpath]');
    items.forEach((li)=>{
      const fp = li.getAttribute('data-fullpath')||'';
      const isDir = li.getAttribute('data-isdir') === '1';
      const dot = li.querySelector('span[data-role="dot"]');
      const nameSpan = li.querySelector('span[data-role="name"]');
      if (sel_is_selected(fp)) {
        li.style.backgroundColor = '#2a3645';
        li.style.color = '#e1f0ff';
        if (dot) dot.style.color = '#e1f0ff';
        if (nameSpan) nameSpan.style.color = '#e1f0ff';
      } else {
        li.style.backgroundColor = '';
        li.style.color = '';
        if (isDir) {
          if (dot) dot.style.color = '#8fd';
          if (nameSpan) nameSpan.style.color = '#9bd6ff';
        } else {
          if (dot) dot.style.color = '';
          if (nameSpan) nameSpan.style.color = '';
        }
      }
    });
  }catch(_){ }
}

function path_join(base, name){
  if (!base || base === '.' || base === './') return name;
  if (!name || name === '.' || name === './') return base;
  return (base.replace(/\/$/, '')) + '/' + (name.replace(/^\//, ''));
}
function parent_of(path){
  if (!path || path === '.' || path === './' || path === '/') return '.';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

async function navigate_auv3(path='.', target='#view', opts=null){
  window.__auv3_browser_state = { path, target, opts, visible: true };
  const listing = await get_auv3_files(path);
  display_files(target, listing, opts);
}

function toggle_auv3_browser(target = '#view'){
  try{
    const st = window.__auv3_browser_state || { path: '.', target, opts: null, visible: false };
    const host = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!host) { console.warn('toggle_auv3_browser: target introuvable', target); return; }
    const panel = host.querySelector('#auv3-file-list');
    if (panel) {
      panel.remove();
      window.__auv3_browser_state.visible = false;
      try { document.body && (document.body.style.overflow = ''); } catch(_){ }
      try { if (window.__auv3_doc_key_handler) { document.removeEventListener('keydown', window.__auv3_doc_key_handler, true); window.__auv3_doc_key_handler = null; } } catch(_){ }
      return;
    }
    try { document.body && (document.body.style.overflow = 'hidden'); } catch(_){ }
    navigate_auv3(st.path || '.', target, st.opts || {});
  }catch(e){ console.warn('toggle_auv3_browser error', e); }
}


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
        if(!audio){ console.warn('Audio backend indisponible'); return; }
        const id = 'file:'+ (fullPath||fileEntry?.name||Math.random().toString(36).slice(2));
        audio.create_clip && audio.create_clip({ id, path_or_bookmark: fullPath||fileEntry?.name, mode: 'preload' });
        audio.play && audio.play({ clip_id:id, when:{type:'now'}, start:0, end:'clip_end', loop:{mode:'off'} });
        break;
      }
      case 'project': {
        if(!AU || typeof AU.auv3_file_loader !== 'function'){ console.warn('Chargement projet indisponible'); return; }
        const base = strip_ext(fileEntry?.name||'');
        try { await AU.auv3_file_loader(parent || 'Projects', base); } catch(e){ console.warn('Echec chargement projet', e); }
        break;
      }
      case 'text': {
        // Optional: preview or process text later; for now log selection
        console.log('Texte sélectionné:', fullPath || (fileEntry && fileEntry.name));
        break;
      }
      case 'image': {
        console.log('Image sélectionnée:', fullPath || (fileEntry && fileEntry.name));
        break;
      }
      default: {
        console.log('Fichier sélectionné (type inconnu):', fullPath || (fileEntry && fileEntry.name));
      }
    }
  }catch(e){ console.warn('file_type_decision error', e); }
}
// expose globally for external use
window.file_type_decision = window.file_type_decision || file_type_decision;

// Returns an object { path, folders:[{name,size,modified}], files:[{name,size,modified}] }
async function get_auv3_files(path = '.') {
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.listFiles !== 'function') {
    console.warn('AtomeFileSystem.listFiles indisponible');
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
      const entry = { name, size, modified, isDirectory: isDir };
      if (isDir) folders.push(entry); else files.push(entry);
    });
    return { folders, files };
  };

  // Support both callback and promise styles
  try {
    const maybe = window.AtomeFileSystem.listFiles(path, (res) => {});
    if (maybe && typeof maybe.then === 'function') {
      const res = await maybe;
      const items = (res && (res.files || res.items || res.data && res.data.files)) || [];
      const { folders, files } = normalize(items);
      return { path, folders, files };
    }
  } catch(_){ /* fall through to callback style */ }

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

// Confirmation dialog using Squirrel components
function show_confirm_dialog(message, onConfirm, onCancel){
  try{
    // Remove existing overlay if any
    try{ const prev = document.getElementById('auv3-confirm'); if (prev) prev.remove(); }catch(_){ }
    const overlay = $('div', { id: 'auv3-confirm', parent: document.body, css: {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
      backgroundColor: 'rgba(0,0,0,.5)', zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }});
    const box = $('div', { parent: overlay, css: {
      backgroundColor: '#1b1f27', color: '#eee', border: '1px solid #2c343d', borderRadius: '8px', padding: '12px', width: '280px', boxShadow: '0 8px 24px rgba(0,0,0,.6)'
    }});
    $('div', { parent: box, text: message || 'Confirmer ?', css: { marginBottom: '10px', fontSize: '13px' } });
    const row = $('div', { parent: box, css: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } });
    Button({ id:'cnf-cancel', onText:'Cancel', offText:'Cancel', onAction: ()=>{ try{ overlay.remove(); }catch(_){ } onCancel && onCancel(false); }, offAction: ()=>{ try{ overlay.remove(); }catch(_){ } onCancel && onCancel(false); }, parent: row, css: { height:'26px', padding:'0 10px', backgroundColor:'#666', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow:'0 1px 2px rgba(0,0,0,.6)' } });
    Button({ id:'cnf-ok', onText:'Delete', offText:'Delete', onAction: ()=>{ try{ overlay.remove(); }catch(_){ } onConfirm && onConfirm(true); }, offAction: ()=>{ try{ overlay.remove(); }catch(_){ } onConfirm && onConfirm(true); }, parent: row, css: { height:'26px', padding:'0 10px', backgroundColor:'#e74c3c', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow:'0 1px 2px rgba(0,0,0,.6)' } });
  }catch(_){ }
}

// Clipboard + multi-delete helpers
function copy_selection_or_item(fullPath){
  try{
    const sel = sel_list();
    const payload = (sel && sel.length) ? sel : (fullPath ? [fullPath] : []);
    window.__auv3_selection.clipboard = payload;
  }catch(_){ }
}

function paste_into_current_folder(listing){
  try{
    const cb = window.__auv3_selection.clipboard || [];
    if (!cb || !cb.length) return;
    if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.copyFiles !== 'function') return;
    const dest = (listing && listing.path) ? listing.path : './';
    window.AtomeFileSystem.copyFiles(dest, cb, (res)=>{
      try{ if (res && (res.success===undefined || res.success===true)) { navigate_auv3(dest, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); } }catch(_){ }
    });
  }catch(_){ }
}

function request_delete_selection_or_item(fullPath, listing){
  const arr = (function(){ const s = sel_list(); return (s && s.length) ? s : (fullPath ? [fullPath] : []); })();
  if (!arr.length) return;
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.deleteFile !== 'function') { console.warn('deleteFile indisponible'); return; }
  let i = 0;
  const next = ()=>{
    if (i >= arr.length) { try{ navigate_auv3(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }catch(_){ } return; }
    const p = arr[i++];
    try{
      window.AtomeFileSystem.deleteFile(p, ()=>{ next(); });
    }catch(_){ next(); }
  };
  next();
}

function request_delete_file(fullPath, li, listing){
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.deleteFile !== 'function') {
    console.warn('AtomeFileSystem.deleteFile indisponible');
    return;
  }
  try {
    window.AtomeFileSystem.deleteFile(fullPath, (res)=>{
      if (res && (res.success === undefined || res.success === true)) {
        try { navigate_auv3(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }
        catch(_){ try{ li && li.remove && li.remove(); }catch(__){} }
      } else {
        console.warn('Suppression échouée', res && res.error);
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
    $('div', { parent: menu, text: fileItem && fileItem.name ? fileItem.name : 'Fichier', css: { fontSize: '11px', color: '#9db2cc', marginBottom: '6px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });

    // Copy action
    Button({
      id: 'auv3-menu-copy', onText: 'Copy', offText: 'Copy',
      onAction: ()=>{ copy_selection_or_item(fullPath); close_file_context_menu(); },
      offAction: ()=>{ copy_selection_or_item(fullPath); close_file_context_menu(); },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: '#3498db', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.6)', marginBottom: '6px' }
    });

    // Paste action
    Button({
      id: 'auv3-menu-paste', onText: 'Paste', offText: 'Paste',
      onAction: ()=>{ paste_into_current_folder(listing); close_file_context_menu(); },
      offAction: ()=>{ paste_into_current_folder(listing); close_file_context_menu(); },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: '#2ecc71', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.6)', marginBottom: '6px' }
    });

    // Delete action
    Button({
      id: 'auv3-menu-delete', onText: 'Delete', offText: 'Delete',
      onAction: ()=>{
        const sel = sel_list();
        const msg = (sel && sel.length>1) ? ('Supprimer ' + sel.length + ' éléments ?') : ('Supprimer « ' + ((fullPath||'').split('/').pop()||'cet élément') + ' » ?');
        show_confirm_dialog(msg, ()=>{ request_delete_selection_or_item(fullPath, listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
      },
      offAction: ()=>{
        const sel = sel_list();
        const msg = (sel && sel.length>1) ? ('Supprimer ' + sel.length + ' éléments ?') : ('Supprimer « ' + ((fullPath||'').split('/').pop()||'cet élément') + ' » ?');
        show_confirm_dialog(msg, ()=>{ request_delete_selection_or_item(fullPath, listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
      },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.6)' }
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
    const host = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!host) { console.warn('display_files: target introuvable', target); return; }

    // Remove previous container if any
    const prev = host.querySelector('#auv3-file-list'); if (prev) prev.remove();

    const defaults = {
      container: { marginTop: '40px', backgroundColor: '#111', border: '1px solid #2c343d', borderRadius: '6px', padding: '8px', color: '#e6e6e6', fontFamily: 'monospace', fontSize: '14px', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
      header: { marginBottom: '6px', color: '#9db2cc', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none', WebkitUserSelect: 'none' },
      crumb: { color: '#8fd', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' },
      sectionTitle: { margin: '6px 0 2px 0', color: '#8fd', userSelect: 'none', WebkitUserSelect: 'none' },
      list: { margin: '0', paddingLeft: '16px', userSelect: 'none', WebkitUserSelect: 'none' },
      item: { cursor: 'pointer', padding: '4px 8px', lineHeight: '22px', userSelect: 'none', WebkitUserSelect: 'none' },
      upButton: { width: '40px', height: '20px', color: 'black', backgroundColor: 'lightgray', borderRadius: '4px', position: 'relative', border: 'none', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,1)' }
    };



    const theme = opts.css || {};

    // Container
    const wrap = $('div', { id: 'auv3-file-list', parent: host, css: { ...defaults.container, ...theme.container, overscrollBehavior: 'contain', touchAction: 'pan-y' } });
    try { wrap.setAttribute('tabindex','0'); } catch(_){ }
    // Block browser text selection and drag in the file list area
    try {
      wrap.addEventListener('selectstart', function(e){ e.preventDefault(); }, true);
      wrap.addEventListener('dragstart', function(e){ e.preventDefault(); }, true);
      // Prevent scroll chaining to the outer AUv3 view while preserving inner scroll
      wrap.addEventListener('touchmove', function(e){ try{ e.stopPropagation(); }catch(_){ } }, { passive: true });
      // Ensure host (#view) keeps its own overflow and also prevents bubbling
      try {
        if (host && host.style) {
          if (!host.style.overflow) host.style.overflow = 'auto';
          host.style.overscrollBehavior = 'contain';
          host.style.touchAction = 'pan-y';
          host.addEventListener('touchmove', function(ev){ try{ ev.stopPropagation(); }catch(_){ } }, { passive: true });
          host.addEventListener('wheel', function(ev){ try{ ev.stopPropagation(); }catch(_){ } }, { passive: true });
        }
      } catch(_){ }
    } catch(_){ }

  // Header with controls and breadcrumbs
  const header = $('div', { parent: wrap, css: { ...defaults.header, ...theme.header } });

    // Shift-lock toggle
    const shiftBtn = Button({
      id:'btn-shift',
      onText: 'multi',
      offText: 'single',
      onAction: ()=>{ window.__auv3_selection.shiftLock = true; },
      offAction: ()=>{ window.__auv3_selection.shiftLock = false; },
      parent: header,
      css: { width: '72px', height: '24px', color: 'black',
        borderRadius: '6px', backgroundColor: 'lightgray', 
        border: 'none', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,1)',
        marginLeft: 'auto' // push this group to the right; import button stays immediately to the right
      }
    });

  const import_button = Button({
      id:'btn-import',
      onText: 'import',
      offText: 'import',
      onAction: ()=> ios_file_chooser(true, listing.path),
      offAction: ()=> ios_file_chooser(true, listing.path),
      parent: header,
      css: {
        width: '60px',
        height: '24px',
        color: 'black',
        borderRadius: '6px',
        backgroundColor: 'lightgray',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,1)'
      }
    });
  // Current folder header above the list (click to go up)
  const currName = (function(){ const p = listing.path||'.'; if (p==='.'||p==='./') return '.'; const parts = p.split('/').filter(Boolean); return parts[parts.length-1] || '.'; })();
  const folderHead = $('div', { parent: wrap, css: { display:'flex', alignItems:'center', gap:'8px', margin:'6px 0 6px 0', userSelect:'none', WebkitUserSelect:'none' } });
  $('span', { parent: folderHead, text: '●', css: { color:'#8fd', fontSize:'10px' } });
  $('span', { parent: folderHead, text: currName, css: { fontWeight:'bold', color:'#9bd6ff', cursor:'pointer' }, onclick: ()=> navigate_auv3(parent_of(listing.path), window.__auv3_browser_state.target, window.__auv3_browser_state.opts) });

  // Breadcrumbs removed: folder header now handles navigation up

    // Sections
    let __linearIndex = 0; const __indexToPath = [];
    const mkSection = (label, items, isDir) => {
      const sec = $('div', { parent: wrap });
      // Removed section title as requested
      const ul = $('ul', { parent: sec, css: { ...defaults.list, ...(theme.list||{}) } });
      (items || []).forEach((it) => {
        const fullPath = path_join(listing.path, it.name);
        let longPressFired = false;
    // Shared state for pointer cycle
    let shiftDownAtPointerDown = false;
    let dragging = false;
    let dragStarted = false;
  const li = $('li', {
          parent: ul,
          css: {
            ...defaults.item,
            ...(theme.item||{}),
            ...(isDir ? (theme.folderItem||{}) : (theme.fileItem||{})),
            ...(isDir ? {} : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' })
          },
          onclick: (ev)=>{
            if (longPressFired) { longPressFired = false; return; }
            if (isDir) {
              if (opts && typeof opts.onFolderClick === 'function') opts.onFolderClick(it, fullPath);
              else navigate_auv3(fullPath, window.__auv3_browser_state.target, window.__auv3_browser_state.opts);
              return;
            }
            if (dragStarted) { dragStarted = false; return; }
            // Selection logic for files
      const shift = !!shiftDownAtPointerDown || is_shift_active(ev);
            const idx = parseInt(li.getAttribute('data-index')||'0',10);
            if (!shift) {
              // Single selection mode
              sel_replace([fullPath]);
              window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
            } else {
              // Multi-select toggle behavior
              if (sel_is_selected(fullPath)) sel_remove(fullPath); else sel_add(fullPath);
              window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
            }
            update_selection_ui(wrap);
          },
          ondblclick: ()=>{
            if (isDir) return;
            try { const t = detect_file_type(it.name); file_type_decision(t, it, fullPath); } catch(e){ console.warn('open error', e); }
          }
        });
        li.setAttribute('data-fullpath', fullPath);
        li.setAttribute('data-isdir', isDir ? '1' : '0');
        li.setAttribute('data-index', String(__linearIndex));
        __indexToPath[__linearIndex] = fullPath; __linearIndex++;
        // File name label (keeps whole-row click behavior)
        if (isDir) {
          $('span', { parent: li, text: '●', css: { color:'#8fd', fontSize:'10px', marginRight:'6px' }, 'data-role': 'dot' });
        }
        $('span', { parent: li, text: it.name, css: { userSelect: 'none' }, 'data-role': 'name' });
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
            title: 'Supprimer',
            css: { ...delBtnCss, ...(theme.deleteButton||{}) },
            onclick: (ev)=>{
              try{ ev && ev.stopPropagation && ev.stopPropagation(); }catch(_){ }
              const base = (fullPath||'').split('/').pop() || 'cet élément';
              show_confirm_dialog('Supprimer « ' + base + ' » ?', ()=>{ request_delete_file(fullPath, li, listing); }, ()=>{});
            }
          });
        }

        // Drag-to-select across items
        try{
          if (isDir) { /* no drag-to-select on directories */ throw new Error('skip-drag-setup'); }
          const startDrag = (e)=>{ if (e && e.buttons===1) { dragging = true; dragStarted = false; shiftDownAtPointerDown = is_shift_active(e); } };
          const ensureStartSelected = ()=>{
            if (!dragging || dragStarted) return;
            dragStarted = true;
            if (!shiftDownAtPointerDown) sel_clear();
            sel_add(fullPath); update_selection_ui(wrap);
          };
          const enter = ()=>{ if (!dragging) return; ensureStartSelected(); sel_add(fullPath); update_selection_ui(wrap); };
          li.addEventListener('pointerenter', enter);
          li.addEventListener('touchmove', enter, { passive: true });
          li.addEventListener('pointerdown', startDrag);
          li.addEventListener('pointermove', ensureStartSelected);
          const stopDrag = ()=>{ dragging = false; };
          li.addEventListener('pointerup', stopDrag);
          li.addEventListener('pointerleave', ()=>{});
        }catch(_){ }

        // Long-press to open context menu (files and folders)
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
      });
    };

    mkSection('Dossiers', (listing && listing.folders) || [], true);
    mkSection('Fichiers', (listing && listing.files) || [], false);

    // Helpers for keyboard actions
    function handleArrowKey(e, key){
      e.preventDefault(); e.stopPropagation();
      const nodes = wrap.querySelectorAll('li[data-index]');
      const total = nodes.length;
      if (!total) return;
      const extend = is_shift_active(e);
      let focus = (window.__auv3_selection.focus==null) ? -1 : window.__auv3_selection.focus;
      if (key === 'ArrowDown') focus = Math.min(total-1, focus+1); else focus = Math.max(0, focus-1);
      if (focus < 0) return;
      if (!extend) {
        const li = wrap.querySelector(`li[data-index="${focus}"]`);
        const fp = li ? li.getAttribute('data-fullpath') : null;
        if (fp) { sel_replace([fp]); window.__auv3_selection.anchor = focus; window.__auv3_selection.focus = focus; }
      } else {
        const a = (window.__auv3_selection.anchor==null) ? focus : window.__auv3_selection.anchor;
        window.__auv3_selection.focus = focus;
        const [s,e2] = a<=focus ? [a,focus] : [focus,a];
        const paths = []; for (let i=s;i<=e2;i++){ const li = wrap.querySelector(`li[data-index="${i}"]`); if (li) { const fp = li.getAttribute('data-fullpath'); if (fp) paths.push(fp); } }
        sel_replace(paths);
      }
      update_selection_ui(wrap);
      try{ const el = wrap.querySelector(`li[data-index="${focus}"]`); el && el.scrollIntoView && el.scrollIntoView({ block:'nearest' }); }catch(_){ }
    }

    function handleEnterKey(e){
      e.preventDefault(); e.stopPropagation();
      const nodes = wrap.querySelectorAll('li[data-index]');
      if (!nodes || !nodes.length) return;
      let focus = (window.__auv3_selection.focus==null) ? null : window.__auv3_selection.focus;
      if (focus == null) {
        // Fallback: use first selected item if any
        try {
          const selected = sel_list();
          if (selected && selected.length) {
            const first = selected[0];
            for (let i = 0; i < nodes.length; i++) {
              if (nodes[i].getAttribute('data-fullpath') === first) { focus = i; break; }
            }
          }
        } catch(_) { }
      }
      if (focus == null) return;
      const li = wrap.querySelector(`li[data-index="${focus}"]`);
      if (!li) return;
      const fullPath = li.getAttribute('data-fullpath');
      const isDir = li.getAttribute('data-isdir') === '1';
      if (isDir) {
        try {
          const name = (fullPath||'').split('/').pop() || '';
          if (opts && typeof opts.onFolderClick === 'function') { opts.onFolderClick({ name, isDirectory: true }, fullPath); }
          else { navigate_auv3(fullPath, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }
        } catch(_) { navigate_auv3(fullPath, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }
      } else {
        try {
          const name = (fullPath||'').split('/').pop() || '';
          const type = detect_file_type(name);
          file_type_decision(type, { name }, fullPath);
        } catch(e2) { console.warn('enter key open error', e2); }
      }
    }

    function handleEscapeKey(e){
      e.preventDefault(); e.stopPropagation();
      try { navigate_auv3(parent_of(listing.path), window.__auv3_browser_state.target, window.__auv3_browser_state.opts); } catch(_){ }
    }

    // Keyboard navigation with arrows; Shift extends selection. Enter opens folder or activates file. ESC navigates up.
    try{
      wrap.addEventListener('keydown', (e)=>{
        const key = e.key;
        if (key === 'ArrowDown' || key === 'ArrowUp') { handleArrowKey(e, key); return; }
        if (key === 'Enter') { handleEnterKey(e); return; }
        if (key === 'Escape' || key === 'Esc') { handleEscapeKey(e); return; }
      });
    }catch(_){ }

    // Global key handler so arrows immediately control the file list, and ESC/Enter work even when focus is outside
    try {
      if (window.__auv3_doc_key_handler) { document.removeEventListener('keydown', window.__auv3_doc_key_handler, true); }
      window.__auv3_doc_key_handler = function(e){
        try{
          if (!window.__auv3_browser_state || !window.__auv3_browser_state.visible) return;
          const key = e.key;
          if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter' && key !== 'Escape' && key !== 'Esc') return;
          const t = e.target;
          const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
          if (inEditable) return; // don't hijack typing
          if (!wrap || !document.body.contains(wrap)) return;
          // If a confirm dialog is open, don't navigate up on ESC automatically
          if ((key === 'Escape' || key === 'Esc') && document.getElementById('auv3-confirm')) return;
          if (key === 'ArrowDown' || key === 'ArrowUp') { handleArrowKey(e, key); return; }
          if (key === 'Enter') { handleEnterKey(e); return; }
          if (key === 'Escape' || key === 'Esc') { handleEscapeKey(e); return; }
        }catch(_){ }
      };
      document.addEventListener('keydown', window.__auv3_doc_key_handler, true);
    } catch(_){ }
  } catch (e) { console.warn('display_files error', e); }
}


  // Second button: list AUv3 local folders and files into #view
  const listBtn = Button({
    id:'btn-list',
    onText: 'list',
    offText: 'list',
  onAction: ()=> { try{ toggle_auv3_browser('#view'); }catch(e){ console.warn('list error', e); } },
  offAction: ()=> { try{ toggle_auv3_browser('#view'); }catch(e){ console.warn('list error', e); } },
    parent: '#view',
    css: {
        width: '50px',
        height: '24px',
        left: '12px',
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