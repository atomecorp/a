// Console redefinition with throttled bridging (reduces IPC bursts)
    (function(){
      var oldLog = window.console.log.bind(window.console);
      var oldErr = window.console.error.bind(window.console);
      var buf = [];
      var timer = null;
      var MAX_BATCH = 30; // cap per flush
      var INTERVAL = 200; // ms
      function flush(){
        try{
          timer = null;
          if (!buf.length) return;
          var chunk = buf.splice(0, MAX_BATCH);
          var payload = chunk.join('\n');
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console) {
            window.webkit.messageHandlers.console.postMessage(payload);
          }
          if (buf.length) { timer = setTimeout(flush, INTERVAL); }
        }catch(_){ timer = null; }
      }
      function enqueue(prefix, args){
        try{
          var parts = Array.prototype.slice.call(args).map(function(x){
            if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch(_) { return String(x); } }
            return String(x);
          });
          buf.push(prefix + parts.join(' '));
          if (!timer) { timer = setTimeout(flush, INTERVAL); }
        }catch(_){ }
      }
      window.console.log = function(){ try{ oldLog.apply(console, arguments); }catch(_){ } enqueue('C.LOG: ', arguments); };
      window.console.error = function(){ try{ oldErr.apply(console, arguments); }catch(_){ } enqueue('C.ERROR: ', arguments); };
    })();



// ------------------------------
// UI Theme and Assets (centralized)
// ------------------------------
const UI = {
  icons: {
  delete: './assets/images/icons/delete.svg' // from src/assets/images/icons/delete.svg (relative to index)
  },
  typography: {
    fontFamily: 'monospace',
    fontSize: '14px',
    lineHeight: '22px'
  },
  colors: {
    bgContainer: '#111',
    border: '#2c343d',
    text: '#e6e6e6',
    headerText: '#9db2cc',
    accent: '#8fd',
    folderName: '#9bd6ff',
    selectionBg: '#2a3645',
    selectionText: '#e1f0ff',
    danger: '#e74c3c',
  buttonPrimary: '#3498db',
  buttonSuccess: '#2ecc71',
    buttonBg: 'lightgray',
    buttonText: 'black',
    dialogBg: '#1b1f27',
    dialogText: '#eee',
    confirmCancelBg: '#666',
    confirmCancelBgFocus: '#888',
    confirmOkBg: '#e74c3c',
    confirmOkBgFocus: '#ff6b5a'
  },
  shadows: {
    button: '0 2px 4px rgba(0,0,0,1)',
    small: '0 1px 2px rgba(0,0,0,.6)',
    dialog: '0 8px 24px rgba(0,0,0,.6)',
    menu: '0 6px 18px rgba(0,0,0,.6)'
  },
  layout: {
    containerMarginTop: '40px',
    containerPadding: '8px',
    headerGap: '8px',
    sectionSpacing: '6px',
    listPaddingLeft: '16px',
    itemPadding: '4px 8px'
  },
  buttons: {
    sizeSm: { width: '50px', height: '24px' },
    sizeMd: { width: '60px', height: '24px' },
    sizeWide: { width: '72px', height: '24px' },
    radius: '6px'
  }
};

// (debug logger removed)

// ------------------------------
// FS operation guard + debounced refresh
// ------------------------------
const __FS_OP = { active: false, until: 0, timer: null, navTimer: null, queued: null, wdTimer: null };
function fs_is_blocked(){ try{ return __FS_OP.active && Date.now() < __FS_OP.until; }catch(_){ return false; } }
function fs_begin(minMs = 600){
  try{
    const now = Date.now();
    __FS_OP.active = true;
    __FS_OP.until = Math.max(__FS_OP.until || 0, now + Math.max(200, Math.min(minMs, 3000)));
    if (__FS_OP.timer) { try{ clearTimeout(__FS_OP.timer); }catch(_){ } __FS_OP.timer = null; }
    if (__FS_OP.wdTimer) { try{ clearTimeout(__FS_OP.wdTimer); }catch(_){ } __FS_OP.wdTimer = null; }
    show_busy_overlay();
    // Watchdog: auto-release after a hard cap in case a callback never fires
    const cap = Math.max(1200, Math.min(4000, minMs + 1500));
    __FS_OP.wdTimer = setTimeout(()=>{
      try {
        __FS_OP.active = false; __FS_OP.until = 0;
        hide_busy_overlay();
        const q = __FS_OP.queued; __FS_OP.queued = null; if (q) navigate_auv3_refresh(q.path, q.target, q.opts);
      } catch(_) { }
    }, cap);
  }catch(_){ }
}
function fs_end(padMs = 250){
  try{
    const now = Date.now();
    __FS_OP.until = Math.max(__FS_OP.until || 0, now + Math.max(0, Math.min(padMs, 2000)));
    if (__FS_OP.timer) { try{ clearTimeout(__FS_OP.timer); }catch(_){ } __FS_OP.timer = null; }
    if (__FS_OP.wdTimer) { try{ clearTimeout(__FS_OP.wdTimer); }catch(_){ } __FS_OP.wdTimer = null; }
    __FS_OP.timer = setTimeout(()=>{
  try{ __FS_OP.active = false; }catch(_){ }
      hide_busy_overlay();
      // If a refresh was queued while blocked, run it now (debounced)
      try{
        const q = __FS_OP.queued; __FS_OP.queued = null;
        if (q) navigate_auv3_refresh(q.path, q.target, q.opts);
      }catch(_){ }
    }, Math.max(0, (__FS_OP.until - now)) + 10);
  }catch(_){ }
}
function navigate_auv3_refresh(path, target, opts){
  try{
    // Coalesce navigations
    if (fs_is_blocked()) {
      __FS_OP.queued = { path, target, opts };
      if (!__FS_OP.navTimer) {
        const tick = () => {
          __FS_OP.navTimer = null;
          try {
            if (fs_is_blocked()) {
              __FS_OP.navTimer = setTimeout(tick, 120);
            } else {
              const q = __FS_OP.queued; __FS_OP.queued = null; if (q) navigate_auv3(q.path, q.target, q.opts);
            }
          } catch(_) { __FS_OP.navTimer = setTimeout(tick, 150); }
        };
        __FS_OP.navTimer = setTimeout(tick, 120);
      }
      return;
    }
    __FS_OP.queued = { path, target, opts };
    if (__FS_OP.navTimer) { try{ clearTimeout(__FS_OP.navTimer); }catch(_){ } __FS_OP.navTimer = null; }
    __FS_OP.navTimer = setTimeout(()=>{
  try { const q = __FS_OP.queued; __FS_OP.queued = null; if (q) { navigate_auv3(q.path, q.target, q.opts); } } catch(_){ }
    }, 120);
  }catch(_){ try{ navigate_auv3(path, target, opts); }catch(__){} }
}

// Busy overlay (blocks interactions while FS is settling)
function show_busy_overlay(){
  try{
    if (document.getElementById('auv3-busy-overlay')) return;
    const el = $('div', {
      id: 'auv3-busy-overlay',
      parent: document.body,
      css: {
        position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.08)',
        zIndex: '99998',
        pointerEvents: 'auto'
      }
    });
    $('div', {
      parent: el,
      css: {
        position: 'absolute', left: '50%', top: '12%', transform: 'translateX(-50%)',
        backgroundColor: UI.colors.dialogBg, color: UI.colors.dialogText,
        border: '1px solid ' + UI.colors.border, borderRadius: '8px',
        padding: '6px 10px', boxShadow: UI.shadows.dialog, fontSize: '12px'
      },
      text: 'Working…'
    });
  }catch(_){ }
}
function hide_busy_overlay(){ try{ const el = document.getElementById('auv3-busy-overlay'); el && el.remove && el.remove(); }catch(_){ } }

// Small helper to build a delete icon button with the shared skin
function create_delete_button(parent, onClick, themeOverrides){
  const cssBase = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    padding: '0 4px',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };
  const btn = $('button', {
    parent,
    css: { ...cssBase, ...(themeOverrides||{}) },
    onclick: (ev)=>{ try{ ev && ev.stopPropagation && ev.stopPropagation(); }catch(_){ } try{ onClick && onClick(ev); }catch(_){ } }
  });
  const img = $('img', { parent: btn, src: UI.icons.delete, css: { width: '14px', height: '14px', display: 'block', filter: 'invert(57%) sepia(65%) saturate(3518%) hue-rotate(330deg) brightness(103%) contrast(89%)' }, alt: 'Delete' });
  try {
    img.onerror = function(){ try { this.onerror = null; this.src = './' + UI.icons.delete; } catch(_) { } };
  } catch(_) { }
  return btn;
}

// ------------------------------
// End UI Theme and Assets
// ------------------------------

