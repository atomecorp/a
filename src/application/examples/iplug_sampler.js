// Minimal audio double-click handler and UI helper
(function(){
	'use strict';

	function isAudioFileName(name){
		return /\.(m4a|wav|mp3|aif|caf)$/i.test(String(name||''));
	}

	// Create a visible div for the audio file (id and text = filename)
	function audio_load_handler(fullPath){
		try{
			var name = (fullPath||'').split('/').pop() || '';
			if (!name) return;
			var id = 'audio-' + name.replace(/[^a-z0-9\-_]/gi, '_');
			try { var prev = document.getElementById(id); if (prev && prev.remove) prev.remove(); } catch(_){}
			// Use the project's Squirrel $ helper to create the div (keeps styling consistent)
			try{
				$('div', {
					id: id,
					parent: document.body,
					css: {
						position: 'relative',
						backgroundColor: '#00f',
						left: '70px',
						top: '16px',
						padding: '12px',
						color: 'white',
						margin: '10px',
						display: 'inline-block'
					},
					text: name
				});
			}catch(e){
				// Fallback if $ is not available: create a simple element
				var el = document.createElement('div');
				el.id = id; el.textContent = name;
				el.style.position = 'relative'; el.style.backgroundColor = '#00f'; el.style.left = '70px'; el.style.top = '16px';
				el.style.padding = '12px'; el.style.color = 'white'; el.style.margin = '10px'; el.style.display = 'inline-block';
				document.body.appendChild(el);
			}
		}catch(_){ }
	}

	// Listen for double-clicks on file list items and trigger audio_load_handler for audio files
	document.addEventListener('dblclick', function(e){
		try{
			var li = e && e.target && e.target.closest && e.target.closest('li[data-fullpath]');
			if (!li) return;
			var fullPath = li.getAttribute('data-fullpath') || '';
			var name = (fullPath||'').split('/').pop() || '';
			if (isAudioFileName(name)) { audio_load_handler(fullPath); }
		}catch(_){ }
	}, true);

	// Expose for manual invocation
	window.audio_load_handler = audio_load_handler;

})();


