// File editing helpers for create/rename with iOS-friendly inline editing
// All DOM creation uses Squirrel's $ helper per project conventions.

(function(){
  'use strict';

  // Simple POSIX-like join (keeps paths relative to storage root used by FileSystemBridge)
  function joinPath(base, name){
    base = (base || './').replace(/\\+/g, '/');
    if (!base || base === '.' || base === './') base = './';
    if (base.endsWith('/')) return base + name;
    return base + '/' + name;
  }

  // Resolve asset path that works with atome:/// custom scheme and file URLs
  function resolveAssetPath(rel){
    try {
      // If already absolute atome scheme, keep it
      if (/^atome:\/\//.test(rel)) return rel;
      // If current doc is served from atome:///src/... then relative paths work
      const proto = (window.location && window.location.protocol) || '';
      if (proto.indexOf('atome') === 0 || proto === 'file:') {
        return rel.replace(/^\.\//, ''); // keep relative from src/index.html base
      }
    } catch(_){}
    // Fallback absolute atome path from src/
    return 'atome:///src/' + rel.replace(/^\.\//, '');
  }

  // Expose a global icon map override so red squares get the correct URL
  window.ATOME_ICONS = window.ATOME_ICONS || {};
  window.ATOME_ICONS.delete = resolveAssetPath('./assets/images/icons/delete.svg');

  // Try to fix any existing delete icons already in DOM
  try {
    const nodes = document.querySelectorAll('[data-icon="delete"], img.icon-delete');
    nodes.forEach(function(n){
      if (n.tagName === 'IMG') {
        n.src = window.ATOME_ICONS.delete;
      } else {
        // e.g., background-image via style
        n.style.backgroundImage = 'url(\'' + window.ATOME_ICONS.delete + '\')';
      }
    });
  } catch(_){}

  // Force-show iOS keyboard reliably: focus contentEditable; if it fails, use a hidden input then refocus.
  function ensureIOSKeyboard(target){
    try {
      target.focus();
      // Heuristic: if focus didn’t stick, use fallback input
      if (document.activeElement !== target) {
        const tmp = $('input', {
          id: 'tmp-keyboard-focus',
          css: {
            position: 'absolute',
            left: '-9999px',
            top: '0',
            opacity: '0',
            width: '1px',
            height: '1px'
          }
        });
        tmp.focus();
        setTimeout(function(){
          try { tmp.remove(); } catch(_) {}
          target.focus();
        }, 30);
      }
    } catch(_){}
  }

  // Temporarily allow text selection globally (robust against global user-select:none)
  function allowTextSelection(temp){
    const de = document.documentElement;
    const b = document.body;
    const prev = {
      deUserSelect: de && de.style.webkitUserSelect,
      bUserSelect: b && b.style.webkitUserSelect,
      deUserSelStd: de && de.style.userSelect,
      bUserSelStd: b && b.style.userSelect
    };
    if (temp) {
      if (de) { de.style.webkitUserSelect = 'text'; de.style.userSelect = 'text'; }
      if (b)  { b.style.webkitUserSelect = 'text'; b.style.userSelect = 'text'; }
    }
    return function restore(){
      if (de) { de.style.webkitUserSelect = prev.deUserSelect || ''; de.style.userSelect = prev.deUserSelStd || ''; }
      if (b)  { b.style.webkitUserSelect = prev.bUserSelect || ''; b.style.userSelect = prev.bUserSelStd || ''; }
    };
  }

  // Inject a temporary global style to force text selection and caret display
  function injectEditingStyle(){
    let styleEl = document.getElementById('atome-editing-style');
    if (styleEl) return styleEl;
    styleEl = $('style', {
      id: 'atome-editing-style',
      text: 'html,body,*,*::before,*::after{ -webkit-user-select:text !important; user-select:text !important; } [contenteditable="true"]{ -webkit-user-select:text !important; user-select:text !important; caret-color:auto; }'
    });
    return styleEl;
  }

  // Select all text inside a contentEditable element
  function selectAll(el){
    try {
      // Prefer text node selection when possible
      let range = document.createRange();
      const tn = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
      if (tn) {
        range.setStart(tn, 0);
        range.setEnd(tn, tn.textContent.length);
      } else {
        range.selectNodeContents(el);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand('selectAll', false, null); } catch(_){ }
    } catch(_){}
  }

  // Internal: core inline edit on a DOM element
  function inlineEditOnElement(el, opts, resolve){
    opts = opts || {};
      injectEditingStyle();
      const restore = allowTextSelection(true);
      el.setAttribute('contenteditable', 'true');
      el.spellcheck = false;
      el.autocapitalize = 'off';
      el.autocorrect = 'off';
      el.setAttribute('inputmode', 'text');
      // Make sure the target itself can select text
      try {
        el.style.webkitUserSelect = 'text';
        el.style.userSelect = 'text';
        el.style.webkitTouchCallout = 'default';
        el.style.caretColor = 'auto';
      } catch(_){}
      // Ensure it’s visible and focused
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch(_){}
      ensureIOSKeyboard(el);
      // Select all text (try multiple times to beat layout/paint timing)
      setTimeout(function(){ selectAll(el); }, 0);
      setTimeout(function(){ selectAll(el); }, 50);
      setTimeout(function(){ selectAll(el); }, 150);

      const onKey = function(ev){
        if (ev.key === 'Enter') {
          ev.preventDefault(); ev.stopPropagation();
          commit();
        } else if (ev.key === 'Escape') {
          ev.preventDefault(); ev.stopPropagation();
          cancel();
        }
      };
      const onBlur = function(){ if (opts.commitOnBlur !== false) commit(); };

      el.addEventListener('keydown', onKey, true);
      el.addEventListener('blur', onBlur, true);

      function cleanup(){
        el.removeEventListener('keydown', onKey, true);
        el.removeEventListener('blur', onBlur, true);
        el.setAttribute('contenteditable', 'false');
        try { restore(); } catch(_){ }
        // Remove global editing style if present
        try { const s = document.getElementById('atome-editing-style'); if (s) s.remove(); } catch(_){ }
      }
      function commit(){
        cleanup();
        const name = (el.textContent || '').trim();
        if (opts.onCommit) { try { opts.onCommit(name); } catch(_){} }
        resolve(name);
      }
      function cancel(){
        cleanup();
        if (opts.onCancel) { try { opts.onCancel(); } catch(_){} }
        resolve(false);
      }
  }

  // Helper: find list label span for a given fullPath
  function findListNameSpan(fullPath){
    try {
      const wrap = document.getElementById('auv3-file-list');
      if (!wrap) return null;
      const li = wrap.querySelector('li[data-fullpath="' + String(fullPath).replace(/"/g,'\\"') + '"]');
      if (!li) return null;
      return li.querySelector('span[data-role="name"]');
    } catch(_) { return null; }
  }

  // Public: put an element in inline edit mode (overloaded API)
  // - edit_filer_element(element, opts)
  // - edit_filer_element(listing, fullPath)
  // - edit_filer_element(fullPath)
  window.edit_filer_element = function(a, b){
    // Case 1: direct element
    if (a && a.nodeType === 1) {
      const el = a; const opts = b || {};
      return new Promise(function(resolve){ inlineEditOnElement(el, opts, resolve); });
    }
    // Case 2: listing + fullPath
    if (a && typeof a === 'object' && typeof b === 'string') {
      const listing = a; const fullPath = b;
      const el = findListNameSpan(fullPath);
      if (!el) {
        // If item not rendered yet, navigate with inline-rename request
        try {
          const ctx = (window.nav_context && window.nav_context()) || { target:'#view', opts:null };
          const opts = Object.assign({}, ctx.opts||{}, { startInlineRename: { path: fullPath } });
          if (typeof window.navigate_auv3_refresh === 'function') window.navigate_auv3_refresh(listing.path, ctx.target, opts);
        } catch(_){}
        return Promise.resolve(false);
      }
      return new Promise(function(resolve){ inlineEditOnElement(el, {}, resolve); });
    }
    // Case 3: fullPath only
    if (typeof a === 'string') {
      const el = findListNameSpan(a);
      if (!el) return Promise.resolve(false);
      return new Promise(function(resolve){ inlineEditOnElement(el, {}, resolve); });
    }
    return Promise.resolve(false);
  };

  // Create a new folder or file at current folder then enter rename mode
  window.create_apple_document = function(type, name, options){
    options = options || {};
    const base = options.basePath || window.__ATOME_CURRENT_FOLDER__ || './';
    let finalName = (name || '').trim();
    if (!finalName) finalName = (type === 'folder' ? 'New Folder' : 'New File.txt');
    if (type !== 'folder' && finalName.indexOf('.') === -1) finalName += '.txt';

    const fullPath = joinPath(base, finalName);
    const afterCreate = function(success){
      if (!success) return;
      // If a UI element is provided, we just edit it; otherwise create a temporary label using Squirrel
      let labelEl = options.labelElement;
      if (!labelEl) {
        labelEl = $('div', {
          id: 'temp-new-item-label',
          css: {
            position: 'fixed',
            left: '50%',
            top: '20%',
            transform: 'translateX(-50%)',
            backgroundColor: '#222',
            color: '#fff',
            padding: '8px 10px',
            borderRadius: '6px',
            zIndex: '99999'
          },
          text: finalName
        });
      }
      edit_filer_element(labelEl, {
        onCommit: function(newName){
          const newPath = joinPath(base, newName);
          if (newName && newName !== finalName) {
            rename_apple_document(fullPath, newPath, { refresh: options.refresh });
          } else if (options.refresh) { try { options.refresh(); } catch(_){} }
          // Remove temp label if we created it
          if (labelEl.id === 'temp-new-item-label') { try { labelEl.remove(); } catch(_){} }
        },
        onCancel: function(){
          if (labelEl.id === 'temp-new-item-label') { try { labelEl.remove(); } catch(_){} }
        }
      });
    };

    // Use AtomeFileSystem if available
    const FS = (window.AtomeFileSystem || null);
    if (type === 'folder') {
      if (FS && FS.createDirectory) {
        FS.createDirectory(fullPath, function(res){ afterCreate(res && res.success !== false); });
      } else {
        try { webkit.messageHandlers.fileSystem.postMessage({ action: 'createDirectory', path: fullPath }); afterCreate(true); } catch(_) { afterCreate(false); }
      }
    } else {
      // Create empty file
      if (FS && FS.saveFile) {
        FS.saveFile(fullPath, '', function(res){ afterCreate(res && res.success !== false); });
      } else {
        try { webkit.messageHandlers.fileSystem.postMessage({ action: 'saveFile', path: fullPath, data: '' }); afterCreate(true); } catch(_) { afterCreate(false); }
      }
    }
  };

  // Rename the currently selected item (paths relative to storage root)
  window.rename_apple_document = function(oldPath, newPathOrElement, options){
    options = options || {};
    // Overload: if second param is an element, go into inline edit to get new name
    if (newPathOrElement && newPathOrElement.nodeType === 1) {
      const el = newPathOrElement;
      return edit_filer_element(el, { onCommit: function(newName){
        if (!newName) return;
        const base = (oldPath || './').split('/').slice(0, -1).join('/') || './';
        const newPath = joinPath(base, newName);
        rename_apple_document(oldPath, newPath, options);
      }});
    }

    const newPath = newPathOrElement;
    const FS = (window.AtomeFileSystem || null);
    if (FS && FS.renameItem) {
      FS.renameItem(oldPath, newPath, function(res){
        if (options.refresh) { try { options.refresh(); } catch(_){} }
      });
    } else {
      try { webkit.messageHandlers.fileSystem.postMessage({ action: 'renameItem', oldPath: oldPath, newPath: newPath }); if (options.refresh) { options.refresh(); } } catch(_) {}
    }
  };

})();