// ------------------------------
// Navigator helpers (centralized facilities)
// ------------------------------
// Ajoute cette fonction sans changer les noms existants
function create_editable_name_span(text, role = 'name') {
  try {
    const span = document.createElement('span');
    span.textContent = text;
    try { span.setAttribute('data-role', role); } catch(_){}
  // Non-éditable par défaut; l'édition sera activée via edit_filer_element (long-press/rename)
  span.contentEditable = 'false';
  span.spellcheck = false;
    // Styles requis pour l'édition inline lisible et non intrusive
    span.style.outline = 'none';
    span.style.display = 'inline-block';
    span.style.minWidth = '1ch';
    span.style.userSelect = 'text';
    span.style.WebkitUserSelect = 'text';
    span.style.pointerEvents = 'auto';
    span.style.webkitTouchCallout = 'default';
  // Pas de stopPropagation global ici; les handlers dédiés gèrent selon le contexte
    return span;
  } catch(_) { return $('span', { text, 'data-role': role }); }
}
function edit_filer_element(listing, fullPath){
  try{
    const wrap = document.getElementById('auv3-file-list'); if (!wrap) return;
    const li = wrap.querySelector('li[data-fullpath="' + String(fullPath).replace(/"/g,'\\"') + '"]');
  if (!li) { return; }
    const nameSpan = li.querySelector('span[data-role="name"]');
    if (!nameSpan) return;
    const oldName = nameSpan.textContent || '';
  try{ nameSpan.contentEditable = 'true'; nameSpan.spellcheck = false; nameSpan.inputMode = 'text'; }catch(_){ }
  try{ nameSpan.style.userSelect = 'text'; nameSpan.style.WebkitUserSelect = 'text'; nameSpan.style.pointerEvents = 'auto'; nameSpan.style.webkitTouchCallout = 'default'; }catch(_){ }
  try{ window.__INLINE_EDITING = true; }catch(_){ }
    nameSpan.style.outline = 'none' + UI.colors.accent;
    nameSpan.style.backgroundColor = 'rgba(255,255,255,0.05)';
    const selectAll = ()=>{
      try{
        const range = document.createRange();
        range.selectNodeContents(nameSpan);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }catch(_){ }
    };
  setTimeout(()=>{ try{ nameSpan.focus(); selectAll(); }catch(_){ } }, 0);
  setTimeout(()=>{ try{ nameSpan.focus(); selectAll(); }catch(_){ } }, 60);
  setTimeout(()=>{ try{ nameSpan.focus(); selectAll(); }catch(_){ } }, 180);
    const commit = ()=>{
  try{ nameSpan.contentEditable = 'false'; nameSpan.style.outline=''; nameSpan.style.backgroundColor=''; nameSpan.style.userSelect=''; nameSpan.style.WebkitUserSelect=''; nameSpan.style.pointerEvents=''; }catch(_){ }
  try{ window.__INLINE_EDITING = false; }catch(_){ }
      const newName = (nameSpan.textContent||'').trim();
      if (!newName || newName === oldName) { navigate_auv3_refresh(listing.path, nav_context().target, {}); return; }
      const oldPath = fullPath; const newPath = path_join(listing.path, newName);
      if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.renameItem !== 'function') { navigate_auv3_refresh(listing.path, nav_context().target, {}); return; }
      try{
        fs_begin(700);
        window.AtomeFileSystem.renameItem(oldPath, newPath, ()=>{ fs_end(300); navigate_auv3_refresh(listing.path, nav_context().target, {}); });
      }catch(_){ fs_end(200); navigate_auv3_refresh(listing.path, nav_context().target, {}); }
    };
  const cancel = ()=>{ try{ nameSpan.contentEditable = 'false'; nameSpan.textContent = oldName; nameSpan.style.outline=''; nameSpan.style.backgroundColor=''; nameSpan.style.userSelect=''; nameSpan.style.WebkitUserSelect=''; nameSpan.style.pointerEvents=''; }catch(_){ } try{ window.__INLINE_EDITING = false; }catch(_){ } navigate_auv3_refresh(listing.path, nav_context().target, {}); };
    const onKey = (e)=>{
      const k = e.key;
      if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
      else if (k === 'Escape' || k === 'Esc') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else { e.stopPropagation(); }
    };
    nameSpan.addEventListener('keydown', onKey, true);
    nameSpan.addEventListener('blur', ()=>{ commit(); }, { once: true });
  }catch(_){ }
}
window.edit_filer_element = window.edit_filer_element || edit_filer_element;
function nav_context(){ return { target: (window.__auv3_browser_state && window.__auv3_browser_state.target) || '#view', opts: (window.__auv3_browser_state && window.__auv3_browser_state.opts) || null }; }
function nav_enter_folder(path){ try{ navigate_auv3_refresh(path, nav_context().target, nav_context().opts); }catch(_){ } }
function nav_leave_folder(currentPath){ try{ navigate_auv3_refresh(parent_of(currentPath), nav_context().target, nav_context().opts); }catch(_){ } }
function nav_open_import(destPath){ try{ ios_file_chooser(true, destPath); }catch(_){ } }
function nav_preview_file_by_name(fullPath){ try{ const name = (fullPath||'').split('/').pop()||''; const type = detect_file_type(name); file_type_decision(type, { name }, fullPath); }catch(_){ } }
// Select a specific item by full path, update focus and UI, and scroll into view
function select_item_by_path(wrap, fullPath){
  try{
    if (!wrap || !fullPath) return false;
    const li = wrap.querySelector('li[data-fullpath="' + String(fullPath).replace(/"/g,'\\"') + '"]');
    if (!li) return false;
    const idx = parseInt(li.getAttribute('data-index')||'0',10);
    sel_replace([fullPath]);
    window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
    update_selection_ui(wrap);
    try{ li.scrollIntoView && li.scrollIntoView({ block:'nearest' }); }catch(_){ }
    return true;
  }catch(_){ return false; }
}
function nav_open_focused_or_selected(wrap, listing, opts){
  try{
    const nodes = wrap.querySelectorAll('li[data-index]'); if (!nodes || !nodes.length) return;
    let focus = (window.__auv3_selection.focus==null) ? null : window.__auv3_selection.focus;
    if (focus == null) {
      const selected = sel_list();
      if (selected && selected.length) {
        const first = selected[0];
        for (let i = 0; i < nodes.length; i++) { if (nodes[i].getAttribute('data-fullpath') === first) { focus = i; break; } }
      }
    }
    if (focus == null) return;
    const li = wrap.querySelector(`li[data-index="${focus}"]`); if (!li) return;
    const fullPath = li.getAttribute('data-fullpath'); const isDir = li.getAttribute('data-isdir') === '1';
    if (isDir) {
      const name = (fullPath||'').split('/').pop()||'';
      if (opts && typeof opts.onFolderClick === 'function') { opts.onFolderClick({ name, isDirectory:true }, fullPath); }
      else { nav_enter_folder(fullPath); }
    } else { nav_preview_file_by_name(fullPath); }
  }catch(_){ }
}
function nav_delete_item_path(fullPath, listing){ try{ request_delete_selection_or_item(fullPath, listing); }catch(_){ } }
function nav_copy_selection_to_clipboard(fullPath){ try{ copy_selection_or_item(fullPath); }catch(_){ } }
function nav_paste_clipboard_to_current(listing){ try{ paste_into_current_folder(listing); }catch(_){ } }
function nav_select_all(wrap){
  try{
    const nodes = wrap.querySelectorAll('li[data-fullpath]');
    const all = []; nodes.forEach((li)=>{ const fp = li.getAttribute('data-fullpath'); if (fp) all.push(fp); });
    sel_replace(all); update_selection_ui(wrap);
  }catch(_){ }
}
function nav_create_folder(listing){
  try{
  const FS = window.AtomeFileSystem || {};
  window.__recent_creations = window.__recent_creations || new Set();
  const base = 'New folder';
  const name = pick_unique_name(listing.path, base, true);
  const path = path_join(listing.path, name);
    const cb = ()=>{
      try{
  const opts = Object.assign({}, nav_context().opts||{}, { startInlineRename: { path } });
  fs_end(350);
  navigate_auv3_refresh(listing.path, nav_context().target, opts);
      }catch(_){ }
    };
  try{ window.__recent_creations.add(name); setTimeout(()=>{ try{ window.__recent_creations.delete(name); }catch(_){ } }, 5000); }catch(_){ }
  fs_begin(800);
  if (typeof FS.createDirectory === 'function') { FS.createDirectory(path, cb); return; }
  if (typeof FS.mkdir === 'function') { FS.mkdir(path, cb); return; }
  if (typeof FS.createFolder === 'function') { FS.createFolder(path, cb); return; }
  if (typeof FS.makeDir === 'function') { FS.makeDir(path, cb); return; }
  fs_end(0);
    console.warn('createDirectory indisponible');
  }catch(_){ }
}
function nav_create_file(listing){
  try{
  const FS = window.AtomeFileSystem || {};
  window.__recent_creations = window.__recent_creations || new Set();
  const base = 'New file.txt';
  const name = pick_unique_name(listing.path, base, false);
  const full = path_join(listing.path, name);
    const cb = ()=>{
      try{
  const opts = Object.assign({}, nav_context().opts||{}, { startInlineRename: { path: full } });
  fs_end(350);
  navigate_auv3_refresh(listing.path, nav_context().target, opts);
      }catch(_){ }
    };
    const empty = '';
  try{ window.__recent_creations.add(name); setTimeout(()=>{ try{ window.__recent_creations.delete(name); }catch(_){ } }, 5000); }catch(_){ }
  fs_begin(800);
  if (typeof FS.saveFile === 'function') { FS.saveFile(full, empty, cb); return; }
  if (typeof FS.writeFile === 'function') { FS.writeFile(full, empty, cb); return; }
  fs_end(0);
    console.warn('saveFile/writeFile indisponible');
  }catch(_){ }
}

// Generic document creation API (file or folder) with optional explicit name
function create_apple_document(kind = 'file', name = null){
  try{
    const listing = window.__auv3_last_listing || { path: (window.__auv3_browser_state && window.__auv3_browser_state.path) || '.' };
    const FS = window.AtomeFileSystem || {};
    const isFolder = (String(kind).toLowerCase() === 'folder' || String(kind).toLowerCase() === 'dir' || String(kind).toLowerCase() === 'directory');
    let baseName;
    if (name && typeof name === 'string') { baseName = name.trim(); }
    if (!baseName || !baseName.length) {
      baseName = isFolder ? 'New folder' : 'New file.txt';
    } else if (!isFolder && baseName.indexOf('.') < 0) {
      baseName = baseName + '.txt';
    }
  window.__recent_creations = window.__recent_creations || new Set();
  const candidate = pick_unique_name(listing.path, baseName, isFolder);
    const dest = path_join(listing.path, candidate);
    const once = (function(){ let called=false; return (fn)=>{ if (called) return; called=true; try{ fn&&fn(); }catch(_){ } }; })();
    const post = ()=>{
      try{
        setTimeout(()=>{ try{ window.__recent_creations.delete(candidate); }catch(_){ } }, 3000);
      }catch(_){ }
      const opts = Object.assign({}, nav_context().opts||{}, { startInlineRename: { path: dest } });
      fs_end(350);
      navigate_auv3_refresh(listing.path, nav_context().target, opts);
    };
  try{ window.__recent_creations.add(candidate); }catch(_){ }
    fs_begin(800);
    if (isFolder) {
      if (typeof FS.createDirectory === 'function') return FS.createDirectory(dest, ()=>once(post));
      if (typeof FS.mkdir === 'function') return FS.mkdir(dest, ()=>once(post));
      if (typeof FS.createFolder === 'function') return FS.createFolder(dest, ()=>once(post));
      if (typeof FS.makeDir === 'function') return FS.makeDir(dest, ()=>once(post));
      fs_end(0); console.warn('createDirectory indisponible');
      return;
    }
    const empty = '';
    if (typeof FS.saveFile === 'function') return FS.saveFile(dest, empty, ()=>once(post));
    if (typeof FS.writeFile === 'function') return FS.writeFile(dest, empty, ()=>once(post));
    fs_end(0); console.warn('saveFile/writeFile indisponible');
  }catch(e){ console.warn('create_apple_document error', e); }
}

// Programmatic inline rename of the current or specified item
function rename_apple_document(pathOrName = null){
  try{
    const listing = window.__auv3_last_listing || { path: (window.__auv3_browser_state && window.__auv3_browser_state.path) || '.' };
    let fullPath = null;
    if (pathOrName && pathOrName.indexOf('/') >= 0) { fullPath = pathOrName; }
    else if (pathOrName && typeof pathOrName === 'string') { fullPath = path_join(listing.path, pathOrName); }
    else {
      const wrap = document.getElementById('auv3-file-list');
      const nodes = wrap ? wrap.querySelectorAll('li[data-index]') : [];
      let focus = (window.__auv3_selection && window.__auv3_selection.focus!=null) ? window.__auv3_selection.focus : null;
      if (focus==null && window.__auv3_selection) {
        const sel = Array.from(window.__auv3_selection.set||[]);
        if (sel && sel.length) fullPath = sel[0];
      }
      if (focus!=null && nodes && nodes.length) {
        const li = wrap.querySelector('li[data-index="'+String(focus)+'"]');
        if (li) fullPath = li.getAttribute('data-fullpath');
      }
      if (!fullPath && nodes && nodes.length) {
        fullPath = nodes[0].getAttribute('data-fullpath');
      }
    }
  if (!fullPath) return;
  const wrap = document.getElementById('auv3-file-list');
  const exists = wrap && wrap.querySelector('li[data-fullpath="' + String(fullPath).replace(/"/g,'\\"') + '"]');
    if (!exists) {
      const opts = Object.assign({}, nav_context().opts||{}, { startInlineRename: { path: fullPath } });
      return navigate_auv3_refresh(listing.path, nav_context().target, opts);
    }
  try{ select_item_by_path(wrap, fullPath); }catch(_){ }
  setTimeout(()=>{ try{ edit_filer_element(listing, fullPath); }catch(_){ } }, 0);
  }catch(e){ console.warn('rename_apple_document error', e); }
}
// expose public APIs
window.create_apple_document = window.create_apple_document || create_apple_document;
window.rename_apple_document = window.rename_apple_document || rename_apple_document;
// ------------------------------
// End Navigator helpers
// ------------------------------


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
        // If the browser panel is currently visible, refresh it
        try {
          const st = window.__auv3_browser_state;
          if (st && st.target) {
            const host = document.querySelector(st.target);
            if (host && host.querySelector('#auv3-file-list')) {
              try{ fs_begin(900); }catch(_){ }
              try{ if (res && (res.success===undefined || res.success===true)) { fs_end(400); navigate_auv3_refresh(dest, st.target, st.opts); } else { fs_end(0); } }catch(_){ try{ fs_end(0); }catch(__){} }
            }
          }
        } catch(_){ }
      }
    };

    window.AtomeFileSystem.copy_to_ios_local(dest, types, onDone);
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
        li.style.backgroundColor = UI.colors.selectionBg;
        li.style.color = UI.colors.selectionText;
        if (dot) dot.style.color = UI.colors.selectionText;
        if (nameSpan) nameSpan.style.color = UI.colors.selectionText;
      } else {
        li.style.backgroundColor = '';
        li.style.color = '';
        if (isDir) {
          if (dot) dot.style.color = UI.colors.accent;
          if (nameSpan) nameSpan.style.color = UI.colors.folderName;
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

// Robust unique name picker that uses current listing, DOM, recent creations, and per-folder counters
function pick_unique_name(dirPath, baseName, isFolder){
  try{
    // Normalize inputs
    const path = dirPath || ((window.__auv3_browser_state && window.__auv3_browser_state.path) || '.');
    const last = window.__auv3_last_listing;
    const samePath = !!(last && last.path === path);
    // Collect existing names from latest listing when available
    const existing = new Set();
    if (samePath) {
      try { (last.folders||[]).forEach(f=> existing.add(String(f.name||''))); } catch(_){ }
      try { (last.files||[]).forEach(f=> existing.add(String(f.name||''))); } catch(_){ }
    }
    // Also union names currently rendered in DOM
    try{
      const wrap = document.getElementById('auv3-file-list');
      if (wrap) {
        const lis = wrap.querySelectorAll('li[data-fullpath] > span[data-role="name"]');
        lis && lis.forEach(span => { existing.add(String(span.textContent||'')); });
      }
    }catch(_){ }
    // Reserve set to avoid collisions before refresh
    try{ window.__recent_creations = window.__recent_creations || new Set(); }catch(_){ }
    // Per-folder counters to ensure monotonic suffixes even if listing is stale
    try{ window.__name_counters = window.__name_counters || {}; }catch(_){ }
    const counters = window.__name_counters;
    counters[path] = counters[path] || { roots: {} };
    const parts = String(baseName||'').split('.');
    let root = baseName;
    let ext = '';
    if (!isFolder) {
      if (parts.length > 1) { ext = '.' + parts.pop(); root = parts.join('.'); } else { root = baseName; ext = '.txt'; }
    }
    const key = isFolder ? (root+'|dir') : (root+'|'+ext);
    let idx = (counters[path].roots[key] || 2);
    // If base available and not reserved, use it, else increment
    let candidate = isFolder ? root : (root + ext);
    const exists = (name)=> existing.has(name) || (window.__recent_creations && window.__recent_creations.has(name));
    if (exists(candidate)) {
      // Start from planned counter idx
      while (exists(isFolder ? (root + ' ' + idx) : (root + ' ' + idx + ext))) { idx++; if (idx>999) break; }
      candidate = isFolder ? (root + ' ' + idx) : (root + ' ' + idx + ext);
      counters[path].roots[key] = idx + 1; // Next time continue from here
    } else {
      // Reserve base and set next idx to 3 (since base + ' 2' is next)
      counters[path].roots[key] = Math.max(idx, 3);
    }
    return candidate;
  }catch(e){
    // Fallback to baseName on any error
    return baseName;
  }
}

async function navigate_auv3(path='.', target='#view', opts=null){
  try{
    // Defensive: ensure no overlay blocks and guard isn't stuck
    try { hide_busy_overlay(); __FS_OP.active = false; __FS_OP.until = 0; } catch(_){ }
    const prevPath = (window.__auv3_browser_state && window.__auv3_browser_state.path) || null;
    window.__auv3_browser_state = { path, target, opts, visible: true };
    if (!prevPath || prevPath !== path) { try{ sel_clear(); }catch(_){ } }
  }catch(_){ window.__auv3_browser_state = { path, target, opts, visible: true }; }
  const t0 = Date.now();
  const listing = await get_auv3_files(path);
  try { window.__auv3_last_listing = listing; } catch(_){ }
  display_files(target, listing, opts);
  try { window.__auv3_last_display_ts = Date.now(); } catch(_){ }
}

function toggle_auv3_browser(target = '#view'){
  try{
    const st = window.__auv3_browser_state || { path: '.', target, opts: null, visible: false };
    const host = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!host) { console.warn('toggle_auv3_browser: target introuvable', target); return; }
  const panel = host.querySelector('#auv3-file-window') || host.querySelector('#auv3-file-list');
    if (panel) {
      panel.remove();
      window.__auv3_browser_state.visible = false;
      try { document.body && (document.body.style.overflow = ''); } catch(_){ }
      try { if (window.__auv3_doc_key_handler) { document.removeEventListener('keydown', window.__auv3_doc_key_handler, true); window.__auv3_doc_key_handler = null; } } catch(_){ }
  // Ensure overlay never blocks interactions after closing
  try { hide_busy_overlay(); __FS_OP.active = false; __FS_OP.until = 0; if (__FS_OP.navTimer) { clearTimeout(__FS_OP.navTimer); __FS_OP.navTimer = null; } } catch(_){ }
      return;
    }
    try { document.body && (document.body.style.overflow = 'hidden'); } catch(_){ }
  // Avoid re-opening while FS is settling
  const path = st.path || '.';
  if (fs_is_blocked()) { navigate_auv3_refresh(path, target, st.opts || {}); }
  else { navigate_auv3_refresh(path, target, st.opts || {}); }
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
      break;
    }
  } catch(_){ }
}
window.file_type_decision = window.file_type_decision || file_type_decision;

// Returns an object { path, folders:[{name,size,modified}], files:[{name,size,modified}] }
async function get_auv3_files(path = '.') {
  try {
    if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.listFiles !== 'function') {
  /* listFiles missing */
      return { path, folders: [], files: [] };
    }
    // Coalesce concurrent requests by path
    window.__auv3_list_inflight = window.__auv3_list_inflight || new Map();
    if (window.__auv3_list_inflight.has(path)) {
      try { return await window.__auv3_list_inflight.get(path); } catch(_){ /* ignore */ }
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

    // Single-call: callback-style (avoids duplicate IPC from probing for Promise support)
    const p = new Promise((resolve) => {
      try {
        window.AtomeFileSystem.listFiles(path, (res) => {
          // Swift bridge may wrap payload inside { success, data: <json|string> }
          let payload = res;
          try { if (typeof payload === 'string') { payload = JSON.parse(payload); } } catch(_){ }
          try { if (payload && typeof payload.data === 'string') { payload = { ...payload, data: JSON.parse(payload.data) }; } } catch(_){ }
          const arr = (payload && (payload.entries || payload.files || payload.items || (payload.data && payload.data.files) || payload)) || [];
          const { folders, files } = normalize(arr);
          resolve({ path, folders, files });
        });
      } catch(e) {
  /* listFiles callback error */
        resolve({ path, folders: [], files: [] });
      }
    });
    window.__auv3_list_inflight.set(path, p);
    return await p;
  } finally {
    try { window.__auv3_list_inflight && window.__auv3_list_inflight.delete(path); } catch(_){ }
  }
}

// --- Context menu helper (safe stub) ---
// Ensures first invocation of show_file_context_menu can close any previous menu
// without throwing when the specialized closer hasn't been installed yet.
function close_file_context_menu(){
  try{
    if (window.__file_menu_doc_close) {
      document.removeEventListener('mousedown', window.__file_menu_doc_close, true);
      document.removeEventListener('touchstart', window.__file_menu_doc_close, true);
      window.__file_menu_doc_close = null;
    }
  }catch(_){ }
  try{
    const m = document.getElementById('auv3-file-menu');
    if (m && m.remove) m.remove();
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
      backgroundColor: UI.colors.dialogBg, color: UI.colors.dialogText, border: '1px solid ' + UI.colors.border, borderRadius: '8px', padding: '12px', width: '280px', boxShadow: UI.shadows.dialog
    }});
    $('div', { parent: box, text: message || 'Confirmer ?', css: { marginBottom: '10px', fontSize: '13px' } });
    const row = $('div', { parent: box, css: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } });
  Button({ id:'cnf-cancel', onText:'Cancel', offText:'Cancel', onAction: ()=>{}, offAction: ()=>{}, parent: row, css: { height:'26px', padding:'0 10px', backgroundColor: UI.colors.confirmCancelBg, color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow: UI.shadows.small } });
  Button({ id:'cnf-ok', onText:'Delete', offText:'Delete', onAction: ()=>{}, offAction: ()=>{}, parent: row, css: { height:'26px', padding:'0 10px', backgroundColor: UI.colors.confirmOkBg, color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow: UI.shadows.small } });

    // Keyboard support: focus management and key handling
    const cancelBtn = (function(){ try{ return document.getElementById('cnf-cancel'); }catch(_){ return null; } })();
    const okBtn = (function(){ try{ return document.getElementById('cnf-ok'); }catch(_){ return null; } })();
    try{ cancelBtn && cancelBtn.setAttribute('tabindex', '0'); okBtn && okBtn.setAttribute('tabindex', '0'); }catch(_){ }

    // Visual focus indicator (make the chosen button color change clearly)
  const baseCancelBg = UI.colors.confirmCancelBg;
  const baseOkBg = UI.colors.confirmOkBg;
    function applyBaseStyles(){
      try{
        if (cancelBtn) { cancelBtn.style.backgroundColor = baseCancelBg; cancelBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,.6)'; cancelBtn.style.outline = 'none'; }
        if (okBtn) { okBtn.style.backgroundColor = baseOkBg; okBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,.6)'; okBtn.style.outline = 'none'; }
      }catch(_){ }
    }
    function applyFocusStyles(){
      try{
        applyBaseStyles();
        const active = document.activeElement;
        if (active === cancelBtn) {
          cancelBtn.style.backgroundColor = UI.colors.confirmCancelBgFocus;
          cancelBtn.style.boxShadow = '0 0 0 2px rgba(255,255,255,.22) inset, ' + UI.shadows.small;
        } else if (active === okBtn) {
          okBtn.style.backgroundColor = UI.colors.confirmOkBgFocus;
          okBtn.style.boxShadow = '0 0 0 2px rgba(255,255,255,.25) inset, ' + UI.shadows.small;
        }
      }catch(_){ }
    }

    function cleanup(){
      try{ document.removeEventListener('keydown', window.__auv3_confirm_key_handler, true); }catch(_){ }
      try{ document.removeEventListener('focusin', window.__auv3_confirm_focus_handler, true); }catch(_){ }
      try{ window.__auv3_confirm_key_handler = null; window.__auv3_confirm_focus_handler = null; }catch(_){ }
    }

    function closeAnd(cb){
      try{ overlay && overlay.remove && overlay.remove(); }catch(_){ }
      cleanup();
      try{ cb && cb(); }catch(_){ }
    }

    // Wire buttons with cleanup
    try {
      if (cancelBtn) {
        cancelBtn.onclick = ()=> closeAnd(()=> onCancel && onCancel(false));
      }
      if (okBtn) {
        okBtn.onclick = ()=> closeAnd(()=> onConfirm && onConfirm(true));
      }
    } catch(_){ }

    // Default focus to Cancel (safer) and apply highlight
    try{ setTimeout(()=>{ if (cancelBtn && cancelBtn.focus) { cancelBtn.focus(); applyFocusStyles(); } }, 0); }catch(_){ }

    // Keep highlight updated on focus/blur
    try{
      cancelBtn && cancelBtn.addEventListener('focus', applyFocusStyles, true);
      okBtn && okBtn.addEventListener('focus', applyFocusStyles, true);
      cancelBtn && cancelBtn.addEventListener('blur', applyFocusStyles, true);
      okBtn && okBtn.addEventListener('blur', applyFocusStyles, true);
    }catch(_){ }

    // Trap focus inside dialog
    window.__auv3_confirm_focus_handler = function(e){
      try{
        if (!overlay) return;
        if (!overlay.contains(e.target)) {
          e.stopPropagation();
          try{ cancelBtn && cancelBtn.focus && cancelBtn.focus(); }catch(_){ }
        }
      }catch(_){ }
    };
    try{ document.addEventListener('focusin', window.__auv3_confirm_focus_handler, true); }catch(_){ }

    // Keyboard navigation within dialog
    window.__auv3_confirm_key_handler = function(e){
      try{
        const key = e.key;
        if (!overlay) return;
        // Move between buttons
        if (key === 'Tab' || key === 'ArrowLeft' || key === 'ArrowRight'){
          applyFocusStyles();
          return;
        }
        // Prevent Backspace/Delete from leaking to global handlers (which would recreate the dialog)
        if (key === 'Backspace' || key === 'Delete') {
          e.preventDefault(); e.stopPropagation();
          return;
        }
        if (key === 'Escape' || key === 'Esc'){
          e.preventDefault(); e.stopPropagation();
          cancelBtn && cancelBtn.click && cancelBtn.click();
          return;
        }
      }catch(_){ }
    };
    try{ document.addEventListener('keydown', window.__auv3_confirm_key_handler, true); }catch(_){ }
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
    try{ fs_begin(900); }catch(_){ }
    window.AtomeFileSystem.copyFiles(dest, cb, (res)=>{
      try{ if (res && (res.success===undefined || res.success===true)) { fs_end(400); navigate_auv3_refresh(dest, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); } else { fs_end(0); } }catch(_){ try{ fs_end(0); }catch(__){} }
    });
  }catch(_){ }
}