// Project creator UI: button 'prj_creator' placed to the right of '#btn-list'
(function(){
	'use strict';

	function $(tag, opts){ try{ return window.$ && window.$(tag, opts); }catch(_){ return null; } }

	function insertAfter(newNode, refNode){ if (!refNode || !refNode.parentNode) return; refNode.parentNode.insertBefore(newNode, refNode.nextSibling); }

	function sanitizeName(name){ return String(name||'').replace(/[\\/:*?"<>|\n\r\t]/g,'_').trim(); }

	function ensureProjectsDir(cb){
		try{
			const FS = window.AtomeFileSystem || {};
			if (typeof FS.createDirectory === 'function') { FS.createDirectory('Projects', function(res){ try{ cb && cb(true); }catch(_){ } }); return; }
			try { webkit.messageHandlers.fileSystem.postMessage({ action: 'createDirectory', path: 'Projects' }); cb && cb(true); return; } catch(_) { cb && cb(false); }
		}catch(_){ cb && cb(false); }
	}

	function listProjects(cb){
		try{
			const FS = window.AtomeFileSystem || {};
			if (typeof FS.listFiles === 'function') { FS.listFiles('Projects', function(res){ try{ if (res && res.success && res.data && res.data.files) cb && cb(res.data.files.map(f=>f.name)); else cb && cb([]); }catch(_){ cb && cb([]); } }); return; }
			try { window.fileSystemCallback = function(r){ try{ cb && cb((r && r.data && r.data.files)||[]); }catch(_){ cb && cb([]); } }; webkit.messageHandlers.fileSystem.postMessage({ action: 'listFiles', folder: 'Projects' }); return; } catch(_) { cb && cb([]); }
		}catch(_){ cb && cb([]); }
	}

	function saveProjectFile(relPath, data, cb){
		try{
			const FS = window.AtomeFileSystem || {};
			if (typeof FS.saveFile === 'function') { FS.saveFile(relPath, data||'', cb); return; }
			try { webkit.messageHandlers.fileSystem.postMessage({ action:'saveFile', path: relPath, data: data||'' }); cb && cb({ success: true }); return; } catch(_) { cb && cb({ success: false }); }
		}catch(_){ cb && cb({ success: false }); }
	}

	function makeUniqueProjectName(existing){
		const base = 'Project';
		const ext = '.atm';
		let candidate = base + ext;
		const names = new Set((existing||[]).map(String));
		if (!names.has(candidate)) return candidate;
		let idx = 2;
		while(idx < 1000){ candidate = base + ' ' + idx + ext; if (!names.has(candidate)) return candidate; idx++; }
		return base + '-' + Date.now() + ext;
	}

	function createLabelFor(button, fileName, fullPath){
		try{
			var span = document.createElement('span');
			span.id = 'prj_label_' + fileName.replace(/[^a-z0-9\-_]/gi,'_');
			span.textContent = fileName;
			span.style.marginLeft = '10px'; span.style.cursor = 'pointer'; span.style.userSelect = 'none'; span.setAttribute('data-path', fullPath);
			// long-press to rename (mouse/touch)
			var tmr = null; var startName = fileName;
			function start(e){ e && e.preventDefault && e.preventDefault(); tmr = setTimeout(()=>{ beginInlineRename(span); }, 600); }
			function cancel(){ if (tmr) { clearTimeout(tmr); tmr = null; } }
			span.addEventListener('mousedown', start); span.addEventListener('touchstart', start);
			span.addEventListener('mouseup', cancel); span.addEventListener('mouseleave', cancel); span.addEventListener('touchend', cancel);
			return span;
		}catch(_){ return null; }
	}

	function beginInlineRename(span){
		try{
			const old = span.textContent || '';
			span.contentEditable = 'true'; span.spellcheck = false; span.style.userSelect = 'text'; span.focus();
			const sel = window.getSelection(); try{ const r = document.createRange(); r.selectNodeContents(span); sel.removeAllRanges(); sel.addRange(r); }catch(_){ }
			function commit(){ span.contentEditable = 'false'; span.style.userSelect='none'; const newName = sanitizeName(span.textContent||''); if (!newName || newName === old) { span.textContent = old; return; }
				// Ensure .atm
				const final = newName.endsWith('.atm') ? newName : (newName + '.atm');
				const oldPath = span.getAttribute('data-path') || ('Projects/' + old);
				const newPath = 'Projects/' + final;
				try{
					const FS = window.AtomeFileSystem || {};
					if (FS && FS.renameItem) {
						FS.renameItem(oldPath, newPath, function(res){ if (res && res.success) { span.setAttribute('data-path', newPath); span.textContent = final; } else { span.textContent = old; } });
					} else {
						try{ webkit.messageHandlers.fileSystem.postMessage({ action:'renameItem', oldPath: oldPath, newPath: newPath }); span.setAttribute('data-path', newPath); span.textContent = final; }catch(_){ span.textContent = old; }
					}
				}catch(_){ span.textContent = old; }
			}
			function cancel(){ span.contentEditable = 'false'; span.style.userSelect='none'; span.textContent = old; }
			span.addEventListener('blur', commit, { once: true });
			span.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); commit(); span.blur && span.blur(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); span.blur && span.blur(); } });
		}catch(_){ }
	}

	function createProjectAndShow(){
		try{
			ensureProjectsDir(function(ok){
				listProjects(function(names){
					var candidate = makeUniqueProjectName(names);
					var rel = 'Projects/' + candidate;
					saveProjectFile(rel, '', function(res){
						// show label next to button — remove any previous project labels first
						var btn = document.getElementById('prj_creator');
						if (!btn) return;
						// Remove existing prj_label_* elements adjacent to the button
						try{
							var sibling = btn.nextSibling;
							while(sibling){
								var next = sibling.nextSibling;
								if (sibling.id && String(sibling.id).indexOf('prj_label_') === 0) { try{ sibling.remove(); }catch(_){ } }
								sibling = next;
							}
						}catch(_){ }
						var label = createLabelFor(btn, candidate, rel);
						insertAfter(label, btn);
					});
				});
			});
		}catch(_){ }
	}

	// Create button and wire it
	function ensureButton(){
		try{
			var existing = document.getElementById('prj_creator'); if (existing) return existing;
			var btn = null;
			try{
				btn = $('button', { id: 'prj_creator', text: '+', css: { marginLeft: '8px' } });
			}catch(_){ btn = document.createElement('button'); btn.id = 'prj_creator'; btn.textContent = '+'; btn.style.marginLeft = '8px'; document.body.appendChild(btn); }
			// place to the right of #btn-list if present
			var ref = document.getElementById('btn-list'); if (ref && ref.parentNode) { insertAfter(btn, ref); } else { document.body.appendChild(btn); }
			btn.addEventListener('click', function(){ createProjectAndShow(); });
			return btn;
		}catch(_){ return null; }
	}

	// ensure on load
	if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(ensureButton, 50); } else { document.addEventListener('DOMContentLoaded', function(){ setTimeout(ensureButton, 50); }); }

})();

