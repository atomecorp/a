
// const __dataCache = {};

// // Minimal placeholder to avoid ReferenceError if user keeps catch handlers with span
// if (typeof window !== 'undefined' && typeof window.span === 'undefined') {
//   window.span = { textContent: '' };
// }

// // --- Local server readiness (single global health probe) ---
// let __localServerReady = false;
// let __localServerReadyPromise = null;
// async function __waitLocalServerReady(){
//   if (__localServerReady) return true;
//   if (__localServerReadyPromise) return __localServerReadyPromise;
//   __localServerReadyPromise = (async () => {
//     // Retry /health until OK or fallback after maxAttempts so UI doesn't block forever.
//     const maxAttempts = 25; // ~3.7s at 150ms
//     for (let attempt=0; attempt < maxAttempts; attempt++) {
//       try {
//         const port = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT;
//         if (port) {
//           try {
//             const resp = await fetch(`http://127.0.0.1:${port}/health?ts=${Date.now()}`, { cache: 'no-store' });
//             if (resp.ok) { __localServerReady = true; return true; }
//           } catch(_) { /* health fetch failed, will retry */ }
//         }
//       } catch(_) {}
//       await new Promise(r => setTimeout(r, 150));
//     }
//     // Fallback: proceed anyway (asset relative fetch will still work). Mark as ready to avoid future waits.
//     __localServerReady = true;
//     return false;
//   })();
//   return __localServerReadyPromise;
// }
// // -----------------------------------------------------------

// async function dataFetcher(path, opts = {}) {
//   const mode = (opts.mode || 'auto').toLowerCase(); // auto|text|url|arraybuffer|blob|preview
//   const key = path + '::' + mode + '::' + (opts.preview||'');
//   if (__dataCache[key]) return __dataCache[key];
//   if (typeof fetch !== 'function') throw new Error('fetch indisponible');

//   let cleanPath = (path || '').trim().replace(/^\/+/,'').replace(/^[.]+/,'');
//   if (!cleanPath) throw new Error('Chemin vide');
//   const filename = cleanPath.split('/').pop();
//   const ext = (filename.includes('.') ? filename.split('.').pop() : '').toLowerCase();
//   // Kick off (non bloquant) readiness probe if not started
//   const port = (typeof window !== 'undefined') ? (window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT) : null;
//   if (typeof window !== 'undefined' && !__localServerReady && !__localServerReadyPromise) { __waitLocalServerReady(); }

//   const textExt = /^(txt|json|md|svg|xml|csv|log)$/;
//   const audioExt = /^(m4a|mp3|wav|ogg|flac|aac)$/;
//   const binPreferred = /^(png|jpe?g|gif|webp|avif|bmp|ico|mp4|mov|webm|m4v|woff2?|ttf|otf|pdf)$/;

//   const looksText = textExt.test(ext) || /^texts\//.test(cleanPath);
//   const looksAudio = audioExt.test(ext);
//   const looksBinary = binPreferred.test(ext) || looksAudio;

//   const serverCandidates = [];
//   if (port) {
//     serverCandidates.push(`http://127.0.0.1:${port}/file/${encodeURI(cleanPath)}`);
//     if (looksText) serverCandidates.push(`http://127.0.0.1:${port}/text/${encodeURI(cleanPath)}`);
//     if (looksAudio) {
//       serverCandidates.push(`http://127.0.0.1:${port}/audio/${encodeURIComponent(filename)}`);
//       serverCandidates.push(`http://127.0.0.1:${port}/audio/${encodeURI(cleanPath)}`);
//     }
//   }

//   let assetPath = cleanPath;
//   if (!/^(assets|src\/assets)\//.test(assetPath)) assetPath = 'assets/' + assetPath;
//   const assetCandidates = [assetPath];
//   const altAsset = assetPath.replace(/^assets\//, 'src/assets/');
//   if (altAsset !== assetPath) assetCandidates.push(altAsset);

