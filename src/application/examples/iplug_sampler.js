// Project creator UI and logic (button id=prj_creator)
(function(){
	'use strict';
	function mkElement(tag, props){ try{ if (typeof $ === 'function') return $(tag, props); }catch(_){ }
		var el = document.createElement(tag.replace(/[^a-z0-9]/gi,''));
		if (props) {
			if (props.id) el.id = props.id;
			if (props.text) el.textContent = props.text;
			if (props.css) Object.assign(el.style, props.css);
			if (props.parent && typeof props.parent.appendChild === 'function') props.parent.appendChild(el);
			if (props.onclick) el.addEventListener('click', props.onclick);
		}
		return el;
	}

	function setupProjectCreatorUI(){
		try{
			var btnList = document.getElementById('btn-list');
			var container = document.createElement('div');
			container.id = 'prj_creator_container';
			container.style.display = 'inline-flex';
			container.style.alignItems = 'center';
			container.style.marginLeft = '8px';

			var btn = mkElement('button', { id: 'prj_creator', text: 'Create Project', css: { padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' } });
			btn.addEventListener('click', onCreateProject);
			var label = mkElement('span', { id: 'prj_creator_label', text: '', css: { marginLeft: '10px', color: '#eee', cursor: 'default', userSelect: 'none' } });

			container.appendChild(btn);
			container.appendChild(label);

			if (btnList && btnList.parentNode) {
				btnList.parentNode.insertBefore(container, btnList.nextSibling);
			} else {
				// fallback to top-right area: append to body
				document.body.insertBefore(container, document.body.firstChild);
			}

			setupLongPress(label, function(){ startRenameProject(label); });
		}catch(_){ }
	}

	function setupLongPress(el, cb){
		try{
			var timer = null;
			var start = function(e){ try{ e.preventDefault && e.preventDefault(); }catch(_){ } timer = setTimeout(function(){ cb && cb(); }, 600); };
			var cancel = function(){ if (timer) { clearTimeout(timer); timer = null; } };
			el.addEventListener('touchstart', start, { passive: true }); el.addEventListener('mousedown', start);
			el.addEventListener('touchend', cancel); el.addEventListener('mouseup', cancel); el.addEventListener('mouseleave', cancel);
		}catch(_){ }
	}

	window.__prj_counter = window.__prj_counter || 1;
	function makeProjectBaseName(){ var base = 'Project'; var i = window.__prj_counter || 1; var name = (i===1) ? base : (base + ' ' + i); window.__prj_counter = i + 1; return name; }

	function onCreateProject(){
		try{
			var base = makeProjectBaseName();
			var fileName = base + '.atm';
			var path = 'Projects/' + fileName;
			var content = '{}';
			var label = document.getElementById('prj_creator_label');
			var FS = window.AtomeFileSystem || null;
				var done = function(success){ if (label) label.textContent = fileName; };
				// Ensure projects directory exists first
				var ensureAndSave = function(){
					try{
						if (FS && typeof FS.saveFile === 'function') {
							return FS.saveFile(path, content, function(res){ try{ if (res && res.success!==false) done(true); else done(false); }catch(_){ done(false); } });
						}
					}catch(_){ }
					try { webkit.messageHandlers.fileSystem.postMessage({ action: 'saveFile', path: path, data: content }); done(true); } catch(_){ done(false); }
				};

				try{
					if (FS) {
						// Prefer createDirectory API if available
						if (typeof FS.createDirectory === 'function') { FS.createDirectory('projects', function(){ ensureAndSave(); }); return; }
						if (typeof FS.mkdir === 'function') { FS.mkdir('projects', function(){ ensureAndSave(); }); return; }
						if (typeof FS.createFolder === 'function') { FS.createFolder('projects', function(){ ensureAndSave(); }); return; }
					}
				}catch(_){ }

				// Fallback: call bridge to create directory then save
				try { webkit.messageHandlers.fileSystem.postMessage({ action: 'createDirectory', path: 'projects' }); } catch(_){ }
				// Small delay to allow native side to create dir, then save
				setTimeout(function(){ ensureAndSave(); }, 120);
		}catch(_){ }
	}

	function startRenameProject(label){
		try{
			var current = (label && label.textContent) ? label.textContent.trim() : '';
			if (!current) return;
			// Try inline edit if available
			if (typeof window.edit_filer_element === 'function') {
				// Create a temporary fake fullPath to reuse edit flow (the listing may not contain it)
			var fakeFullPath = 'Projects/' + current;
				try { edit_filer_element(fakeFullPath); } catch(_) { }
				// After editing, the global edit flow commits via AtomeFileSystem.renameItem if integrated.
				return;
			}
			var n = prompt('Rename project (without extension)', current.replace(/\.atm$/i, ''));
			if (!n) return;
			var newName = n.trim(); if (!/\.atm$/i.test(newName)) newName = newName + '.atm';
			var oldPath = 'Projects/' + current; var newPath = 'Projects/' + newName;
			var FS = window.AtomeFileSystem || null;
			try{ if (FS && FS.renameItem) { FS.renameItem(oldPath, newPath, function(){ if (label) label.textContent = newName; }); return; } }catch(_){ }
			try { webkit.messageHandlers.fileSystem.postMessage({ action: 'renameItem', oldPath: oldPath, newPath: newPath }); if (label) label.textContent = newName; } catch(_){ }
		}catch(_){ }
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupProjectCreatorUI); else setupProjectCreatorUI();

})();

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

