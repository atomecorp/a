// iOS AUv3 trigger example — launch apps/links and present document pickers from the WebView UI
// Conforms to temp/prompt-xcode-App-launcher.md (user-initiated actions only)
(function(){
	const IN_AUV3 = !!(window && window.__HOST_ENV);
	const HAS_BRIDGE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
	const APPLINK_DOMAIN = window.__LYRIX_APPLINK_DOMAIN__ || 'example.com';

		function sendToSwift(payload){
			if(!HAS_BRIDGE){ console.warn('[ios_trigger] swiftBridge not available'); showToast('Bridge unavailable'); return false; }
			// Send both lowercase and capitalized keys for maximum compatibility with native handlers
			const wrapped = (function(){
				if(payload && typeof payload === 'object'){
					const out = { ...payload };
					if(payload.type && !payload.Type) out.Type = payload.type;
					if(payload.data && !payload.Data) out.Data = payload.data;
					return out;
				}
				return payload;
			})();
			try{ window.webkit.messageHandlers.swiftBridge.postMessage(wrapped); return true; }catch(e){ console.warn('[ios_trigger] postMessage failed', e); showToast('Send failed'); return false; }
		}
	function sendOpenURL(url){ return sendToSwift({ type:'openExternalURL', data:{ url } }); }
	function sendPresentPicker(allowedTypes, allowsMultiple){ return sendToSwift({ type:'presentDocumentPicker', data:{ allowedTypes, allowsMultiple } }); }
	function sendImportLinks(list){ return sendToSwift({ type:'import_links_json', data:{ links: list } }); }

	function openLyrixSong(songId){ if(!songId){ console.warn('[ios_trigger] missing songId'); return; } const url = `lyrix://open?song=${encodeURIComponent(songId)}`; console.log('[ios_trigger] open lyrix URL =', url); sendOpenURL(url); }
	function openUniversalLink(songId){ if(!songId){ console.warn('[ios_trigger] missing songId'); return; } const url = `https://${APPLINK_DOMAIN}/lyrix/open/${encodeURIComponent(songId)}`; console.log('[ios_trigger] open universal link =', url); sendOpenURL(url); }
	function openArbitraryURL(rawUrl){ if(!rawUrl){ console.warn('[ios_trigger] missing url'); return; } try{ new URL(rawUrl); }catch(_){ console.warn('[ios_trigger] invalid URL'); return; } console.log('[ios_trigger] open URL =', rawUrl); sendOpenURL(rawUrl); }
	function presentDocPicker(allowedTypes, allowsMultiple){ const types = Array.isArray(allowedTypes)&&allowedTypes.length? allowedTypes : ['public.data']; console.log('[ios_trigger] presentDocumentPicker', types, allowsMultiple); sendPresentPicker(types, !!allowsMultiple); }

		function showToast(msg){
			try{
				const id = 'iosTriggerToast';
				let el = document.getElementById(id);
				if(!el){ el = $('div', { id, parent:document.body, css:{ position:'fixed', left:'50%', bottom:'24px', transform:'translateX(-50%)', background:'#222e3a', color:'#fff', padding:'8px 12px', borderRadius:'6px', border:'1px solid #2c343d', fontFamily:'monospace', fontSize:'12px', zIndex:99999, opacity:'0.95' } }); }
				el.textContent = String(msg||'');
				setTimeout(()=>{ try{ el.remove(); }catch(_){ } }, 1800);
			}catch(_){ }
		}

	// UI (squirrel components)
	const wrap = $('div', { id:'iosTriggerWrap', parent:document.body, css:{ position:'absolute', left:'14px', right:'14px', top:'14px', bottom:'14px', backgroundColor:'#0f1215', border:'1px solid #2c343d', borderRadius:'6px', padding:'10px', color:'#e6e6e6', fontFamily:'monospace', fontSize:'12px', overflowY:'auto' } });
	$('div', { parent:wrap, text: 'AUv3 Launcher (URL Schemes & Universal Links)', css:{ marginBottom:'8px', color:'#9db2cc' }});

	const songRow = $('div', { id:'rowSong', parent:wrap, css:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' } });
	const songInput = $('input', { id:'songIdInput', value:'MySong123', parent:songRow, placeholder:'SongID (ex: MySong123)', css:{ flex:'1 1 auto', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px' } });
	Button({ id:'btnOpenLyrix', onText:'Open lyrix://', offText:'Open lyrix://', parent:songRow, onAction:()=>openLyrixSong(songInput.value||''), offAction:()=>openLyrixSong(songInput.value||''), css:{ height:'30px', background:'#3b9157', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });
	Button({ id:'btnOpenUniversal', onText:'Open Universal Link', offText:'Open Universal Link', parent:songRow, onAction:()=>openUniversalLink(songInput.value||''), offAction:()=>openUniversalLink(songInput.value||''), css:{ height:'30px', background:'#2d6cdf', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });

	const urlRow = $('div', { id:'rowURL', parent:wrap, css:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' } });
	const urlInput = $('input', { id:'arbitraryUrlInput', parent:urlRow, placeholder:'Any URL (lyrix://, https://, shortcuts://, music:// …)', css:{ flex:'1 1 auto', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px' } });
	Button({ id:'btnOpenURL', onText:'Open URL', offText:'Open URL', parent:urlRow, onAction:()=>openArbitraryURL(urlInput.value||''), offAction:()=>openArbitraryURL(urlInput.value||''), css:{ height:'30px', background:'#455063', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });

	const docRow = $('div', { id:'rowDoc', parent:wrap, css:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' } });
	const typeInput = $('input', { id:'utiInput', parent:docRow, placeholder:'UTTypes (comma), ex: public.audio,public.json', css:{ flex:'1 1 auto', padding:'6px 8px', background:'#1a1f25', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px' } });
	const multiToggle = Button({ id:'btnToggleMulti', onText:'Multi: ON', offText:'Multi: OFF', parent:docRow, onAction:()=>{}, offAction:()=>{}, css:{ height:'30px', background:'#914d91', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });
	try{ multiToggle.setState(false); }catch(_){ }
	Button({ id:'btnPickDocJSON', onText:'Import Links JSON (Picker)', offText:'Import Links JSON (Picker)', parent:docRow, onAction:()=>presentDocPicker(['public.json'], false), offAction:()=>presentDocPicker(['public.json'], false), css:{ height:'30px', background:'#cc7a1b', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });
	Button({ id:'btnPickFiles', onText:'Pick Files', offText:'Pick Files', parent:docRow, onAction:()=>{ const allowed=(typeInput.value||'').split(',').map(s=>s.trim()).filter(Boolean); const multi=!!(multiToggle.getState&&multiToggle.getState()); presentDocPicker(allowed.length?allowed:['public.audio','public.data'], multi); }, offAction:()=>{ const allowed=(typeInput.value||'').split(',').map(s=>s.trim()).filter(Boolean); const multi=!!(multiToggle.getState&&multiToggle.getState()); presentDocPicker(allowed.length?allowed:['public.audio','public.data'], multi); }, css:{ height:'30px', background:'#a46bff', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });

	const pasteRow = $('div', { id:'rowPaste', parent:wrap, css:{ display:'flex', gap:'8px', alignItems:'stretch', marginTop:'10px' } });
	const pasteArea = $('textarea', { id:'linksJsonInput', parent:pasteRow, placeholder:'Paste links JSON here: ["lyrix://open?song=42", "https://example.com/lyrix/open/abc"]', css:{ flex:'1 1 auto', padding:'6px 8px', minHeight:'60px', background:'#12161b', color:'#e6e6e6', border:'1px solid #2c343d', borderRadius:'4px' } });
	Button({ id:'btnImportLinksJSON', onText:'Import Links JSON (Paste)', offText:'Import Links JSON (Paste)', parent:pasteRow, onAction:()=>{ try{ const arr = JSON.parse(pasteArea.value||'[]'); if(Array.isArray(arr)){ sendImportLinks(arr.map(String)); } }catch(e){ console.warn('[ios_trigger] invalid JSON', e); } }, offAction:()=>{ try{ const arr = JSON.parse(pasteArea.value||'[]'); if(Array.isArray(arr)){ sendImportLinks(arr.map(String)); } }catch(e){ console.warn('[ios_trigger] invalid JSON', e); } }, css:{ width:'220px', background:'#3b9157', color:'#fff', border:'none', borderRadius:'5px', padding:'0 10px', cursor:'pointer' } });

	const info = $('div', { id:'infoBox', parent:wrap, css:{ marginTop:'12px', color:'#8aa7c4', lineHeight:'1.4em' } });
	$('div', { parent:info, text:`Environment: IN_AUV3=${IN_AUV3}, HAS_BRIDGE=${HAS_BRIDGE}, APPLINK_DOMAIN=${APPLINK_DOMAIN}` });
	$('li', { parent:info, text:'Trigger actions by user tap only.' });
	$('li', { parent:info, text:'Native: extensionContext?.open(url) for URLs; UIDocumentPicker for files/JSON; persist in App Group.' });
})();

