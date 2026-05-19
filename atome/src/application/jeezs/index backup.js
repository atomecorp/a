// Jeezs – Page de présentation (Rock Electro Pop Metal)
// Syntaxe Squirrel + DOM classique
// ----------------------------------------------------
// Hypothèses:
// 1. Les fichiers audio seront placés dans: src/assets/audios/
// 2. Les images de fond / concerts dans:   src/assets/images/
// 3. Squirrel (spark.js) déjà chargé globalement (window.Squirrel, List, Button ...)
// 4. Élément #view existant comme root principal
// ----------------------------------------------------

// Si besoin on peut forcer l'import (décommenter si non auto-chargé)
// import '../../squirrel/spark.js';

(function initWhenReady() {
    if (window.Squirrel) {
        buildJeezsPage();
    } else {
        window.addEventListener('squirrel:ready', buildJeezsPage, { once: true });
    }
})();

function buildJeezsPage() {
    const root = document.querySelector('#view') || document.body;

    injectBaseStyles();

    // === HERO / HEADER ======================================================
    const hero = createEl('section', 'jeezs-hero');
    hero.innerHTML = `
		<div class="hero-overlay">
			<h1 class="band-name">JEEZS</h1>
			<h2 class="tagline">Rock • Electro • Pop • Metal Fusion</h2>
			<div class="contact-bar">
				<a href="tel:0652575517">📞 06 52 57 55 17</a>
				<a href="mailto:contact@jeezs.eu">✉️ contact@jeezs.eu</a>
				<a href="https://www.jeezs.eu" target="_blank" rel="noopener">🌐 www.jeezs.eu</a>
			</div>
			<div class="cta-row">
				<button id="playAllBtn" class="glow-btn primary">Lecture Continue</button>
				<button id="randomBtn" class="glow-btn">Lecture Aléatoire</button>
			</div>
		</div>`;
    root.appendChild(hero);

    // === CONTENEUR PRINCIPAL ================================================
    const layout = createEl('div', 'jeezs-layout');
    root.appendChild(layout);

    // Colonnes: Playlist | Visual | Galerie
    const colPlaylist = createEl('div', 'col playlist-col');
    colPlaylist.id = 'playlist-col';
    const colVisual = createEl('div', 'col visual-col');
    const colGallery = createEl('div', 'col gallery-col');
    layout.append(colPlaylist, colVisual, colGallery);

    // === PLAYLIST ===========================================================
    const playlistHeader = createSectionTitle('PLAYLIST');
    colPlaylist.appendChild(playlistHeader);
    // Bouton stop additionnel en haut de la playlist (optionnel si déjà dans hero)
    const topStopBtn = createEl('button', 'mini util-btn');
    topStopBtn.textContent = 'Stop';
    topStopBtn.style.margin = '0 0 14px';
    colPlaylist.appendChild(topStopBtn);

    // Pistes réelles fournies (durations chargées dynamiquement)
    const TRACKS = [
        { title: 'Last chances', file: 'Last chances.m4a', duration: null },
        { title: 'Runaway', file: 'Runaway.m4a', duration: null },
        { title: 'Social Smiles', file: 'Social Smiles.m4a', duration: null },
        { title: 'Ices From Hells', file: 'Ices From Hells.m4a', duration: null },
        { title: 'After The War', file: 'After The War.m4a', duration: null },
        { title: 'Big Brother', file: 'Big Brother.m4a', duration: null },
        { title: 'Change the world', file: 'Change the world.m4a', duration: null },
        { title: 'Evolutions', file: 'Evolutions.m4a', duration: null },
        { title: 'GhostBox', file: 'GhostBox.m4a', duration: null },
        { title: 'Vampire', file: 'Vampire.m4a', duration: null },
        { title: 'Alive', file: 'Alive.m4a', duration: null },
        { title: 'wWw', file: 'wWw.m4a', duration: null },
    ];
    let activeTracks = [...TRACKS];
    window.JeezsTracks = TRACKS;
    window.JeezsActiveTracks = activeTracks;

    // Filtrage dynamique des pistes existantes (optionnel: test rapide de chargement)
    // On garde simple: on n’écarte pas les fichiers manquants, le player gérera l’erreur.

    function buildListItems(arr) {
        return arr.map((t, idx) => ({ content: `${idx + 1}. ${t.title} (${t.duration ? t.duration : '··:··'})` }));
    }
    let listItems = buildListItems(activeTracks);

    // Barre outils playlist
    // (Filtre retiré à la demande : suppression de l'input et du bouton reset)

    let squirrelListInstance = null;
    let listRenderGeneration = 0; // incrémente à chaque reconstruction

    function cleanupDuplicateLists() {
        const all = colPlaylist.querySelectorAll('#jeezs-tracks');
        if (all.length > 1) {
            // Conserve le plus récent (dernier ajouté)
            const keep = all[all.length - 1];
            all.forEach(el => { if (el !== keep) el.remove(); });
        }
        // Si Squirrel actif, supprimer fallback résiduel
        if (squirrelListInstance) {
            const fallbacks = colPlaylist.querySelectorAll('ul.fallback-playlist');
            fallbacks.forEach(fb => fb.remove());
        }
    }
    function mountList() {
        listRenderGeneration++;
        try {
            const oldList = document.querySelector('#jeezs-tracks');
            if (oldList) oldList.remove();
            // Supprime aussi d'éventuels anciens fallback restés sans id
            const oldFallbacks = colPlaylist.querySelectorAll('ul.fallback-playlist');
            oldFallbacks.forEach(fb => fb.remove());
            if (typeof List !== 'function') throw new Error('Squirrel List indisponible');
            squirrelListInstance = new List({
                id: 'jeezs-tracks',
                position: { x: 0, y: 0 },
                size: { width: 360, height: 420 },
                attach: '#playlist-col',
                spacing: { vertical: 6, itemPadding: 14, marginTop: 4, marginBottom: 4 },
                itemStyle: {
                    fontSize: '13px',
                    fontWeight: '500',
                    lineHeight: '1.3',
                    textColor: '#d6d6d6',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderRadius: '10px'
                },
                containerStyle: {
                    background: 'linear-gradient(145deg, rgba(30,30,35,0.65), rgba(10,10,12,0.4))',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '18px'
                },
                states: {
                    hover: {
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 14px -2px rgba(0,0,0,0.6)'
                    },
                    selected: {
                        backgroundColor: 'linear-gradient(90deg,#ff0066,#8a2be2)',
                        color: '#fff',
                        boxShadow: '0 6px 22px -4px rgba(255,0,102,0.6)'
                    }
                },
                elevation: 4,
                items: listItems,
                onItemClick: (item, idx) => playTrack(idx)
            });
            enhanceTrackListDom();
            queueMicrotask(() => { cleanupDuplicateLists(); adjustListHeightForMobile(); });
        } catch (e) {
            // Fallback: donner le même id pour permettre remplacement propre et éviter doublons
            const ul = createEl('ul', 'fallback-playlist');
            ul.id = 'jeezs-tracks';
            // Nettoyer anciens fallback potentiels
            const oldFallbacks = colPlaylist.querySelectorAll('ul.fallback-playlist');
            oldFallbacks.forEach(fb => { if (fb !== ul) fb.remove(); });
            listItems.forEach((li, idx) => {
                const liEl = createEl('li');
                liEl.innerHTML = li.content;
                liEl.addEventListener('click', () => playTrack(idx));
                ul.appendChild(liEl);
            });
            colPlaylist.appendChild(ul);
            queueMicrotask(() => { cleanupDuplicateLists(); adjustListHeightForMobile(); });
        }
    }
    mountList();

    // Bouton de téléchargement global supprimé

    // Lecteur audio + contrôles
    const playerBox = createEl('div', 'player-box glass');
    playerBox.innerHTML = `
		<div class="now-playing">Aucune lecture</div>
		<audio id="jeezsAudio" preload="metadata" crossorigin="anonymous"></audio>
		<div class="controls">
			<button class="mini" id="prevBtn">⏮</button>
			<button class="mini" id="playPauseBtn">▶️</button>
			<button class="mini" id="nextBtn">⏭</button>
			<button class="mini" id="muteBtn">🔇</button>
		</div>
		<div class="progress-row">
			<span id="currentTime">0:00</span>
			<input id="seekBar" type="range" min="0" max="100" value="0" />
			<span id="totalTime">0:00</span>
		</div>`;
    colPlaylist.appendChild(playerBox);

    // === SECTION VISUELLE : photo puis visualizer en dessous (inversé) ===
    const visualPhotoWrap = createEl('div', 'visual-photo-wrap');
    colVisual.appendChild(visualPhotoWrap);
    const visualImg = new Image();
    visualImg.src = 'assets/images/jeezs.JPG';
    visualImg.loading = 'lazy';
    visualImg.alt = 'Jeezs';
    visualImg.className = 'visual-photo';
    visualImg.onerror = () => { visualPhotoWrap.remove(); };
    visualPhotoWrap.appendChild(visualImg);

    const canvasWrap = createEl('div', 'visualizer-wrap glass');
    const canvas = createEl('canvas', 'visualizer');
    canvas.width = 520; canvas.height = 240;
    canvasWrap.appendChild(canvas);
    colVisual.appendChild(canvasWrap);
    // Pleine largeur dans sa colonne; on synchronise la photo sur la largeur réelle une fois posée
    function syncVisualMediaWidth() {
        // En desktop : le visualizer prend toute la largeur disponible (pas besoin d'ajuster)
        // En mobile (où tout est en colonne), la largeur s'adapte naturellement.
    }
    window.addEventListener('resize', syncVisualMediaWidth);
    requestAnimationFrame(syncVisualMediaWidth);

    // === AUDIO & VISUALIZER LOGIQUE ========================================
    const audio = playerBox.querySelector('#jeezsAudio');
    const nowPlayingEl = playerBox.querySelector('.now-playing');
    const playPauseBtn = playerBox.querySelector('#playPauseBtn');
    const prevBtn = playerBox.querySelector('#prevBtn');
    const nextBtn = playerBox.querySelector('#nextBtn');
    const muteBtn = playerBox.querySelector('#muteBtn');
    const seekBar = playerBox.querySelector('#seekBar');
    const curTime = playerBox.querySelector('#currentTime');
    const totalTime = playerBox.querySelector('#totalTime');
    const playAllBtn = document.querySelector('#playAllBtn');
    const randomBtn = document.querySelector('#randomBtn');
    // const stopAllBtn = document.querySelector('#stopAllBtn');
    // const stopAllBtnTop = document.querySelector('#stopAllBtnTop');

    let currentIndex = 0;
    let randomMode = false;
    let userSeeking = false;
    let waveformMode = false;

    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { console.warn('AudioContext init deferred', e); }
    let analyser = ctx ? ctx.createAnalyser() : null;
    if (analyser) analyser.fftSize = 256;
    let dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(0);
    let source;
    function ensureAudioGraph() {
        if (!ctx) {
            try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        }
        if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 256; dataArray = new Uint8Array(analyser.frequencyBinCount); }
        if (!source) {
            try { source = ctx.createMediaElementSource(audio); } catch (e) { /* Already created? */ }
        }
        if (source && analyser) { try { source.connect(analyser); analyser.connect(ctx.destination); } catch (e) { /* ignore duplicate */ } }
    }

    // Recrée le graphe au premier play
    audio.addEventListener('play', () => {
        ensureAudioGraph();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { });
    });

    const resolvedCache = new Map(); // fileName -> {url, dir}
    // Logging supprimé (désactivation complète des traces audio)
    function logAudio() { /* no-op */ }
    let loadToken = 0;
    function playTrack(index) {
        if (index < 0 || index >= activeTracks.length) return;
        currentIndex = index;
        const track = activeTracks[index];
        loadToken++;
        const myToken = loadToken;
        logAudio('playTrack request', { index, title: track.title, file: track.file });
        audio.pause();
        setNowPlayingStatus('loading');
        updateNowPlaying(track.title);
        highlightSelected(index);
        setAudioSourceWithFallback(track.file, ['assets/audios', 'src/assets/audios'], (success) => {
            if (myToken !== loadToken) return;
            if (!success) { setNowPlayingStatus('error'); return; }
            // Attendre canplay ou fallback timeout
            let started = false;
            const startPlay = () => {
                if (started) return; started = true;
                const p = audio.play();
                if (p && p.catch) p.catch(err => { logAudio('play() rejected', err); });
            };
            const canPlayHandler = () => { startPlay(); cleanup(); };
            const errorHandler = () => { cleanup(); setNowPlayingStatus('error'); };
            const timeout = setTimeout(() => { startPlay(); cleanup(); }, 2500);
            function cleanup() { audio.removeEventListener('canplaythrough', canPlayHandler); audio.removeEventListener('error', errorHandler); clearTimeout(timeout); }
            audio.addEventListener('canplaythrough', canPlayHandler, { once: true });
            audio.addEventListener('error', errorHandler, { once: true });
        });
    }

    function setAudioSourceWithFallback(fileName, candidateDirs, onReady) {
        const base = fileName.replace(/\.(m4a|M4A)$/, '').trim();
        const exts = ['.m4a', '.M4A'];
        const rawVariants = [];
        exts.forEach(ext => {
            rawVariants.push(base + ext);
            rawVariants.push(base.replace(/ /g, '%20') + ext);
            rawVariants.push(base.replace(/ /g, '_') + ext);
            rawVariants.push(base.replace(/ /g, '-') + ext);
        });
        const variants = rawVariants.filter((v, i, a) => a.indexOf(v) === i);
        let dirIndex = 0; let variantIndex = 0; let aborted = false;
        function cleanup() { audio.onerror = null; audio.onloadeddata = null; }
        // Cache direct si déjà résolu
        const cached = resolvedCache.get(fileName);
        if (cached) {
            logAudio('cache hit', cached.url);
            audio.src = cached.url;
            audio.load();
            setNowPlayingStatus('playing');
            onReady && onReady(true);
            return () => { };
        }
        let failTimer;
        function armFailTimer() { clearTimeout(failTimer); failTimer = setTimeout(() => { logAudio('timeout -> next variant'); tryNext(); }, 1400); }
        function tryNext() {
            if (aborted) return;
            if (dirIndex >= candidateDirs.length) { setNowPlayingStatus('error'); cleanup(); onReady && onReady(false); return; }
            if (variantIndex >= variants.length) { variantIndex = 0; dirIndex++; return tryNext(); }
            const dir = candidateDirs[dirIndex];
            const variant = variants[variantIndex++];
            const encoded = variant.split('/').map(seg => encodeURIComponent(seg)).join('/');
            const url = `${dir}/${encoded}`;
            logAudio('try variant', { dir, variant, url });
            audio.onerror = () => { logAudio('variant error', url); armFailTimer(); };
            audio.onloadeddata = () => { if (aborted) return; clearTimeout(failTimer); setNowPlayingStatus('playing'); cleanup(); resolvedCache.set(fileName, { url, dir }); logAudio('loaded', url); onReady && onReady(true); };
            audio.src = url;
            audio.load();
            armFailTimer();
        }
        tryNext();
        return () => { aborted = true; cleanup(); };
    }

    function setNowPlayingStatus(state) {
        nowPlayingEl.dataset.state = state;
    }

    function updateNowPlaying(title) {
        nowPlayingEl.textContent = '▶ ' + title;
    }

    function highlightSelected(idx) {
        if (squirrelListInstance) {
            // Squirrel List gère un state selected -> on simule
            const items = document.querySelectorAll('#jeezs-tracks .list-item');
            items.forEach((el, i) => {
                if (i === idx) el.classList.add('selected'); else el.classList.remove('selected');
            });
        } else {
            const items = document.querySelectorAll('.fallback-playlist li');
            items.forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });
        }
    }

    // Contrôles
    playPauseBtn.addEventListener('click', () => {
        if (audio.paused) { logAudio('manual resume click'); audio.play().then(() => { playPauseBtn.textContent = '⏸'; }).catch(e => logAudio('resume failed', e)); }
        else { logAudio('manual pause'); audio.pause(); playPauseBtn.textContent = '▶️'; }
    });
    prevBtn.addEventListener('click', () => playTrack((currentIndex - 1 + activeTracks.length) % activeTracks.length));
    nextBtn.addEventListener('click', () => nextTrack());
    muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; muteBtn.textContent = audio.muted ? '🔊' : '🔇'; });
    playAllBtn.addEventListener('click', () => { randomMode = false; playTrack(0); });
    randomBtn.addEventListener('click', () => { randomMode = true; playTrack(randIndex()); });
    let jeezsStopToken = 0;
    function stopPlayback() {
        // Invalide toute séquence de lecture en cours
        jeezsStopToken++;
        try { audio.pause(); } catch (_) { }
        try { audio.removeAttribute('src'); } catch (_) { }
        audio.src = '';
        try { audio.load(); } catch (_) { }
        audio.currentTime = 0;
        currentIndex = -1; // empêche nextTrack()
        randomMode = false;
        nowPlayingEl.textContent = 'Arrêté';
        nowPlayingEl.dataset.state = '';
        highlightSelected(-1);
    }
    // Activation du bouton Stop existant (sélection par texte)
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.tagName === 'BUTTON' && /stop/i.test(t.textContent.trim())) {
            stopPlayback();
        }
    }, true);

    function nextTrack() {
        if (currentIndex === -1) return; // arrêté manuellement
        if (randomMode) return playTrack(randIndex());
        playTrack((currentIndex + 1) % activeTracks.length);
    }
    function randIndex() {
        if (activeTracks.length <= 1) return 0; let r; do { r = Math.floor(Math.random() * activeTracks.length); } while (r === currentIndex); return r;
    }

    audio.addEventListener('ended', nextTrack);
    audio.addEventListener('loadedmetadata', () => { totalTime.textContent = formatTime(audio.duration); });
    audio.addEventListener('timeupdate', () => {
        if (!userSeeking && audio.duration) {
            seekBar.value = (audio.currentTime / audio.duration) * 100;
            curTime.textContent = formatTime(audio.currentTime);
        }
    });
    seekBar.addEventListener('input', () => { userSeeking = true; });
    seekBar.addEventListener('change', () => {
        if (audio.duration) { audio.currentTime = (seekBar.value / 100) * audio.duration; }
        userSeeking = false;
    });

    if (!window.formatTime) {
        window.formatTime = function (sec) {
            if (isNaN(sec)) return '0:00';
            const m = Math.floor(sec / 60); const s = Math.floor(sec % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        };
    }
    const formatTime = window.formatTime;

    // Visualizer draw loop
    const ctx2d = canvas.getContext('2d');
    const timeArray = analyser ? new Uint8Array(analyser.fftSize) : new Uint8Array(0);
    function draw() {
        requestAnimationFrame(draw);
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        const gradient = ctx2d.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#ff0066');
        gradient.addColorStop(0.5, '#8a2be2');
        gradient.addColorStop(1, '#00eaff');
        if (!analyser) return; // pas prêt encore
        if (!waveformMode) {
            analyser.getByteFrequencyData(dataArray);
            const barWidth = (canvas.width / dataArray.length) * 1.4;
            let x = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const v = dataArray[i] / 255;
                const h = v * canvas.height * 0.9;
                ctx2d.fillStyle = gradient;
                roundRect(ctx2d, x, canvas.height - h, barWidth * 0.8, h, 6);
                x += barWidth + 1;
            }
        } else {
            analyser.getByteTimeDomainData(timeArray);
            ctx2d.lineWidth = 2;
            ctx2d.strokeStyle = gradient;
            ctx2d.beginPath();
            const sliceWidth = canvas.width / timeArray.length;
            let x = 0;
            for (let i = 0; i < timeArray.length; i++) {
                const v = timeArray[i] / 128.0 - 1.0;
                const y = (canvas.height / 2) + v * (canvas.height * 0.4);
                if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
                x += sliceWidth;
            }
            ctx2d.stroke();
        }
    }
    draw();
    const visualToggle = createEl('button', 'mode-toggle');
    visualToggle.textContent = 'Waveform';
    visualToggle.addEventListener('click', () => { waveformMode = !waveformMode; visualToggle.textContent = waveformMode ? 'Spectrum' : 'Waveform'; });
    canvasWrap.appendChild(visualToggle);

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
    }

    // Précharge des durées
    preloadTrackDurations(TRACKS, () => {
        listItems = buildListItems(activeTracks);
        // Remonte la liste seulement si la génération courante correspond encore (évite double re-rendu simultané)
        mountList();
        queueMicrotask(() => { cleanupDuplicateLists(); adjustListHeightForMobile(); });
    });
    // Ajustement dynamique de la hauteur de la liste en mode mobile pour éviter chevauchements
    function adjustListHeightForMobile() {
        const listEl = document.getElementById('jeezs-tracks');
        if (!listEl) return;
        if (window.innerWidth > 900) {
            // Reset sur desktop pour laisser le layout naturel fonctionner
            listEl.style.height = '';
            listEl.style.position = '';
            return;
        }
        // Récupère les items visibles
        const items = listEl.querySelectorAll('.list-item');
        let maxBottom = 0;
        items.forEach(it => {
            const r = it.getBoundingClientRect();
            if (r.bottom > maxBottom) maxBottom = r.bottom;
        });
        const listRect = listEl.getBoundingClientRect();
        const needed = Math.ceil((maxBottom - listRect.top) + 18);
        if (needed > 0 && isFinite(needed)) {
            listEl.style.height = needed + 'px';
            listEl.style.position = 'relative';
        }
    }
    window.addEventListener('resize', () => { adjustListHeightForMobile(); });
    window.addEventListener('orientationchange', () => { setTimeout(adjustListHeightForMobile, 120); });
    // Sécurité: réajuste après un petit délai (images / fonts)
    setTimeout(adjustListHeightForMobile, 400);
    setTimeout(adjustListHeightForMobile, 1200);

    // Bio section
    const bio = createEl('section', 'bio-section glass');
    bio.innerHTML = `
        <h3 class="section-title">BIO</h3>
        <p class="bio-text">JEEZS fusionne l'énergie métallique, les textures électro, la pulsation pop et une dimension narrative immersive. Chaque titre est pensé comme une scène: tension, montée, impact et rémanence émotionnelle.</p>
       `;
    root.appendChild(bio);
    // Démarrage automatique (optionnel)
    // playTrack(0);
}