//   // If no port yet (iOS race) try assets immediately; if success we return now.
//   if (!port) {
//     for (const u of assetCandidates) {
//       try {
//         if (looksText || mode === 'text' || mode === 'preview') {
//           const r = await fetch(u); if (!r.ok) continue;
//           const txt = await r.text();
//           if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(txt.slice(0,max)); }
//           return done(txt);
//         }
//         if (mode === 'arraybuffer') { const r = await fetch(u); if (!r.ok) continue; return done(await r.arrayBuffer()); }
//         if (mode === 'blob') { const r = await fetch(u); if (!r.ok) continue; return done(await r.blob()); }
//         const r = await fetch(u); if (!r.ok) continue; return done(u);
//       } catch(_) {}
//     }
//     // If assets failed, do a short rapid poll for port (<= 900ms) so first icon still precedes second (setTimeout 1000)
//     const startPoll = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
//     while (true) {
//       const pNow = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || window.__LOCAL_HTTP_PORT;
//       if (pNow) {
//         // update and build candidates then break to normal flow
//         serverCandidates.push(`http://127.0.0.1:${pNow}/file/${encodeURI(cleanPath)}`);
//         if (looksText) serverCandidates.push(`http://127.0.0.1:${pNow}/text/${encodeURI(cleanPath)}`);
//         if (looksAudio) {
//           serverCandidates.push(`http://127.0.0.1:${pNow}/audio/${encodeURIComponent(filename)}`);
//           serverCandidates.push(`http://127.0.0.1:${pNow}/audio/${encodeURI(cleanPath)}`);
//         }
//         break;
//       }
//       const nowT = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
//       if (nowT - startPoll > 900) break;
//       await new Promise(r => setTimeout(r, 60));
//     }
//   }

//   if (mode === 'url') {
//     const out = serverCandidates[0] || assetCandidates[0];
//     __dataCache[key] = out; return out;
//   }
//   const done = v => { __dataCache[key] = v; return v; };

//   for (const u of serverCandidates) {
//     try {
//       const r = await fetch(u);
//       if (!r.ok) continue;
//       if (mode === 'arraybuffer') return done(await r.arrayBuffer());
//       if (mode === 'blob') return done(await r.blob());
//       if (looksText || mode === 'text' || mode === 'preview') {
//         const txt = await r.text();
//         if (mode === 'preview' || opts.preview) {
//           const max = opts.preview || 120; return done(txt.slice(0,max));
//         }
//         return done(txt);
//       }
//       if (looksAudio && mode === 'auto') return done(u); // streaming URL
//       return done(u); // generic binary
//     } catch(_) {}
//   }

//   for (const u of assetCandidates) {
//     try {
//       if (looksText || mode === 'text' || mode === 'preview') {
//         const r = await fetch(u); if (!r.ok) continue;
//         const txt = await r.text();
//         if (mode === 'preview' || opts.preview) { const max = opts.preview || 120; return done(txt.slice(0,max)); }
//         return done(txt);
//       }
//       if (mode === 'arraybuffer') { const r = await fetch(u); if (!r.ok) continue; return done(await r.arrayBuffer()); }
//       if (mode === 'blob') { const r = await fetch(u); if (!r.ok) continue; return done(await r.blob()); }
//       return done(u);
//     } catch(_) {}
//   }

//   throw new Error('Introuvable (candidats: ' + [...serverCandidates, ...assetCandidates].join(', ') + ')');
// }


