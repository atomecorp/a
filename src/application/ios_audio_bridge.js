// iOS Audio Bridge Demo
// Exemple complet: liste les fichiers audio locaux (sandbox/AppGroup) et permet lecture / arrêt.
// Requiert les APIs déjà exposées: auv3_file_list (ou AtomeFileSystem) + serveur local (ATOME_LOCAL_HTTP_PORT) pour servir les fichiers.

// Version simplifiée avec slider de navigation (Squirrel Slider)
import Slider from '../squirrel/components/slider_builder.js';
if (!window.__iosAudioBridgeDemoSimple){
	window.__iosAudioBridgeDemoSimple = true;
	(function(){
		const EXT=/\.(m4a|mp3|wav|aac|caf|aif|aiff|flac|ogg|m4r)$/i;
		const state={files:[], audio:null, playing:null};

		function ui(){
			// Éviter création multiple / doublon vide (#iab-mini apparaissait vide car déplacé après construction)
			const ghost=document.getElementById('iab-mini');
			if(ghost && !ghost.firstChild) ghost.remove();
			if(document.getElementById('iab-mini')) return; // panel déjà plein
			// Construction panel (tous les enfants utilisent parent:) pour éviter orphelins
			const box=$('div',{ id:'iab-mini', parent: document.body, css:{position:'absolute',top:'60px',right:'20px',width:'260px',background:'#1f2630',color:'#eee',fontSize:'12px',fontFamily:'monospace',padding:'10px',border:'1px solid #344',borderRadius:'8px',zIndex:9999} });
			$('div',{ parent: box, text:'Audio', css:{fontWeight:'bold',marginBottom:'4px'} });
			const stat=$('div',{ parent: box, id:'iab-mini-status', text:'...' });
			const row=$('div',{ parent: box, css:{display:'flex',gap:'6px',margin:'6px 0'} });
			const b=(t,cb,style={})=>$('button',{ parent: row, text:t, css:Object.assign({flex:'1',fontSize:'13px',padding:'6px 4px',background:'#334',color:'#fff',border:'1px solid #445',borderRadius:'4px',cursor:'pointer'},style), onClick:cb });
			b('⟳',refresh); b('⏹',stop,{background:'#633'}); b('⬆',upload,{background:'#365'});
			const list=$('div',{ parent: box, id:'iab-mini-list', css:{display:'flex',flexDirection:'column',gap:'4px',marginTop:'4px',maxHeight:'150px',overflow:'auto'} });
			// slider container
					const seekWrap=$('div',{ parent: box, css:{marginTop:'8px'} });
					const seekLabel=$('div',{ parent: seekWrap, id:'iab-seek-label', text:'0:00 / 0:00', css:{marginBottom:'2px',fontSize:'11px',opacity:.8} });
					const sliderContainer=$('div',{ parent: seekWrap, css:{width:'100%',display:'flex',justifyContent:'center'} });
					const seekSlider = Slider({
						parent: sliderContainer,
						id: 'iab-seek-slider',
						type: 'horizontal',
						min: 0,
						max: 1000, // résolution fine (0.1%)
						value: 0,
						showLabel: false,
						skin: { container:{ width:'100%', height:'28px' }, track:{ height:'6px', backgroundColor:'#2d3a46', borderRadius:'3px' }, progression:{ backgroundColor:'#4aa3ff', borderRadius:'3px' }, handle:{ width:'16px', height:'16px', top:'-5px', backgroundColor:'#fff', border:'2px solid #4aa3ff' } },
						onInput: (val)=>{ if(state.audio && state.audio.duration){ const ratio=val/1000; state.audio.currentTime=ratio*state.audio.duration; updateSeek(); } }
					});
			// plus de append manuelle (déjà inséré via parent passé au helper)
			state.box=box; state.stat=stat; state.list=list; state.seekSlider=seekSlider; state.seekLabel=seekLabel;
			state.audio=document.createElement('audio');
			state.audio.addEventListener('timeupdate',()=>updateSeek());
			state.audio.addEventListener('ended',()=>{ playing(null); msg('fin'); });
			state.audio.addEventListener('loadedmetadata',()=>updateSeek());
		}

		function msg(t){ if(state.stat) state.stat.textContent=t; }
		function fmt(s){ if(!isFinite(s)) s=0; const m=Math.floor(s/60); const sec=Math.floor(s%60).toString().padStart(2,'0'); return m+':'+sec; }
		function updateSeek(){
			if(!state.audio||!state.seekSlider) return; const a=state.audio; if(a.duration){ const v=Math.floor((a.currentTime/a.duration)*1000); state.seekSlider.setValue(v,false); }
			if(state.seekLabel) state.seekLabel.textContent=fmt(a.currentTime)+' / '+fmt(a.duration||0);
		}
		function playing(name){
			state.playing=name; if(!state.list) return; Array.from(state.list.children).forEach(ch=>{ ch.style.background=(ch.getAttribute('data-f')===name)?'#35516f':'#28323d'; ch.style.color=(ch.getAttribute('data-f')===name)?'#fff':'#ccd'; });
		}
		function build(){ if(!state.list) return; state.list.innerHTML=''; if(!state.files.length){ $('div',{text:'(aucun)',css:{opacity:.6}},state.list); return; } state.files.forEach(f=>{ const it=$('div',{text:f,css:{padding:'4px 6px',background:'#28323d',border:'1px solid #384451',borderRadius:'4px',cursor:'pointer',fontSize:'11px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},state.list); it.setAttribute('data-f',f); it.addEventListener('click',()=>play(f)); }); playing(state.playing); }
		function url(f){ const p=window.ATOME_LOCAL_HTTP_PORT||window.__ATOME_LOCAL_HTTP_PORT__; return p? 'http://127.0.0.1:'+p+'/audio/'+encodeURIComponent(f):'audio/'+encodeURIComponent(f); }
		function play(f){ if(state.playing===f){ stop(); return; } state.audio.src=url(f); state.audio.currentTime=0; state.audio.play().catch(()=>msg('lecture bloquée')); playing(f); msg('▶ '+f); }
		function stop(){ if(state.audio) try{ state.audio.pause(); }catch(_){} const prev=state.playing; playing(null); msg(prev?'⏹ '+prev:'⏹'); }
		async function refresh(){ msg('scan...'); const dirs=['','Projects','audio','Audio']; const all=new Set(); for(const d of dirs){ let arr=[]; if(window.auv3_file_list){ try{ arr = d? await window.auv3_file_list(d): await window.auv3_file_list(); }catch(e){} } else if(window.AtomeFileSystem && window.AtomeFileSystem.listFiles){ window.AtomeFileSystem.listFiles(d,(r)=>{ if(r.success) arr=r.data.files; }); }
				(arr||[]).forEach(n=>{ if(EXT.test(n)) all.add(n); }); }
			state.files=Array.from(all).sort(); build(); msg(state.files.length? state.files.length+' fichier(s)':'aucun fichier'); }
		function upload(){ const input=document.createElement('input'); input.type='file'; input.accept='audio/*,.m4a,.mp3,.wav,.aac,.aif,.aiff,.caf,.flac,.ogg,.m4r'; input.multiple=true; input.style.display='none'; input.onchange=async()=>{ const files=Array.from(input.files||[]); if(!files.length){ input.remove(); return; } msg('import...'); for(const f of files){ await save(f); } msg('ok'); refresh(); input.remove(); }; document.body.appendChild(input); input.click(); }
		async function save(file){ try{ const buf=new Uint8Array(await file.arrayBuffer()); let bin=''; const chunk=0x8000; for(let i=0;i<buf.length;i+=chunk){ bin+=String.fromCharCode.apply(null, buf.subarray(i,i+chunk)); } const b64=btoa(bin); if(window.AUv3API&&window.AUv3API.auv3_file_saver){ await window.AUv3API.auv3_file_saver(file.name,b64);} else if(window.AtomeFileSystem&&window.AtomeFileSystem.saveFile){ window.AtomeFileSystem.saveFile(file.name,b64,()=>{});} if(EXT.test(file.name)&&!state.files.includes(file.name)){ state.files.push(file.name); state.files.sort(); build(); } }catch(e){ msg('err '+file.name); }
		}
		window.iOSAudioBridgeDemo={ refresh, play, stop, upload, state };
		if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ ui(); refresh(); }); else { ui(); refresh(); }
	})();
}