function request_delete_selection_or_item(fullPath, listing){
  const arr = (function(){ const s = sel_list(); return (s && s.length) ? s : (fullPath ? [fullPath] : []); })();
  if (!arr.length) return;
  const FS = window.AtomeFileSystem || {};
  const delFile = (typeof FS.deleteFile === 'function') ? FS.deleteFile.bind(FS) : null;
  const delDir = (FS.deleteDirectory && typeof FS.deleteDirectory==='function') ? FS.deleteDirectory.bind(FS)
               : (FS.removeDirectory && typeof FS.removeDirectory==='function') ? FS.removeDirectory.bind(FS)
               : (FS.rmdir && typeof FS.rmdir==='function') ? FS.rmdir.bind(FS)
               : (FS.deleteFolder && typeof FS.deleteFolder==='function') ? FS.deleteFolder.bind(FS)
               : (FS.removeFolder && typeof FS.removeFolder==='function') ? FS.removeFolder.bind(FS)
               : null;
  if (!delFile && !delDir) { console.warn('Aucune API de suppression disponible'); return; }
  // Build quick lookup sets from listing to know which paths are directories
  const dirSet = new Set(((listing&&listing.folders)||[]).map(f=> path_join(listing.path, String(f.name||''))));
  let i = 0;
  const next = ()=>{
  if (i >= arr.length) { try{ fs_end(350); navigate_auv3_refresh(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }catch(_){ } return; }
    const p = arr[i++];
    const isDir = dirSet.has(p);
    try{
      fs_begin(700);
      if (isDir && delDir) {
        try { delDir(p, ()=>{ next(); }); } catch(_){ next(); }
      } else if (delFile) {
        try { delFile(p, ()=>{ next(); }); } catch(_){ next(); }
      } else {
        next();
      }
    }catch(_){ next(); }
  };
  next();
}

// Use native batch delete when multiple are selected for atomic behavior
function nav_delete_selection(listing){
  try{
    const sel = sel_list();
    if (!sel || !sel.length) return;
    if (window.AtomeFileSystem && typeof window.AtomeFileSystem.deleteMultiple==='function' && sel.length>1) {
      try{ fs_begin(800); }catch(_){ }
      window.AtomeFileSystem.deleteMultiple(sel, (res)=>{
        try{ if (res && (res.success===undefined || res.success===true)) { fs_end(400); navigate_auv3_refresh(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); } else { fs_end(0); } }catch(_){ try{ fs_end(0); }catch(__){} }
      });
      return;
    }
  }catch(_){ }
  // Fallback to previous per-item path
  try{ request_delete_selection_or_item(null, listing); }catch(_){ }
}

// Force-delete a specific path, ignoring current selection. Useful for context menu on unselected items.
function request_delete_exact(fullPath, listing){
  try{
    if (!fullPath) return;
    const FS = window.AtomeFileSystem || {};
    const delFile = (typeof FS.deleteFile === 'function') ? FS.deleteFile.bind(FS) : null;
    const delDir = (FS.deleteDirectory && typeof FS.deleteDirectory==='function') ? FS.deleteDirectory.bind(FS)
                 : (FS.removeDirectory && typeof FS.removeDirectory==='function') ? FS.removeDirectory.bind(FS)
                 : (FS.rmdir && typeof FS.rmdir==='function') ? FS.rmdir.bind(FS)
                 : (FS.deleteFolder && typeof FS.deleteFolder==='function') ? FS.deleteFolder.bind(FS)
                 : (FS.removeFolder && typeof FS.removeFolder==='function') ? FS.removeFolder.bind(FS)
                 : null;
    if (!delFile && !delDir) { console.warn('Aucune API de suppression disponible'); return; }
    const isDir = !!(((listing&&listing.folders)||[]).find(f=> path_join(listing.path, String(f.name||'')) === fullPath));
    fs_begin(700);
    const done = ()=>{ try{ fs_end(350); navigate_auv3_refresh(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }catch(_){ try{ fs_end(0); }catch(__){} } };
    if (isDir && delDir) { try{ delDir(fullPath, done); }catch(_){ done(); } return; }
    if (delFile) { try{ delFile(fullPath, done); }catch(_){ done(); } return; }
    done();
  }catch(_){ }
}

function request_delete_file(fullPath, li, listing){
  if (!window.AtomeFileSystem || typeof window.AtomeFileSystem.deleteFile !== 'function') {
    console.warn('AtomeFileSystem.deleteFile indisponible');
    return;
  }
  try {
  fs_begin(700);
  window.AtomeFileSystem.deleteFile(fullPath, (res)=>{
      if (res && (res.success === undefined || res.success === true)) {
    try { fs_end(350); navigate_auv3_refresh(listing.path, window.__auv3_browser_state.target, window.__auv3_browser_state.opts); }
        catch(_){ try{ li && li.remove && li.remove(); }catch(__){} }
      } else {
        console.warn('Suppression échouée', res && res.error);
    try{ fs_end(0); }catch(_){ }
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
    backgroundColor: UI.colors.dialogBg,
    color: UI.colors.dialogText,
    border: '1px solid ' + UI.colors.border,
    borderRadius: '8px',
    padding: '6px',
    boxShadow: UI.shadows.menu
      }
    });

    // Title
    $('div', { parent: menu, text: fileItem && fileItem.name ? fileItem.name : 'Fichier', css: { fontSize: '11px', color: '#9db2cc', marginBottom: '6px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });

  // Copy action
    Button({
      id: 'auv3-menu-copy', onText: 'Copy', offText: 'Copy',
      onAction: ()=>{ nav_copy_selection_to_clipboard(fullPath); close_file_context_menu(); },
      offAction: ()=>{ nav_copy_selection_to_clipboard(fullPath); close_file_context_menu(); },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: UI.colors.buttonPrimary, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Paste action
    Button({
      id: 'auv3-menu-paste', onText: 'Paste', offText: 'Paste',
      onAction: ()=>{ nav_paste_clipboard_to_current(listing); close_file_context_menu(); },
      offAction: ()=>{ nav_paste_clipboard_to_current(listing); close_file_context_menu(); },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: UI.colors.buttonSuccess, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Paste action (already above)

    // Select All
    Button({
      id: 'auv3-menu-selectall', onText: 'Select all', offText: 'Select all',
      onAction: ()=>{ try{ const wrap = document.getElementById('auv3-file-list'); wrap && nav_select_all(wrap); }finally{ close_file_context_menu(); } },
      offAction: ()=>{ try{ const wrap = document.getElementById('auv3-file-list'); wrap && nav_select_all(wrap); }finally{ close_file_context_menu(); } },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: UI.colors.headerText, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Create Folder
    Button({
      id: 'auv3-menu-mkdir', onText: 'New folder', offText: 'New folder',
      onAction: ()=>{ nav_create_folder(listing); close_file_context_menu(); },
      offAction: ()=>{ nav_create_folder(listing); close_file_context_menu(); },
      parent: menu,
      css: { width: '110px', height: '24px', color: '#fff', backgroundColor: UI.colors.buttonSuccess, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Create File
    Button({
      id: 'auv3-menu-touch', onText: 'New file', offText: 'New file',
      onAction: ()=>{ nav_create_file(listing); close_file_context_menu(); },
      offAction: ()=>{ nav_create_file(listing); close_file_context_menu(); },
      parent: menu,
      css: { width: '110px', height: '24px', color: '#fff', backgroundColor: UI.colors.buttonPrimary, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Rename action
    Button({
      id: 'auv3-menu-rename', onText: 'Rename', offText: 'Rename',
      onAction: ()=>{ try{ if (fullPath) { const wrap = document.getElementById('auv3-file-list'); try{ select_item_by_path(wrap, fullPath); }catch(_){ } setTimeout(()=>{ try{ edit_filer_element(listing, fullPath); }catch(_){ } }, 0); } }finally{ close_file_context_menu(); } },
      offAction: ()=>{ try{ if (fullPath) { const wrap = document.getElementById('auv3-file-list'); try{ select_item_by_path(wrap, fullPath); }catch(_){ } setTimeout(()=>{ try{ edit_filer_element(listing, fullPath); }catch(_){ } }, 0); } }finally{ close_file_context_menu(); } },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: UI.colors.headerText, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small, marginBottom: '6px' }
    });

    // Delete action
    Button({
      id: 'auv3-menu-delete', onText: 'Delete', offText: 'Delete',
      onAction: ()=>{
  const sel = sel_list();
  const targetIsMulti = sel && sel.length>1; // always honor multi-selection
  if (targetIsMulti) {
          const msg = 'Supprimer ' + sel.length + ' éléments ?';
          show_confirm_dialog(msg, ()=>{ nav_delete_selection(listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
        } else {
          const base = (fullPath||'').split('/').pop()||'cet élément';
          show_confirm_dialog('Supprimer « ' + base + ' » ?', ()=>{ request_delete_exact(fullPath, listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
        }
      },
      offAction: ()=>{
  const sel = sel_list();
  const targetIsMulti = sel && sel.length>1; // always honor multi-selection
  if (targetIsMulti) {
          const msg = 'Supprimer ' + sel.length + ' éléments ?';
          show_confirm_dialog(msg, ()=>{ nav_delete_selection(listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
        } else {
          const base = (fullPath||'').split('/').pop()||'cet élément';
          show_confirm_dialog('Supprimer « ' + base + ' » ?', ()=>{ request_delete_exact(fullPath, listing); close_file_context_menu(); }, ()=>{ close_file_context_menu(); });
        }
      },
      parent: menu,
      css: { width: '96px', height: '24px', color: '#fff', backgroundColor: UI.colors.danger, border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: UI.shadows.small }
    });

    // Outside click to close
    // Keyboard navigation in menu (Left/Right/Tab to cycle, Enter to activate, Esc to close)
    const focusables = function(){ return Array.prototype.slice.call(menu.querySelectorAll('button')); };
    function menuFocus(idx){ const arr = focusables(); if (!arr.length) return; const i = (idx+arr.length)%arr.length; try{ arr[i].focus(); }catch(_){ } }
    try{ setTimeout(()=>{ menuFocus(0); }, 0); }catch(_){ }

    function onMenuKey(e){
      try{
        const key = e.key; const arr = focusables(); if (!arr.length) return;
        if (key === 'Tab' || key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); const idx = arr.indexOf(document.activeElement); menuFocus((idx<0?0:idx+1)); return; }
        if (key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const idx = arr.indexOf(document.activeElement); menuFocus((idx<0?arr.length-1:idx-1)); return; }
        if (key === 'Enter' || key === ' ') { e.preventDefault(); e.stopPropagation(); const a = document.activeElement; a && a.click && a.click(); return; }
        if (key === 'Escape' || key === 'Esc') { e.preventDefault(); e.stopPropagation(); close_file_context_menu(); return; }
        if (key === 'Backspace' || key === 'Delete') { e.preventDefault(); e.stopPropagation(); return; }
      }catch(_){ }
    }
    document.addEventListener('keydown', onMenuKey, true);

    window.__file_menu_doc_close = function(ev){
      try{
        const m = document.getElementById('auv3-file-menu');
        if (!m) return;
        if (!m.contains(ev.target)) close_file_context_menu();
      }catch(_){ }
    };
    document.addEventListener('mousedown', window.__file_menu_doc_close, true);
    document.addEventListener('touchstart', window.__file_menu_doc_close, true);

    // Ensure cleanup of the key handler when menu closes
    const oldClose = close_file_context_menu;
    close_file_context_menu = function(){ try{ document.removeEventListener('keydown', onMenuKey, true); }catch(_){ } try{ window.__file_menu_doc_close && document.removeEventListener('mousedown', window.__file_menu_doc_close, true); }catch(_){ } try{ window.__file_menu_doc_close && document.removeEventListener('touchstart', window.__file_menu_doc_close, true); }catch(_){ } window.__file_menu_doc_close = null; try{ const m = document.getElementById('auv3-file-menu'); m && m.remove(); }catch(_){ } };
  }catch(e){ console.warn('show_file_context_menu error', e); }
}

// Open menu at arbitrary position (for empty area or global triggers)
function open_file_menu_at(x, y, fileItem, fullPath, listing){
  try{
    close_file_context_menu();
    const left = Math.min(window.innerWidth - 160, Math.max(8, x));
    const top = Math.min(window.innerHeight - 60, Math.max(8, y));
    // Create a temporary anchor
    const anchor = $('div', { parent: document.body, css: { position:'fixed', left: left+'px', top: top+'px', width:'1px', height:'1px', pointerEvents:'none', opacity:'0' } });
    show_file_context_menu(anchor, fileItem, fullPath, listing);
    try{ setTimeout(()=>{ anchor && anchor.remove && anchor.remove(); }, 0); }catch(_){ }
  }catch(e){ console.warn('open_file_menu_at error', e); }
}

// Render a skinnable, navigable list into target using Squirrel components
function display_files(target, listing, opts = {}) {
  try {
    const host = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!host) { console.warn('display_files: target introuvable', target); return; }

    // Defensive: close any open context menu and confirm dialog from previous view to avoid lingering listeners
    try { close_file_context_menu(); } catch(_){ }
    try {
      if (window.__auv3_confirm_key_handler) { document.removeEventListener('keydown', window.__auv3_confirm_key_handler, true); }
      if (window.__auv3_confirm_focus_handler) { document.removeEventListener('focusin', window.__auv3_confirm_focus_handler, true); }
      window.__auv3_confirm_key_handler = null; window.__auv3_confirm_focus_handler = null;
      const prevDlg = document.getElementById('auv3-confirm'); if (prevDlg) prevDlg.remove();
    } catch(_) { }

  // Remove previous container if any
  const prevWin = host.querySelector('#auv3-file-window'); if (prevWin) prevWin.remove();
  // Ensure any busy overlay from previous FS operation is removed and guard is released
  try { hide_busy_overlay(); __FS_OP.active = false; __FS_OP.until = 0; } catch(_){ }
    const defaults = {
      container: { marginTop: UI.layout.containerMarginTop, backgroundColor: UI.colors.bgContainer, border: '1px solid ' + UI.colors.border, borderRadius: UI.buttons.radius, padding: UI.layout.containerPadding, color: UI.colors.text, fontFamily: UI.typography.fontFamily, fontSize: UI.typography.fontSize, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
      header: { marginBottom: '6px', color: UI.colors.headerText, display: 'flex', alignItems: 'center', gap: UI.layout.headerGap, userSelect: 'none', WebkitUserSelect: 'none' },
      crumb: { color: UI.colors.accent, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' },
      sectionTitle: { margin: '6px 0 2px 0', color: UI.colors.accent, userSelect: 'none', WebkitUserSelect: 'none' },
      list: { margin: '0', paddingLeft: UI.layout.listPaddingLeft, userSelect: 'none', WebkitUserSelect: 'none', listStyle: 'none' },
      item: { cursor: 'pointer', padding: UI.layout.itemPadding, lineHeight: UI.typography.lineHeight, userSelect: 'none', WebkitUserSelect: 'none' },
      upButton: { width: '40px', height: '20px', color: UI.colors.buttonText, backgroundColor: UI.colors.buttonBg, borderRadius: '4px', position: 'relative', border: 'none', cursor: 'pointer', boxShadow: UI.shadows.button }
    };



    const theme = opts.css || {};

  // Floating window + inner container
  const WSTATE = (window.__AUV3_WIN_STATE = window.__AUV3_WIN_STATE || { left: '10%', top: '10%', width: '80%', height: '70%' });
  const win = $('div', { id: 'auv3-file-window', parent: host, css: { position: 'absolute', left: WSTATE.left, top: WSTATE.top, width: WSTATE.width, height: WSTATE.height, backgroundColor: 'transparent', zIndex: '9000' } });
  const wrap = $('div', { id: 'auv3-file-list', parent: win, css: { ...defaults.container, ...theme.container, position: 'relative', overscrollBehavior: 'contain', touchAction: 'pan-y', height: '100%', boxSizing: 'border-box', overflowX: 'hidden', overflowY: 'auto', paddingBottom: '24px' } });
    try { wrap.setAttribute('tabindex','0'); } catch(_){ }
    // Block browser text selection and drag in the file list area
    // Ensure any busy overlay from previous FS operation is removed and guard is released
    try { hide_busy_overlay(); __FS_OP.active = false; __FS_OP.until = 0; } catch(_){ }
    try {
      wrap.addEventListener('selectstart', function(e){
        // Allow selection; only block while the window is being dragged
        try { if (window.__AUV3_WIN_DRAG === true) { e.preventDefault(); } } catch(_) { }
      }, true);
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

  // Header with controls and breadcrumbs (also acts as drag handle)
  const header = $('div', { parent: wrap, css: { ...defaults.header, ...theme.header, cursor: 'move' } });
  // Drag handling
  try{
    let dragging=false, sx=0, sy=0, startLeft=0, startTop=0;
    const canStart = (ev)=>{ const t = ev.target; return !(t && t.closest && (t.closest('button')||t.closest('input')||t.closest('textarea')||t.closest('#auv3-file-menu'))); };
    header.addEventListener('pointerdown', (ev)=>{
      if (!canStart(ev)) return;
  dragging = true; try{ window.__AUV3_WIN_DRAG = true; }catch(_){ }
  const r = win.getBoundingClientRect(); sx = ev.clientX||0; sy = ev.clientY||0; startLeft=r.left; startTop=r.top; ev.preventDefault();
    });
    window.addEventListener('pointermove', (ev)=>{
      if (!dragging) return;
      const dx=(ev.clientX||0)-sx, dy=(ev.clientY||0)-sy;
      const hb=host.getBoundingClientRect(); const wb=win.getBoundingClientRect();
      let left = startLeft + dx; let top = startTop + dy;
      left = Math.max(hb.left, Math.min(left, hb.right - wb.width));
      top = Math.max(hb.top, Math.min(top, hb.bottom - wb.height));
      const pctL=((left-hb.left)/hb.width)*100, pctT=((top-hb.top)/hb.height)*100;
      WSTATE.left=pctL.toFixed(2)+'%'; WSTATE.top=pctT.toFixed(2)+'%';
      win.style.left=WSTATE.left; win.style.top=WSTATE.top;
    });
  const stopDrag = ()=>{ dragging=false; try{ window.__AUV3_WIN_DRAG = false; }catch(_){ } };
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
  }catch(_){ }
  // Resizer grip (visible, touch-friendly)
  try{
  const grip = $('div', { parent: wrap, css: {
      position:'absolute', right:'6px', bottom:'6px', width:'18px', height:'18px',
      cursor:'nwse-resize', zIndex:'2', touchAction:'none',
      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.25) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.25) 75%, transparent 75%, transparent)',
      backgroundSize: '8px 8px', opacity:'0.8', borderRadius:'3px'
    }, title: 'Resize' });
    let resizing=false, sx=0, sy=0, startW=0, startH=0;
    grip.addEventListener('pointerdown', (ev)=>{
      try{ grip.setPointerCapture && grip.setPointerCapture(ev.pointerId); }catch(_){ }
      resizing=true; try{ window.__AUV3_WIN_RESIZE = true; }catch(_){ }
      const r=win.getBoundingClientRect(); sx=ev.clientX||0; sy=ev.clientY||0; startW=r.width; startH=r.height; ev.stopPropagation(); ev.preventDefault();
    });
    window.addEventListener('pointermove', (ev)=>{
      if (!resizing) return; ev.preventDefault();
      const dx=(ev.clientX||0)-sx, dy=(ev.clientY||0)-sy; const hb=host.getBoundingClientRect();
      let w=startW+dx, h=startH+dy; w=Math.max(240, Math.min(w, hb.width)); h=Math.max(180, Math.min(h, hb.height));
      const pctW=(w/hb.width)*100, pctH=(h/hb.height)*100; WSTATE.width=pctW.toFixed(2)+'%'; WSTATE.height=pctH.toFixed(2)+'%';
      win.style.width=WSTATE.width; win.style.height=WSTATE.height;
    });
    const stopResize = (ev)=>{ try{ grip.releasePointerCapture && grip.releasePointerCapture(ev.pointerId); }catch(_){ } resizing=false; try{ window.__AUV3_WIN_RESIZE = false; }catch(_){ } };
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }catch(_){ }

    // Shift-lock toggle
    const shiftBtn = Button({
      id:'btn-shift',
      onText: 'multi',
      offText: 'single',
      onAction: ()=>{ window.__auv3_selection.shiftLock = true; },
      offAction: ()=>{ window.__auv3_selection.shiftLock = false; },
      parent: header,
      css: { width: UI.buttons.sizeWide.width, height: UI.buttons.sizeWide.height, color: UI.colors.buttonText,
        borderRadius: UI.buttons.radius, backgroundColor: UI.colors.buttonBg, 
        border: 'none', cursor: 'pointer', boxShadow: UI.shadows.button,
        marginLeft: 'auto' // push this group to the right; import button stays immediately to the right
      }
    });

  const import_button = Button({
      id:'btn-import',
      onText: 'import',
      offText: 'import',
      onAction: ()=> nav_open_import(listing.path),
      offAction: ()=> nav_open_import(listing.path),
      parent: header,
  css: { width: UI.buttons.sizeMd.width, height: UI.buttons.sizeMd.height, color: UI.colors.buttonText, borderRadius: UI.buttons.radius, backgroundColor: UI.colors.buttonBg, border: 'none', cursor: 'pointer', transition: 'background-color 0.3s ease', boxShadow: UI.shadows.button }
    });
  // Current folder header above the list (click to go up)
  const currName = (function(){ const p = listing.path||'.'; if (p==='.'||p==='./') return '.'; const parts = p.split('/').filter(Boolean); return parts[parts.length-1] || '.'; })();
  const folderHead = $('div', { parent: wrap, css: { display:'flex', alignItems:'center', gap:'8px', margin:'6px 0 6px 0', userSelect:'none', WebkitUserSelect:'none' } });
  $('span', { parent: folderHead, text: '●', css: { color: UI.colors.accent, fontSize:'10px' } });
  $('span', { parent: folderHead, text: currName, css: { fontWeight:'bold', color: UI.colors.folderName, cursor:'pointer' }, onclick: ()=> nav_leave_folder(listing.path) });

  // Breadcrumbs removed: folder header now handles navigation up

    // Sections
    let __linearIndex = 0; const __indexToPath = [];
    const mkSection = (label, items, isDir) => {
      const sec = $('div', { parent: wrap });
      // Removed section title as requested
      const ul = $('ul', { parent: sec, css: { ...defaults.list, ...(theme.list||{}) } });
      try{ ul.setAttribute('data-section', isDir ? 'folders' : 'files'); }catch(_){ }
      (items || []).forEach((it) => {
        const fullPath = path_join(listing.path, it.name);
        let longPressFired = false;
        // Shared state for pointer cycle
        let shiftDownAtPointerDown = false;
        let dragging = false;
        let dragStarted = false;
        // Share long-press timer with drag handlers to avoid clearing selection during long-press
        let pressTimer = null; let startX=0, startY=0;
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
            if (dragStarted) { dragStarted = false; return; }
            const multiMode = !!(window.__auv3_selection && window.__auv3_selection.shiftLock);
            // In multi mode, treat clicks as selection (do not enter folders)
            const shift = multiMode || !!shiftDownAtPointerDown || is_shift_active(ev);
            if (isDir && !shift) {
              // Single-click folder open only when not in multi/shift mode
              if (opts && typeof opts.onFolderClick === 'function') opts.onFolderClick(it, fullPath);
              else nav_enter_folder(fullPath);
              return;
            }
            // Selection logic for both files and folders when shift/multi is active
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
          $('span', { parent: li, text: '●', css: { color: UI.colors.accent, fontSize:'10px', marginRight:'6px' }, 'data-role': 'dot' });
        }
        const nameSpan = create_editable_name_span(it.name);
        try { li.appendChild(nameSpan); } catch(_) { }
        try{
          // Single click on name: only select, no edit
          nameSpan.addEventListener('click', (ev)=>{
            ev.stopPropagation();
            const idx = parseInt(li.getAttribute('data-index')||'0',10);
            const multi = !!(window.__auv3_selection && window.__auv3_selection.shiftLock);
            try{
              if (multi) {
                if (sel_is_selected(fullPath)) sel_remove(fullPath); else sel_add(fullPath);
                window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
              } else {
                sel_replace([fullPath]);
                window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
              }
            }catch(_){ }
            try{ update_selection_ui(wrap); }catch(_){ }
          });
          // Long-press on name: start inline edit (not on the whole row)
          let nsTimer = null; let nsSX=0, nsSY=0;
          const nsStart = (e)=>{
            try{ e.stopPropagation(); }catch(_){ }
            if (window.__AUV3_WIN_DRAG || window.__AUV3_WIN_RESIZE) return;
            const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
            nsSX = pt.clientX||0; nsSY = pt.clientY||0;
            if (nsTimer) clearTimeout(nsTimer);
            nsTimer = setTimeout(()=>{
              longPressFired = true;
              try {
                const selected = sel_list();
                const count = (selected && selected.length) ? selected.length : 0;
                if (count > 0) {
                  // With an active selection, only open the context menu; do not modify selection
                  show_file_context_menu(li, it, fullPath, listing);
                } else {
                  // No selection: select this item and start inline edit
                  try{ sel_replace([fullPath]); window.__auv3_selection.focus = parseInt(li.getAttribute('data-index')||'0',10); update_selection_ui(wrap); }catch(_){ }
                  try{ edit_filer_element(listing, fullPath); }catch(_){ }
                }
              } catch(_) { }
            }, 450);
          };
          const nsMove = (e)=>{
            try{ e.stopPropagation(); }catch(_){ }
            if (!nsTimer) return;
            const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
            const dx = Math.abs((pt.clientX||0) - nsSX), dy = Math.abs((pt.clientY||0) - nsSY);
            if (dx > 8 || dy > 8) { clearTimeout(nsTimer); nsTimer=null; }
          };
          const nsCancel = (e)=>{ try{ e && e.stopPropagation && e.stopPropagation(); }catch(_){ } if (nsTimer) { clearTimeout(nsTimer); nsTimer=null; } };
          nameSpan.addEventListener('pointerdown', nsStart);
          nameSpan.addEventListener('pointermove', nsMove);
          nameSpan.addEventListener('pointerup', nsCancel);
          nameSpan.addEventListener('pointerleave', nsCancel);
          nameSpan.addEventListener('touchstart', nsStart, { passive:true });
          nameSpan.addEventListener('touchmove', nsMove, { passive:true });
          nameSpan.addEventListener('touchend', nsCancel);
          nameSpan.addEventListener('touchcancel', nsCancel);
        }catch(_){ }
        // Focus auto si dans les créations récentes
        try {
          if (window.__recent_creations && window.__recent_creations.has(it.name)) {
            setTimeout(() => {
              try {
                nameSpan.focus();
                const range = document.createRange();
                range.selectNodeContents(nameSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (_) {}
            }, 100);
          }
        } catch(_){}
        // Add delete icon for files only
        if (!isDir) {
          create_delete_button(li, (ev)=>{
            const selected = sel_list();
            const multi = selected && selected.length > 1; // always honor multi-selection
            if (multi) {
              const msg = 'Supprimer ' + selected.length + ' éléments ?';
              show_confirm_dialog(msg, ()=>{ nav_delete_selection(listing); }, ()=>{});
            } else {
              const base = (fullPath||'').split('/').pop() || 'cet élément';
              show_confirm_dialog('Supprimer « ' + base + ' » ?', ()=>{ request_delete_exact(fullPath, listing); }, ()=>{});
            }
          }, (theme.deleteButton||{}));
        }

        // Drag-to-select across items
        try{
          if (isDir) { /* no drag-to-select on directories */ throw new Error('skip-drag-setup'); }
          const startDrag = (e)=>{ if (e && e.buttons===1) { dragging = true; dragStarted = false; shiftDownAtPointerDown = is_shift_active(e); } };
          const ensureStartSelected = ()=>{
            if (!dragging || dragStarted) return;
            // If a long-press is pending, don't alter selection
            if (pressTimer) return;
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
          const start = (e)=>{
            if (window.__AUV3_WIN_DRAG || window.__AUV3_WIN_RESIZE) return;
            try{ close_file_context_menu(); }catch(_){ }
            const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
            startX = pt.clientX||0; startY = pt.clientY||0;
            if (pressTimer) { clearTimeout(pressTimer); }
            pressTimer = setTimeout(()=>{
              if (window.__AUV3_WIN_DRAG || window.__AUV3_WIN_RESIZE) return;
              // If long-press originated on the name, prefer inline edit instead of menu
              const t = e.target;
              longPressFired = true;
              try {
                const selected = sel_list();
                const count = (selected && selected.length) ? selected.length : 0;
                if (count > 0) {
                  // With an active selection, always open menu and keep selection unchanged
                  show_file_context_menu(li, it, fullPath, listing);
                  return;
                }
                if (t && t.closest && t.closest('span[data-role="name"]')) {
                  // No selection and press on name: start edit
                  try{ sel_replace([fullPath]); window.__auv3_selection.focus = parseInt(li.getAttribute('data-index')||'0',10); update_selection_ui(wrap); }catch(_){ }
                  try{ edit_filer_element(listing, fullPath); }catch(_){ }
                } else {
                  // No selection: open menu
                  show_file_context_menu(li, it, fullPath, listing);
                }
              } catch(_) { show_file_context_menu(li, it, fullPath, listing); }
            }, 450);
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
          // Right-click (mouse) to open context menu
          li.addEventListener('contextmenu', (e)=>{
            try{ e.preventDefault(); e.stopPropagation(); }catch(_){ }
            try{ close_file_context_menu(); }catch(_){ }
            // Select the item under cursor unless multi-selection is already active
            try{
              const multi = !!(window.__auv3_selection && window.__auv3_selection.shiftLock);
              if (!multi) {
                const idx = parseInt(li.getAttribute('data-index')||'0',10);
                sel_replace([fullPath]);
                window.__auv3_selection.anchor = idx; window.__auv3_selection.focus = idx;
                update_selection_ui(wrap);
              }
            }catch(_){ }
            try{ show_file_context_menu(li, it, fullPath, listing); }catch(_){ }
          });
        }catch(_){ }
      });
    };

    mkSection('Dossiers', (listing && listing.folders) || [], true);
    mkSection('Fichiers', (listing && listing.files) || [], false);

    // Auto-select the first item when entering a folder if nothing is selected
    try{
      const nodes = wrap.querySelectorAll('li[data-index]');
      if (nodes && nodes.length) {
        const hasSel = sel_list().length > 0;
        if (!hasSel) {
          const first = nodes[0];
          const fp = first.getAttribute('data-fullpath');
          if (fp) {
            sel_replace([fp]);
            window.__auv3_selection.anchor = 0; window.__auv3_selection.focus = 0;
            update_selection_ui(wrap);
          }
        }
      }
    }catch(_){ }

  // If requested, start inline rename on a specific item (newly created)
    try{
      const plan = opts && opts.startInlineRename;
      if (plan && plan.path) {
        // consume the plan to avoid re-entrancy loops
        try { delete opts.startInlineRename; } catch(_){ }
    try{ select_item_by_path(wrap, plan.path); }catch(_){ }
    setTimeout(()=>{ try{ select_item_by_path(wrap, plan.path); }catch(_){ } }, 50);
    setTimeout(()=>{ try{ edit_filer_element(listing, plan.path); }catch(_){ } }, 0);
    setTimeout(()=>{ try{ edit_filer_element(listing, plan.path); }catch(_){ } }, 120);
      }
    }catch(_){ }

    // Long-press on empty area opens the menu (for paste/select all/new)
    try{
      let emptyPressTimer = null; let sx=0, sy=0;
      const startEmpty = (e)=>{
        if (window.__AUV3_WIN_DRAG || window.__AUV3_WIN_RESIZE) return;
        const target = e.target;
        const isListContent = target && (target.closest && target.closest('li[data-fullpath]'));
        const onHeaderBtn = target && ((target.closest && target.closest('#btn-shift')) || (target.closest && target.closest('#btn-import')));
        if (isListContent || onHeaderBtn) return; // handled by item long-press / ignore header buttons
        const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
        sx = pt.clientX||0; sy = pt.clientY||0;
        if (emptyPressTimer) clearTimeout(emptyPressTimer);
        emptyPressTimer = setTimeout(()=>{ if (window.__AUV3_WIN_DRAG || window.__AUV3_WIN_RESIZE) return; open_file_menu_at(sx, sy, null, null, listing); }, 500);
      };
      const cancelEmpty = ()=>{ if (emptyPressTimer) { clearTimeout(emptyPressTimer); emptyPressTimer=null; } };
      wrap.addEventListener('pointerdown', startEmpty);
      wrap.addEventListener('pointerup', cancelEmpty);
      wrap.addEventListener('pointerleave', cancelEmpty);
      wrap.addEventListener('touchstart', startEmpty, { passive:true });
      wrap.addEventListener('touchend', cancelEmpty);
      wrap.addEventListener('touchcancel', cancelEmpty);
    }catch(_){ }

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
  if (isDir) { try { nav_enter_folder(fullPath); } catch(_) { nav_enter_folder(fullPath); } }
  else { try { nav_preview_file_by_name(fullPath); } catch(e2) { console.warn('enter key open error', e2); } }
    }

    function handleEscapeKey(e){
      e.preventDefault(); e.stopPropagation();
  try { nav_leave_folder(listing.path); } catch(_){ }
    }

    function handleDeleteKey(e){
      try{
        e.preventDefault(); e.stopPropagation();
        close_file_context_menu();
        const sel = sel_list();
        let targetPath = null;
        if (sel && sel.length) {
          // Multi or single selection
          const msg = sel.length > 1 ? ('Supprimer ' + sel.length + ' éléments ?') : ('Supprimer « ' + ((sel[0]||'').split('/').pop() || 'cet élément') + ' » ?');
          show_confirm_dialog(msg, ()=>{ nav_delete_selection(listing); }, ()=>{});
          return;
        }
        // No selection: use focused item if any
        const nodes = wrap.querySelectorAll('li[data-index]');
        let focus = (window.__auv3_selection.focus==null) ? null : window.__auv3_selection.focus;
        if (focus == null) return; // nothing to delete
        const li = wrap.querySelector(`li[data-index="${focus}"]`);
        if (!li) return;
        targetPath = li.getAttribute('data-fullpath');
    const base = (targetPath||'').split('/').pop() || 'cet élément';
  show_confirm_dialog('Supprimer « ' + base + ' » ?', ()=>{ request_delete_exact(targetPath, listing); }, ()=>{});
      }catch(_){ }
    }

    // Keyboard navigation with arrows; Shift extends selection. Enter opens folder or activates file. ESC navigates up.
    try{
      wrap.addEventListener('keydown', (e)=>{
        const key = e.key;
  if (key === 'ArrowDown' || key === 'ArrowUp') { handleArrowKey(e, key); return; }
        if (key === 'Enter') { handleEnterKey(e); return; }
        if (key === 'Escape' || key === 'Esc') { handleEscapeKey(e); return; }
  if (key === 'Delete' || key === 'Backspace') { handleDeleteKey(e); return; }
        if (key === ' ') {
          e.preventDefault(); e.stopPropagation();
          // Open menu at focused item or at center of list
          let targetLi = null;
          if (window.__auv3_selection.focus!=null) targetLi = wrap.querySelector(`li[data-index="${window.__auv3_selection.focus}"]`);
          const rect = (targetLi ? targetLi.getBoundingClientRect() : wrap.getBoundingClientRect());
          const cx = rect.left + Math.min(160, Math.max(8, rect.width/2));
          const cy = rect.top + 24; // below header or item
          open_file_menu_at(cx, cy, null, targetLi ? targetLi.getAttribute('data-fullpath') : null, listing);
          return;
        }
      });
    }catch(_){ }

    // Global key handler so arrows immediately control the file list, and ESC/Enter work even when focus is outside
    try {
      if (window.__auv3_doc_key_handler) { document.removeEventListener('keydown', window.__auv3_doc_key_handler, true); }
      window.__auv3_doc_key_handler = function(e){
        try{
          if (!window.__auv3_browser_state || !window.__auv3_browser_state.visible) return;
          const key = e.key;
          // Include Space so physical keyboards can open the context menu globally
          if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter' && key !== 'Escape' && key !== 'Esc' && key !== 'Delete' && key !== 'Backspace' && key !== ' ') return;
          const t = e.target;
          const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
          if (inEditable) return; // don't hijack typing
          if (!wrap || !document.body.contains(wrap)) return;
          // If a confirm dialog is open, pause all global handling so dialog owns keys
          if (document.getElementById('auv3-confirm')) return;
          if (key === 'ArrowDown' || key === 'ArrowUp') { handleArrowKey(e, key); return; }
          if (key === 'Enter') { handleEnterKey(e); return; }
          if (key === 'Escape' || key === 'Esc') { handleEscapeKey(e); return; }
          if (key === 'Delete' || key === 'Backspace') { handleDeleteKey(e); return; }
          if (key === ' ') {
            e.preventDefault(); e.stopPropagation();
            // Open menu at focused item or near the list center
            let targetLi = null;
            if (window.__auv3_selection.focus!=null) targetLi = wrap.querySelector('li[data-index="' + String(window.__auv3_selection.focus) + '"]');
            const rect = (targetLi ? targetLi.getBoundingClientRect() : wrap.getBoundingClientRect());
            const cx = rect.left + Math.min(160, Math.max(8, rect.width/2));
            const cy = rect.top + 24;
            open_file_menu_at(cx, cy, null, targetLi ? targetLi.getAttribute('data-fullpath') : null, listing);
            return;
          }
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