// //svg creator
// function render_svg(svgcontent, id = ('svg_' + Math.random().toString(36).slice(2)), parent_id='view', top='0px', left='0px', width='100px', height='100px', color=null, path_color=null) {
//   const parent = document.getElementById(parent_id);
//   if (!parent) return null;
//   const tmp = document.createElement('div');
//   tmp.innerHTML = svgcontent.trim();
//   const svgEl = tmp.querySelector('svg');
//   if (!svgEl) return null;
//   try { svgEl.id = id + '_svg'; } catch(_) {}
//   svgEl.classList.add('__auto_svg');
//   svgEl.style.position = 'absolute';
//   svgEl.style.top = top; svgEl.style.left = left;
//   const targetW = typeof width === 'number' ? width : parseFloat(width) || 200;
//   const targetH = typeof height === 'number' ? height : parseFloat(height) || 200;
//   svgEl.style.width = targetW + 'px';
//   svgEl.style.height = targetH + 'px';
//   // Insert first (hidden) so getBBox works for all browsers
//   const prevVisibility = svgEl.style.visibility;
//   svgEl.style.visibility = 'hidden';
//   parent.appendChild(svgEl);
//   // Collect shapes & compute bbox (inflated by stroke width/2 so strokes aren't clipped)
//   const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
//   const getStrokeWidth = (el) => {
//     let sw = el.getAttribute('stroke-width');
//     if ((!sw || sw === '0' || sw === '') && typeof window !== 'undefined' && window.getComputedStyle) {
//       try { sw = window.getComputedStyle(el).strokeWidth; } catch(_) {}
//     }
//     sw = parseFloat(sw);
//     return Number.isFinite(sw) ? sw : 0;
//   };
//   let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
//   shapes.forEach(node => {
//     try {
//       const b = node.getBBox();
//       if (b && b.width >= 0 && b.height >= 0) {
//         const sw = getStrokeWidth(node);
//         const pad = sw/2; // stroke extends equally each side
//         const x0 = b.x - pad;
//         const y0 = b.y - pad;
//         const x1 = b.x + b.width + pad;
//         const y1 = b.y + b.height + pad;
//         if (x0 < minX) minX = x0;
//         if (y0 < minY) minY = y0;
//         if (x1 > maxX) maxX = x1;
//         if (y1 > maxY) maxY = y1;
//       }
//     } catch(_){}
//   });
//   const bboxValid = isFinite(minX)&&isFinite(minY)&&isFinite(maxX)&&isFinite(maxY)&&maxX>minX&&maxY>minY;
//   if (bboxValid) {
//     const bboxW = maxX-minX, bboxH = maxY-minY;
//     const scale = Math.max(targetW / bboxW, targetH / bboxH); // cover
//     const tx = (targetW - bboxW*scale)/2 - minX*scale;
//     const ty = (targetH - bboxH*scale)/2 - minY*scale;
//     const ns = 'http://www.w3.org/2000/svg';
//     const g = document.createElementNS(ns,'g');
//     while (svgEl.firstChild) g.appendChild(svgEl.firstChild);
//     g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
//     svgEl.appendChild(g);
//     svgEl.setAttribute('viewBox', `0 0 ${targetW} ${targetH}`);
//     svgEl.setAttribute('preserveAspectRatio','none');
//   } else {
//     // Fallback: keep original coordinate system so large coords remain visible when scaled by CSS
//     if (!svgEl.getAttribute('viewBox')) {
//       const origW = parseFloat(svgEl.getAttribute('width')) || targetW;
//       const origH = parseFloat(svgEl.getAttribute('height')) || targetH;
//       svgEl.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
//       svgEl.setAttribute('preserveAspectRatio','xMidYMid meet');
//     }
//   }
//   // Colors
//   if ((color || path_color) && shapes.length) {
//     shapes.forEach(node => {
//       if (path_color) node.setAttribute('stroke', path_color);
//       if (color) {
//         const f = node.getAttribute('fill');
//         if (f === null || f.toLowerCase() !== 'none') node.setAttribute('fill', color);
//       }
//     });
//     if (color && !svgEl.getAttribute('fill')) svgEl.setAttribute('fill', color);
//     if (path_color && !svgEl.getAttribute('stroke')) svgEl.setAttribute('stroke', path_color);
//   }
//   svgEl.style.visibility = prevVisibility || 'visible';
//   return svgEl.id;
// }


////usecase






// // Player principal (src défini ensuite)
//     const audioPlayer = $('audio', {
//       id: 'audioPlayer',
//       attrs: {
//         controls: true,
//         preload: 'none'
//       },
//       css: {
//         margin: '4px 0 6px 0',
//         width: '300px',
//         outline: 'none',
//         borderRadius: '6px',
//         background: '#000'
//       }
//     });