// Construit la structure DOM interne des items après génération Squirrel
function enhanceTrackListDom() {
    const items = document.querySelectorAll('#jeezs-tracks .list-item');
    if (!items.length) return;
    items.forEach((el, i) => {
        // Si déjà enrichi on saute
        if (el.querySelector('.track-line')) return;
        const trackText = el.textContent || '';
        // Efface le texte brut
        el.textContent = '';
        // Récup info depuis TRACKS global via closure indirecte (on retrouve buildJeezsPage scope) => on fallback sur parsing
        // Plus simple: on stock sur dataset lors de la création plus tard si besoin.
        // Ici on reparse approximate: "N. mood title (dur)"
        // Nouveau format: "N. Title (dur)"
        const match = trackText.match(/^(\d+)\.\s+(.+)\s+\(([^)]+)\)$/);
        let title = ''; let duration = ''; let index = i + 1;
        if (match) { index = match[1]; title = match[2].replace(`(${match[3]})`, '').trim(); duration = match[3]; }
        const line = createEl('div', 'track-line');
        const idxSpan = createEl('span', 'index'); idxSpan.textContent = index;
        const titleSpan = createEl('span', 'title'); titleSpan.textContent = title;
        const durSpan = createEl('span', 'duration'); durSpan.textContent = duration;
        // Zone actions (téléchargement supprimé)
        line.append(idxSpan, titleSpan, durSpan);
        el.appendChild(line);
    });
}

