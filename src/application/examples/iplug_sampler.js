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

//tests

        console.log("Console redefined for Swift communication");
        console.error(" error redefined for Swift communication");


function ios_file_chooser(multiple) {
  try {
    // Only proceed if the iOS file bridge is available
    if (!window.AtomeFileSystem) { console.warn('AtomeFileSystem indisponible'); return; }

    // Accept boolean true, string 'true', number 1, or an object with { multiple: true }
    const allowMulti = (multiple === true) || (multiple === 'true') || (multiple === 1) || (!!multiple && multiple.multiple === true);
    const dest = 'Recordings';
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
      return;
    }
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

// Render a skinnable, navigable list into target using Squirrel components
function display_files(target, listing, opts = {}) {
  try {
    const host = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!host) { console.warn('display_files: target introuvable', target); return; }

    // Remove previous container if any
    const prev = host.querySelector('#auv3-file-list'); if (prev) prev.remove();

    const defaults = {
      container: { marginTop: '40px', backgroundColor: '#111', border: '1px solid #2c343d', borderRadius: '6px', padding: '8px', color: '#e6e6e6', fontFamily: 'monospace', fontSize: '12px' },
      header: { marginBottom: '6px', color: '#9db2cc', display: 'flex', alignItems: 'center', gap: '8px' },
      crumb: { color: '#8fd', cursor: 'pointer' },
      sectionTitle: { margin: '6px 0 2px 0', color: '#8fd' },
      list: { margin: '0', paddingLeft: '16px' },
      item: { cursor: 'pointer' },
      upButton: { width: '40px', height: '20px', color: 'black', backgroundColor: 'lightgray', borderRadius: '4px', position: 'relative', border: 'none', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,1)' }
    };
    const theme = opts.css || {};

    // Container
    const wrap = $('div', { id: 'auv3-file-list', parent: host, css: { ...defaults.container, ...theme.container } });

    // Header with Up button and breadcrumbs
    const header = $('div', { parent: wrap, css: { ...defaults.header, ...theme.header } });

    // Up button
    Button({
      id: 'auv3-up', onText: '..', offText: '..',
      onAction: ()=> navigate_auv3(parent_of(listing.path), window.__auv3_browser_state.target, window.__auv3_browser_state.opts),
      offAction: ()=> navigate_auv3(parent_of(listing.path), window.__auv3_browser_state.target, window.__auv3_browser_state.opts),
      parent: header,
      css: { ...defaults.upButton, ...(theme.upButton||{}) }
    });

    // Breadcrumbs
    const crumbs = listing.path && listing.path !== '.' ? listing.path.split('/').filter(Boolean) : [];
    const bc = $('div', { parent: header });
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
        $('li', {
          parent: ul,
          text: it.name,
          css: { ...defaults.item, ...(theme.item||{}), ...(isDir ? (theme.folderItem||{}) : (theme.fileItem||{})) },
          onclick: ()=>{
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
      });
    };

    mkSection('Dossiers', (listing && listing.folders) || [], true);
    mkSection('Fichiers', (listing && listing.files) || [], false);
  } catch (e) { console.warn('display_files error', e); }
}


  const import_button = Button({
    id:'btn-import',
    onText: 'import',
    offText: 'import',
    onAction: ()=> ios_file_chooser(true),
    offAction: ()=> ios_file_chooser(true),
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
        left: '70px',
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