// $('span', {
//   // pas besoin de 'tag'
//   id: 'verif',
//   css: {
//     backgroundColor: '#00f',
//     marginLeft: '0',
//     padding: '10px',
//     color: 'white',
//     margin: '10px',
//     display: 'inline-block'
//   },
//   text: 'Je suis un SPAN ! 🎯'
// });


// function fct_to_trig(state) {
//   console.log('trig: ' + state);
//   const span = grab('verif');
// //   if (!span) return;
//   span.style.backgroundColor = state ? 'rgba(26, 61, 26, 1)' : '#f00';
//   dataFetcher('texts/lorem.txt')
//     .then(txt => { span.textContent = txt; })
//     .catch(err => { span.textContent = 'Erreur: ' + err.message; });



//       setTimeout(() => {
//   dataFetcher('images/logos/arp.svg')
//     .then(txt => { span.textContent = txt; })
//     .catch(err => { span.textContent = 'Erreur: ' + err.message; });

//   }, 1000   );

//       setTimeout(() => {
//   dataFetcher('images/icons/activate.svg')
//     .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','133px', '99px', '120px', '120px' , 'green', 'red');  })
//     .catch(err => { span.textContent = 'Erreur: ' + err.message; });
//   }, 2000   );


//       setTimeout(() => {
//   // Aperçu (preview) des 120 premiers caractères ou header hex si binaire
//   dataFetcher('audios/riff.m4a', { mode: 'preview', preview: 120 })
//      .then(txt => { span.textContent = '[AUDIO PREVIEW] ' + txt; })
//     .catch(err => { span.textContent = 'Erreur: ' + err.message; });

//   }, 3000   );

//   // Nouveau: récupérer l'URL réelle (stream) puis jouer dans la balise audio
//   setTimeout(() => {
//     dataFetcher('audios/riff.m4a', { mode: 'url' })
//       .then(url => {
//         const audioEl = grab('audioPlayer');
//         if (audioEl) {
//           audioEl.src = url;
//           // tenter lecture (peut nécessiter interaction utilisateur; fct_to_trig est déclenchée par bouton donc OK)
//           const p = audioEl.play();
//           if (p && typeof p.catch === 'function') {
//             p.catch(e => console.log('lecture refusée:', e.message));
//           }
//           span.textContent = '[AUDIO PLAY] ' + url.split('/').pop();
//         } else {
//           span.textContent = 'Audio element introuvable';
//         }
//       })
//       .catch(err => { span.textContent = 'Erreur audio: ' + err.message; });
//   }, 3600);
// }





// const toggle = Button({
//     onText: 'ON',
//     offText: 'OFF',
//     onAction: fct_to_trig,
//     offAction: fct_to_trig,
//     parent: '#view', // parent direct
//     onStyle: { backgroundColor: '#28a745', color: 'white' },
//     offStyle: { backgroundColor: '#dc3545', color: 'white' },
//     css: {
//         position: 'absolute',
//         width: '50px',
//         height: '24px',
//         left: '120px',
//         top: '120px',
//         borderRadius: '6px',
//         backgroundColor: 'orange',
//         border: 'none',
//         cursor: 'pointer',
//         transition: 'background-color 0.3s ease',
//         border: '3px solid rgba(255,255,255,0.3)',
//         boxShadow: '0 2px 4px rgba(255,255,1,1)',
//     }
// });





        // setTimeout(() => {
  dataFetcher('images/icons/copy.svg')
    .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','133px', '0px', '120px', '120px' , 'green', 'red');  })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });
  // }, 2000   );


     setTimeout(() => {
  dataFetcher('images/icons/activate.svg')
    .then(svgData => { render_svg(svgData,'my_nice_svg2', 'view','133px', '199px', '120px', '120px' , 'green', 'red');  })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });
  }, 2000   );