function preloadTrackDurations(TRACKS, cb) {
    const promises = [];
    TRACKS.forEach((track, idx) => {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.src = encodeURI(`assets/audios/${track.file}`);
        promises.push(new Promise(resolve => {
            probe.addEventListener('loadedmetadata', () => {
                if (!isNaN(probe.duration) && probe.duration) {
                    track.duration = formatTime(probe.duration);
                }
                resolve();
            });
            probe.addEventListener('error', () => resolve());
        }));
    });
    Promise.all(promises).then(() => {
        // Met à jour l'affichage si la liste est rendue
        enhanceTrackListDom();
        // Mets à jour les durées remplacées
        const lines = document.querySelectorAll('#jeezs-tracks .track-line');
        lines.forEach((line, i) => {
            const d = TRACKS[i] && TRACKS[i].duration;
            if (d) {
                const durEl = line.querySelector('.duration');
                if (durEl) durEl.textContent = d;
            }
        });
        if (typeof cb === 'function') cb();
    });
}

// ===================== OUTILS & STYLES =====================================
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }
function createSectionTitle(txt) { const t = createEl('h3', 'section-title'); t.textContent = txt; return t; }

function injectBaseStyles() {
    if (document.getElementById('jeezs-styles')) return;
    const style = document.createElement('style');
    style.id = 'jeezs-styles';
    style.textContent = `
        :root { --accent1:#ff1e1e; --accent2:#a30022; --accent3:#ff4d3d; --bg:#09090b; --panel:#151117; --accentGlow:rgba(255,40,40,0.55); font-family: 'Inter', 'Roboto', system-ui, sans-serif; }
        body { background: radial-gradient(circle at 20% 18%, #241014 0%, #0d0b0c 55%, #070607 90%); color:#e9e9e9; margin:0; }
        .jeezs-hero { position:relative; min-height:60vh; display:flex; align-items:center; justify-content:center; text-align:center; background:
            linear-gradient(165deg, rgba(40,6,10,0.82) 0%, rgba(25,6,8,0.78) 42%, rgba(15,10,12,0.9) 80%),
            url('assets/images/jeezs_2.JPG');
        background-size:cover; background-position:center top; background-repeat:no-repeat; background-attachment:scroll; overflow:hidden; }
        .jeezs-hero::after { content:''; position:absolute; left:0; right:0; bottom:-1px; height:140px; background:linear-gradient(to bottom, rgba(12,6,8,0) 0%, rgba(14,8,10,0.55) 55%, #09090b 95%); pointer-events:none; }
        .jeezs-hero .hero-overlay { padding:70px 30px 50px; }
        .band-name { font-size: clamp(3.1rem, 7.5vw, 5.8rem); letter-spacing:0.18em; margin:0 0 14px; background: linear-gradient(95deg,var(--accent1),var(--accent2),var(--accent3)); -webkit-background-clip:text; color:transparent; text-shadow:0 0 34px rgba(255,40,40,0.35); }
        .tagline { margin:0 0 30px; font-weight:300; letter-spacing:0.32em; font-size: clamp(0.85rem, 2vw, 1.05rem); text-transform:uppercase; opacity:0.78; }
        .contact-bar { display:flex; gap:26px; flex-wrap:wrap; justify-content:center; font-size:0.95rem; margin-bottom:30px; }
        .contact-bar a { color:#f1f1f1; text-decoration:none; position:relative; }
        .contact-bar a::after { content:''; position:absolute; left:0; bottom:-4px; width:0; height:2px; background:linear-gradient(90deg,var(--accent1),var(--accent2)); transition:width .4s; }
        .contact-bar a:hover::after { width:100%; }
        .cta-row { display:flex; gap:18px; justify-content:center; flex-wrap:wrap; }
        .glow-btn { background:linear-gradient(100deg,#1d1416,#23171a); border:1px solid rgba(255,255,255,0.07); color:#fff; padding:13px 30px; border-radius:44px; cursor:pointer; font-size:0.78rem; letter-spacing:0.22em; text-transform:uppercase; position:relative; overflow:hidden; transition:all .45s; }
        .glow-btn.primary { background:linear-gradient(90deg,var(--accent1), var(--accent2)); box-shadow:0 0 0 var(--accentGlow); }
        .glow-btn:hover { transform:translateY(-4px); box-shadow:0 10px 34px -8px rgba(0,0,0,0.7); }
        .glow-btn.primary:hover { box-shadow:0 8px 38px -6px rgba(255,40,40,0.55); }
        .jeezs-layout { display:grid; grid-template-columns: 380px 1fr 380px; gap:44px; padding:40px clamp(20px,5vw,70px) 110px; }
        @media (max-width:1500px){ .jeezs-layout { grid-template-columns: 360px 1fr 340px; gap:34px; }}
        @media (max-width:1200px){ .jeezs-layout { grid-template-columns: 360px 1fr; } .gallery-col { order:3; grid-column:1 / -1; } }
        @media (max-width:900px){ .jeezs-layout { grid-template-columns: 1fr; } .playlist-col, .visual-col, .gallery-col { grid-column:1; } }
        .section-title { font-size:0.7rem; letter-spacing:0.5em; font-weight:600; margin:0 0 22px; opacity:0.5; text-transform:uppercase; }
        .playlist-col, .visual-col, .gallery-col { position:relative; }
        #jeezs-tracks .list-item { cursor:pointer; transition:all .45s cubic-bezier(.25,.8,.25,1); }
        #jeezs-tracks .list-item.selected { color:#fff; }
    #jeezs-tracks { display:block; position:relative; margin-bottom:40px; }
    .playlist-col { display:flex; flex-direction:column; }
    .track-line { display:grid; grid-template-columns: 40px 1fr 70px; align-items:center; gap:14px; font-size:0.7rem; letter-spacing:.14em; text-transform:uppercase; }
        .track-line .index { font-weight:600; opacity:.45; }
        .track-line .title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .track-line .duration { font-variant-numeric: tabular-nums; opacity:.7; font-weight:500; }
    /* Actions & download supprimés */
        .playlist-tools { display:flex; gap:10px; align-items:center; margin:0 0 16px; }
        .filter-input { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); color:#fff; padding:9px 12px; border-radius:9px; font-size:0.66rem; letter-spacing:.14em; }
        .filter-input:focus { outline:1px solid var(--accent1); box-shadow:0 0 0 3px rgba(255,40,40,0.25); }
        .util-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); color:#fff; border-radius:9px; padding:9px 12px; cursor:pointer; font-size:0.65rem; letter-spacing:.15em; }
        .util-btn:hover { background:linear-gradient(90deg,var(--accent1),var(--accent2)); }
        .mode-toggle { position:absolute; top:10px; right:10px; background:rgba(20,10,12,0.55); border:1px solid rgba(255,60,60,0.25); color:#fff; padding:7px 14px; font-size:0.6rem; letter-spacing:.22em; text-transform:uppercase; border-radius:30px; cursor:pointer; backdrop-filter:blur(8px); transition:.4s; }
        .mode-toggle:hover { background:linear-gradient(90deg,var(--accent1),var(--accent2)); box-shadow:0 6px 22px -6px rgba(255,40,40,0.45); }
    .player-box { margin-top:24px; padding:22px 24px 30px; border-radius:26px; display:none !important; }
        .glass { background:linear-gradient(155deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015)); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.05); box-shadow: 0 14px 42px -14px rgba(0,0,0,0.65); }
        .now-playing { font-size:.68rem; letter-spacing:.32em; margin-bottom:12px; opacity:.82; text-transform:uppercase; }
        .now-playing[data-state='loading'] { opacity:0.95; animation:pulse 1.1s infinite ease-in-out; }
        .now-playing[data-state='error'] { color:#ff4d5b; text-shadow:0 0 7px rgba(255,77,91,0.35); }
        @keyframes pulse { 0% { filter:brightness(1); } 50% { filter:brightness(1.55); } 100% { filter:brightness(1); } }
        .controls { display:flex; gap:12px; margin-bottom:16px; }
        .controls .mini { flex:1; background:#1d1416; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:11px 0; color:#fff; cursor:pointer; font-size:0.8rem; transition:.35s; }
        .controls .mini:hover { background:#261a1c; }
        .progress-row { display:grid; grid-template-columns:44px 1fr 48px; gap:14px; align-items:center; font-size:0.64rem; letter-spacing:.18em; }
        #seekBar { width:100%; -webkit-appearance:none; height:6px; border-radius:4px; background:linear-gradient(90deg,var(--accent1),var(--accent2)); outline:none; cursor:pointer; box-shadow:0 0 0 1px rgba(255,0,0,0.15); }
        #seekBar::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 0 0 5px rgba(255,30,30,0.4); border:none; transition:.25s; }
        #seekBar::-webkit-slider-thumb:hover { transform:scale(1.18); }
    .visualizer-wrap { padding:20px 22px 26px; border-radius:32px; position:relative; overflow:hidden; width:100%; }
        .visualizer { width:100%; height:auto; display:block; }
            /* Image unique sous le visualizer */
            .visual-photo-wrap { margin:0 auto 60px; display:flex; justify-content:flex-end; position:relative; }
            .visual-photo { width:100%; display:block; height:auto; border-radius:26px; object-fit:cover; box-shadow:0 18px 48px -16px rgba(0,0,0,0.65); transition:transform .55s cubic-bezier(.22,.75,.25,1), box-shadow .55s; }
            .visual-photo:hover { transform:scale(1.035); box-shadow:0 26px 70px -20px rgba(0,0,0,0.7); }
            @media (max-width:900px){ .visual-photo { border-radius:20px; } }
        .fallback-playlist { list-style:none; margin:0 0 22px; padding:0; display:flex; flex-direction:column; gap:8px; }
        .fallback-playlist li { background:rgba(255,255,255,0.04); padding:13px 18px; border-radius:12px; cursor:pointer; transition:.35s; }
        .fallback-playlist li:hover { background:rgba(255,255,255,0.08); }
        .fallback-playlist li.active { background:linear-gradient(90deg,var(--accent1),var(--accent2)); }
    .bio-section { margin:10px clamp(20px,6vw,120px) 70px; padding:50px clamp(24px,4vw,82px); border-radius:40px; position:relative; }
        .bio-text { line-height:1.55; font-size:0.92rem; max-width:900px; }
        .bio-highlights { list-style:none; margin:30px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:16px; }
        .bio-highlights li { background:rgba(255,255,255,0.06); border:1px solid rgba(255,80,80,0.25); padding:11px 18px; border-radius:28px; font-size:0.58rem; letter-spacing:.22em; text-transform:uppercase; }
        /* Scrollbars */
        ::-webkit-scrollbar { width:10px; }
        ::-webkit-scrollbar-track { background:rgba(255,255,255,0.04); }
        ::-webkit-scrollbar-thumb { background:linear-gradient(var(--accent1), var(--accent2)); border-radius:50px; }
        /* ================== RESPONSIVE EMPILAGE MOBILE ================== */
        @media (max-width:900px){
            .jeezs-layout { display:flex; flex-direction:column; gap:70px; padding:34px 16px 120px; }
            #jeezs-tracks { width:100% !important; max-width:100% !important; }
            #jeezs-tracks .list-item { width:100% !important; }
            .player-box, .visualizer-wrap, .visual-photo-wrap { width:100% !important; }
            /* Séparation nette entre blocs */
            .playlist-col > *, .visual-col > *, .gallery-col > * { display:block; position:relative; }
            #jeezs-tracks { margin-bottom:54px !important; padding-bottom:10px; }
            .player-box { margin-top:28px; }
            /* Spacing mobile: on garde l'ordre DOM (photo puis visualizer) et on espace via la marge de la photo */
            .visual-photo-wrap { margin:0 0 48px !important; }
            .visualizer-wrap { margin:0 0 0 !important; }
            /* Empêche les overlaps via z-index neutres */
            .playlist-col, .visual-col, .gallery-col { position:relative; z-index:0; }
            .visualizer-wrap, .visual-photo-wrap, .player-box { z-index:1; }
        }
        @media (max-width:560px){
            .track-line { grid-template-columns:30px 1fr 58px; gap:8px; font-size:0.64rem; }
            .track-line .duration { text-align:right; }
            .band-name { letter-spacing:0.12em; }
            .glow-btn { padding:11px 22px; font-size:0.7rem; }
            /* Cache le player sur téléphone (mode iPhone) */
            .player-box { display:none !important; }
            #jeezs-tracks { margin-bottom:60px !important; }
            /* Plus d'espace entre visualizer et photo */
            .visual-photo-wrap { margin:0 0 52px !important; }
            .visualizer-wrap { margin:0 0 0 !important; }
        }
        @media (max-width:420px){
            .track-line { grid-template-columns:26px 1fr 54px; font-size:0.6rem; gap:6px; }
            .visual-photo { border-radius:18px; }
            .visualizer-wrap { padding:16px 16px 22px; }
            .visual-photo-wrap { order:2; margin:20px 0 0; }
            .visualizer-wrap { order:1; }
        }
    `;
    document.head.appendChild(style);
}

