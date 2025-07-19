// Déclaration de la variable pour la bibliothèque de paroles (sera initialisée après la définition des classes)
let lyricsLibrary = null;

// Création des éléments DOM nécessaires (compatible avec les deux environnements)
function initializeDOM() {
    // Vérifier que nous sommes dans un environnement navigateur
    if (typeof document === 'undefined' || typeof $ === 'undefined') {
        console.log('⚠️ Environnement sans DOM ou fonction $ détecté, initialisation DOM ignorée');
        return;
    }

    // Créer le div pour le timecode
    $('div', {
        id: 'timecode',
        css: {
            backgroundColor: '#00f',
            marginLeft: '0',
            padding: '10px',
            color: 'white',
            margin: '10px',
            display: 'inline-block'
        },
    });

    // Créer le conteneur pour l'affichage des paroles
    $('div', {
        id: 'lyrics-container',
        css: {
            width: '100%',
            height: '400px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            margin: '20px 0',
            overflow: 'hidden'
        },
        parent: '#view'
    });

    console.log('✅ Éléments DOM initialisés');
}

// Initialiser le DOM dès que possible
setTimeout(initializeDOM, 10);

// Initialiser l'affichage des paroles après création du DOM
setTimeout(() => {
    // Créer l'affichage des paroles
    if (typeof document !== 'undefined' && document.getElementById('lyrics-container')) {
        lyricsDisplay = new LyricsDisplay('lyrics-container');
        console.log('✅ LyricsDisplay initialisé');
        
        // Créer les chansons de démonstration et charger la première
        const demoSongs = createDemoSongs();
        if (demoSongs && demoSongs.darkboxSong) {
            lyricsDisplay.loadLyrics(demoSongs.darkboxSong);
            console.log('✅ Chanson "The Darkbox" chargée dans l\'affichage');
        }
    } else {
        console.log('⚠️ lyrics-container non trouvé, affichage des paroles non initialisé');
    }
}, 50);

// Fonction générique pour créer des chansons de démonstration
function createDemoSongs() {
	console.log('🎵 Création des chansons de démonstration...');
	
	// Chanson 1: The Darkbox
	const darkboxData = {
		title: "The Darkbox",
		artist: "Atome Artist",
		album: "Demo Album",
		lyrics: [
			{ time: 0, text: "Spread the words", type: "vocal" },
			{ time: 2000, text: "That'll burn your mind", type: "vocal" },
			{ time: 4000, text: "Seal your eyes", type: "vocal" },
			{ time: 6000, text: "Shut your ears", type: "vocal" },
			{ time: 8000, text: "Swallow this and dive inside", type: "vocal" },
			{ time: 10000, text: "dive inside", type: "vocal" },
			{ time: 11000, text: "dive inside", type: "vocal" },
			{ time: 12000, text: "dive inside", type: "vocal" },
			{ time: 14000, text: "", type: "instrumental" },
			{ time: 16000, text: "The darkbox...", type: "chorus" },
			{ time: 18000, text: "", type: "instrumental" },
			{ time: 20000, text: "Do you wanna be scared", type: "vocal" },
			{ time: 22000, text: "No real fun won't begin", type: "vocal" },
			{ time: 24000, text: "Stay away from what is there", type: "vocal" },
			{ time: 26000, text: "", type: "instrumental" },
			{ time: 28000, text: "Close your mind", type: "vocal" },
			{ time: 30000, text: "Widely shut,", type: "vocal" },
			{ time: 32000, text: "You won't see it's a trap", type: "vocal" },
			{ time: 34000, text: "A golden coffin for your mind", type: "vocal" },
			{ time: 36000, text: "", type: "instrumental" },
			{ time: 38000, text: "The darkbox", type: "chorus" },
			{ time: 40000, text: "", type: "instrumental" },
			{ time: 42000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
			{ time: 45000, text: "No satisfaction out of the box", type: "vocal" },
			{ time: 48000, text: "", type: "instrumental" },
			{ time: 50000, text: "Ghost box, stay away from this dark box", type: "vocal" },
			{ time: 53000, text: "Destroy this fuckin' Pandora's box", type: "vocal" },
			{ time: 56000, text: "", type: "instrumental" },
			{ time: 58000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
			{ time: 61000, text: "No satisfaction out of the box", type: "vocal" },
			{ time: 64000, text: "", type: "instrumental" },
			{ time: 66000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
			{ time: 69000, text: "Smash that nightmare box", type: "vocal" },
			{ time: 72000, text: "", type: "instrumental" },
			{ time: 74000, text: "Smash that nightmare box", type: "vocal" },
			{ time: 76000, text: "Smash that nightmare box", type: "vocal" }
		]
	};
	
	// Chanson 2: Une autre chanson de demo
	const demoSong2Data = {
		title: "Digital Dreams",
		artist: "Cyber Collective",
		album: "Electronic Visions",
		lyrics: [
			{ time: 0, text: "In the neon lights we find", type: "vocal" },
			{ time: 3000, text: "Digital dreams of a different kind", type: "vocal" },
			{ time: 6000, text: "Circuits dancing in the night", type: "vocal" },
			{ time: 9000, text: "Electric souls burning bright", type: "vocal" },
			{ time: 12000, text: "", type: "instrumental" },
			{ time: 15000, text: "Download my heart", type: "chorus" },
			{ time: 18000, text: "Upload your soul", type: "chorus" },
			{ time: 21000, text: "In this digital world", type: "chorus" },
			{ time: 24000, text: "We lose control", type: "chorus" }
		]
	};
	
	// Créer les chansons
	const darkboxSong = lyricsLibrary.createDemoSong(darkboxData);
	const digitalDreamsSong = lyricsLibrary.createDemoSong(demoSong2Data);
	
	console.log('✅ Chansons créées:');
	console.log('  - The Darkbox (ID:', darkboxSong.songId, ')');
	console.log('  - Digital Dreams (ID:', digitalDreamsSong.songId, ')');
	
	return { darkboxSong, digitalDreamsSong };
}

// Fonction pour chercher et charger une chanson
function loadSongByName(searchTerm) {
	const results = lyricsLibrary.searchSongs(searchTerm);
	
	if (results.length === 0) {
		console.log('❌ Aucune chanson trouvée pour:', searchTerm);
		return null;
	}
	
	if (results.length === 1) {
		const song = lyricsLibrary.loadSongById(results[0].songId);
		console.log('✅ Chanson chargée:', song.metadata.title, 'par', song.metadata.artist);
		return song;
	}
	
	// Plusieurs résultats
	console.log('🔍 Plusieurs chansons trouvées pour "' + searchTerm + '":');
	results.forEach((result, index) => {
		console.log(`  ${index + 1}. ${result.title} - ${result.artist} (ID: ${result.songId})`);
	});
	
	// Retourner la première par défaut
	const song = lyricsLibrary.loadSongById(results[0].songId);
	console.log('✅ Première chanson chargée:', song.metadata.title);
	return song;
}

// Fonction pour afficher les statistiques de la bibliothèque
function showLibraryStats() {
	const stats = lyricsLibrary.getStats();
	console.log('📊 Statistiques de la bibliothèque:');
	console.log(`  - ${stats.totalSongs} chansons`);
	console.log(`  - ${stats.uniqueArtists} artistes uniques`);
	console.log(`  - ${stats.totalLines} lignes de paroles`);
	console.log(`  - Durée totale: ${(stats.totalDuration / 1000 / 60).toFixed(1)} minutes`);
	
	return stats;
}

// Fonction pour charger une chanson dans l'affichage
function loadSongInDisplay(songName) {
	if (!lyricsDisplay) {
		console.log('❌ LyricsDisplay non initialisé');
		return null;
	}
	
	const song = loadSongByName(songName);
	if (song) {
		lyricsDisplay.loadLyrics(song);
		console.log('✅ Chanson chargée dans l\'affichage:', song.metadata.title);
		return song;
	}
	
	return null;
}

// Fonction pour tester l'affichage des paroles avec un timecode spécifique
function testLyricsAtTime(timeMs) {
	if (!lyricsDisplay || !lyricsDisplay.currentLyrics) {
		console.log('❌ Aucune chanson chargée dans l\'affichage');
		return;
	}
	
	console.log(`🎵 Test à ${timeMs}ms (${(timeMs/1000).toFixed(1)}s)`);
	lyricsDisplay.updateTime(timeMs);
	
	const activeLine = lyricsDisplay.currentLyrics.getActiveLineAt(timeMs);
	if (activeLine) {
		console.log('  Ligne active:', activeLine.text);
	} else {
		console.log('  Aucune ligne active à ce moment');
	}
}

// Fonction pour changer la taille de police
function setFontSize(size) {
	if (!lyricsDisplay) {
		console.log('❌ LyricsDisplay non initialisé');
		return;
	}
	
	lyricsDisplay.fontSize = size;
	const slider = document.getElementById('font-size-slider');
	const display = document.getElementById('font-size-display');
	
	if (slider) slider.value = size;
	if (display) display.textContent = size + 'px';
	
	lyricsDisplay.updateFontSize();
	console.log('✅ Taille de police changée à', size + 'px');
}

// Fonction pour activer/désactiver le mode édition
function toggleEditMode() {
	if (!lyricsDisplay) {
		console.log('❌ LyricsDisplay non initialisé');
		return;
	}
	
	const editBtn = document.getElementById('edit-mode-btn');
	if (editBtn) {
		editBtn.click();
	}
}

// Fonction pour ajouter une nouvelle ligne de paroles
function addNewLyricLine(timeMs, text, type = 'vocal') {
	if (!lyricsDisplay || !lyricsDisplay.currentLyrics) {
		console.log('❌ Aucune chanson chargée');
		return;
	}
	
	lyricsDisplay.currentLyrics.addLine(timeMs, text, type);
	lyricsDisplay.renderLines();
	
	// Sauvegarder
	if (lyricsLibrary) {
		lyricsLibrary.saveSong(lyricsDisplay.currentLyrics);
	}
	
	console.log('✅ Nouvelle ligne ajoutée:', text, 'à', (timeMs/1000).toFixed(1) + 's');
}

// Exemple d'utilisation et création d'un objet de paroles synchronisées
function createDarkboxLyrics() {
	console.warn('⚠️ createDarkboxLyrics() est obsolète. Utilisez createDemoSongs() à la place.');
	
	// Pour la compatibilité, charger depuis la bibliothèque
	const darkboxSong = loadSongByName("darkbox");
	if (darkboxSong) {
		return darkboxSong;
	}
	
	// Si pas trouvé, créer les chansons de démo
	const { darkboxSong: newSong } = createDemoSongs();
	return newSong;
}

// Initialiser l'affichage des paroles
let lyricsDisplay = null;

// Fonction pour recevoir et afficher le timecode depuis AUv3
function updateTimecode(timecodeMs) {
    console.log('🎵 Timecode reçu:', timecodeMs, 'ms');
    
    // Convertir en secondes pour un affichage plus lisible
    const seconds = (timecodeMs / 1000).toFixed(3);
    console.log('🎵 Position:', seconds, 'secondes');
    
    // Utiliser la div timecode créée dynamiquement
    const timecodeElement = document.getElementById('timecode');
    if (timecodeElement) {
        timecodeElement.textContent = `${seconds}s`;
    }
}

// Modifier la fonction displayTransportInfo pour mettre à jour les paroles
function displayTransportInfo(isPlaying, playheadPosition, sampleRate) {
	console.log('🎵 Transport Info:');
	console.log('  - Is Playing:', isPlaying);
	console.log('  - Playhead Position:', playheadPosition);
	console.log('  - Sample Rate:', sampleRate);
	
	// Convertir la position en millisecondes si nécessaire
	const positionMs = (playheadPosition / sampleRate) * 1000;
	
	// Mettre à jour l'affichage du timecode
	updateTimecode(positionMs);
	
	// Mettre à jour l'affichage des paroles synchronisées
	if (lyricsDisplay) {
		lyricsDisplay.updateTime(positionMs);
	}
	
	// Optionnel : ajouter un indicateur de lecture/pause
	const timecodeElement = document.getElementById('timecode');
	if (timecodeElement) {
		const seconds = (positionMs / 1000).toFixed(3);
		const playIcon = isPlaying ? '▶️' : '⏸️';
		timecodeElement.textContent = `${playIcon} ${seconds}s`;
		
		// Changer la couleur selon l'état
		timecodeElement.style.backgroundColor = isPlaying ? '#0a0' : '#a00';
	}
}

// Gestionnaire de bibliothèque de paroles synchronisées
class LyricsLibrary {
	constructor() {
		this.storagePrefix = 'lyrics_';
	}

	// Créer une nouvelle chanson avec paroles synchronisées
	createSong(title, artist, album = '', duration = 0) {
		const songId = this.generateSongId(title, artist);
		return new SyncedLyrics(title, artist, album, duration, songId);
	}

	// Générer un ID unique pour une chanson
	generateSongId(title, artist) {
		const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
		const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '_');
		const timestamp = Date.now();
		return `${normalizedArtist}_${normalizedTitle}_${timestamp}`;
	}

	// Sauvegarder une chanson dans la bibliothèque
	saveSong(syncedLyrics) {
		const storageKey = this.storagePrefix + syncedLyrics.songId;
		try {
			localStorage.setItem(storageKey, JSON.stringify(syncedLyrics));
			console.log('✅ Chanson sauvegardée:', syncedLyrics.metadata.title, 'avec ID:', syncedLyrics.songId);
			return storageKey;
		} catch (error) {
			console.error('❌ Erreur de sauvegarde:', error);
			return null;
		}
	}

	// Charger une chanson par son ID
	loadSongById(songId) {
		const storageKey = this.storagePrefix + songId;
		return this.loadSongByKey(storageKey);
	}

	// Charger une chanson par sa clé de stockage
	loadSongByKey(storageKey) {
		try {
			const data = localStorage.getItem(storageKey);
			if (!data) return null;
			
			const parsed = JSON.parse(data);
			const lyrics = new SyncedLyrics(
				parsed.metadata.title,
				parsed.metadata.artist,
				parsed.metadata.album,
				parsed.metadata.duration,
				parsed.songId
			);
			
			lyrics.lines = parsed.lines;
			lyrics.metadata = parsed.metadata;
			return lyrics;
		} catch (error) {
			console.error('❌ Erreur de chargement:', error);
			return null;
		}
	}

	// Rechercher des chansons par titre (recherche partielle)
	searchByTitle(searchTerm) {
		const allSongs = this.getAllSongs();
		const normalizedSearch = searchTerm.toLowerCase();
		return allSongs.filter(song => 
			song.title.toLowerCase().includes(normalizedSearch)
		);
	}

	// Rechercher des chansons par artiste (recherche partielle)
	searchByArtist(searchTerm) {
		const allSongs = this.getAllSongs();
		const normalizedSearch = searchTerm.toLowerCase();
		return allSongs.filter(song => 
			song.artist.toLowerCase().includes(normalizedSearch)
		);
	}

	// Rechercher dans titre ET artiste
	searchSongs(searchTerm) {
		const allSongs = this.getAllSongs();
		const normalizedSearch = searchTerm.toLowerCase();
		return allSongs.filter(song => 
			song.title.toLowerCase().includes(normalizedSearch) ||
			song.artist.toLowerCase().includes(normalizedSearch)
		);
	}

	// Obtenir toutes les chansons de la bibliothèque
	getAllSongs() {
		const keys = Object.keys(localStorage).filter(key => key.startsWith(this.storagePrefix));
		return keys.map(key => {
			try {
				const data = JSON.parse(localStorage.getItem(key));
				return {
					key: key,
					songId: data.songId,
					title: data.metadata.title,
					artist: data.metadata.artist,
					album: data.metadata.album,
					duration: data.metadata.duration,
					lastModified: data.metadata.lastModified,
					linesCount: data.lines.length
				};
			} catch {
				return null;
			}
		}).filter(item => item !== null);
	}

	// Supprimer une chanson
	deleteSong(songId) {
		const storageKey = this.storagePrefix + songId;
		try {
			localStorage.removeItem(storageKey);
			console.log('🗑️ Chanson supprimée:', songId);
			return true;
		} catch (error) {
			console.error('❌ Erreur de suppression:', error);
			return false;
		}
	}

	// Obtenir des statistiques de la bibliothèque
	getStats() {
		const songs = this.getAllSongs();
		const artists = [...new Set(songs.map(s => s.artist))];
		const totalDuration = songs.reduce((sum, s) => sum + s.duration, 0);
		
		return {
			totalSongs: songs.length,
			uniqueArtists: artists.length,
			totalDuration: totalDuration,
			totalLines: songs.reduce((sum, s) => sum + s.linesCount, 0)
		};
	}

	// Créer une chanson de démonstration
	createDemoSong(songData) {
		const { title, artist, album, lyrics } = songData;
		const song = this.createSong(title, artist, album);
		
		// Ajouter les paroles
		lyrics.forEach(lyric => {
			song.addLine(lyric.time, lyric.text, lyric.type || 'vocal');
		});
		
		// Sauvegarder
		this.saveSong(song);
		return song;
	}
}

// Initialisation de la bibliothèque de paroles après la définition de la classe
lyricsLibrary = new LyricsLibrary();

// Modifier la classe SyncedLyrics pour inclure un songId
class SyncedLyrics {
	constructor(title, artist, album = '', duration = 0, songId = null) {
		this.songId = songId || this.generateSongId(title, artist);
		this.metadata = {
			title: title,
			artist: artist,
			album: album,
			duration: duration, // en millisecondes
			format: 'syncedlyrics-v1.0',
			created: new Date().toISOString(),
			lastModified: new Date().toISOString()
		};
		this.lines = []; // Array d'objets {time, text, type}
		this.version = '1.0';
	}

	// Générer un ID unique pour la chanson
	generateSongId(title, artist) {
		const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
		const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '_');
		const timestamp = Date.now();
		return `${normalizedArtist}_${normalizedTitle}_${timestamp}`;
	}

	// Ajouter une ligne de paroles avec timecode
	addLine(timeMs, text, type = 'vocal') {
		this.lines.push({
			time: timeMs,
			text: text.trim(),
			type: type, // 'vocal', 'chorus', 'bridge', 'instrumental', 'outro'
			id: this.generateLineId()
		});
		this.sortLines();
		this.updateLastModified();
		return this;
	}

	// Ajouter plusieurs lignes d'un coup
	addLines(linesArray) {
		linesArray.forEach(line => {
			this.addLine(line.time, line.text, line.type || 'vocal');
		});
		return this;
	}

	// Générer un ID unique pour chaque ligne
	generateLineId() {
		return 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}

	// Trier les lignes par timecode
	sortLines() {
		this.lines.sort((a, b) => a.time - b.time);
	}

	// Mettre à jour la date de modification
	updateLastModified() {
		this.metadata.lastModified = new Date().toISOString();
	}

	// Obtenir la ligne active pour un timecode donné
	getActiveLineAt(timeMs) {
		let activeLine = null;
		for (let i = 0; i < this.lines.length; i++) {
			if (this.lines[i].time <= timeMs) {
				activeLine = this.lines[i];
			} else {
				break;
			}
		}
		return activeLine;
	}

	// Obtenir la prochaine ligne
	getNextLineAfter(timeMs) {
		return this.lines.find(line => line.time > timeMs) || null;
	}

	// Sauvegarder dans localStorage
	saveToStorage(key = null) {
		// Utiliser le songId comme clé si aucune clé n'est fournie
		const storageKey = key || `lyrics_${this.songId}`;
		try {
			localStorage.setItem(storageKey, JSON.stringify(this));
			console.log('✅ Paroles sauvegardées:', storageKey);
			return storageKey;
		} catch (error) {
			console.error('❌ Erreur de sauvegarde:', error);
			return null;
		}
	}

	// Charger depuis localStorage
	static loadFromStorage(key) {
		try {
			const data = localStorage.getItem(key);
			if (!data) return null;
			
			const parsed = JSON.parse(data);
			const lyrics = new SyncedLyrics(
				parsed.metadata.title,
				parsed.metadata.artist,
				parsed.metadata.album,
				parsed.metadata.duration,
				parsed.songId
			);
			
			lyrics.lines = parsed.lines;
			lyrics.metadata = parsed.metadata;
			return lyrics;
		} catch (error) {
			console.error('❌ Erreur de chargement:', error);
			return null;
		}
	}

	// Exporter au format LRC (standard karaoké)
	toLRC() {
		let lrc = `[ti:${this.metadata.title}]\n`;
		lrc += `[ar:${this.metadata.artist}]\n`;
		if (this.metadata.album) lrc += `[al:${this.metadata.album}]\n`;
		lrc += `[length:${this.formatTime(this.metadata.duration)}]\n\n`;
		
		this.lines.forEach(line => {
			const timeFormatted = this.formatTime(line.time);
			lrc += `[${timeFormatted}]${line.text}\n`;
		});
		
		return lrc;
	}

	// Formater le temps en MM:SS.xx pour LRC
	formatTime(ms) {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		const centiseconds = Math.floor((ms % 1000) / 10);
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
	}

	// Importer depuis format LRC
	static fromLRC(lrcContent) {
		const lines = lrcContent.split('\n');
		let title = '', artist = '', album = '';
		const syncedLines = [];

		lines.forEach(line => {
			const titleMatch = line.match(/\[ti:(.*?)\]/);
			const artistMatch = line.match(/\[ar:(.*?)\]/);
			const albumMatch = line.match(/\[al:(.*?)\]/);
			const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);

			if (titleMatch) title = titleMatch[1];
			if (artistMatch) artist = artistMatch[1];
			if (albumMatch) album = albumMatch[1];
			if (timeMatch) {
				const minutes = parseInt(timeMatch[1]);
				const seconds = parseInt(timeMatch[2]);
				const centiseconds = parseInt(timeMatch[3]);
				const timeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
				const text = timeMatch[4].trim();
				if (text) {
					syncedLines.push({ time: timeMs, text: text });
				}
			}
		});

		const lyrics = new SyncedLyrics(title, artist, album);
		lyrics.addLines(syncedLines);
		return lyrics;
	}

	// Obtenir la liste de toutes les paroles stockées
	static getAllStoredLyrics() {
		const keys = Object.keys(localStorage).filter(key => key.startsWith('lyrics_'));
		return keys.map(key => {
			try {
				const data = JSON.parse(localStorage.getItem(key));
				return {
					key: key,
					title: data.metadata.title,
					artist: data.metadata.artist,
					lastModified: data.metadata.lastModified
				};
			} catch {
				return null;
			}
		}).filter(item => item !== null);
	}
}

// Gestionnaire de paroles synchronisées pour l'interface
class LyricsDisplay {
	constructor(containerId) {
		this.container = document.getElementById(containerId);
		this.currentLyrics = null;
		this.currentTime = 0;
		this.activeLine = null;
		this.fontSize = 16; // Taille de police par défaut
		this.editMode = false; // Mode édition
		this.setupDisplay();
	}

	setupDisplay() {
		if (!this.container) {
			console.error('Container non trouvé pour LyricsDisplay');
			return;
		}
		
		this.container.innerHTML = `
			<div id="lyrics-header" style="padding: 10px; background: #333; color: white;">
				<h3 id="song-title">Aucune chanson</h3>
				<p id="song-artist">-</p>
			</div>
			<div id="lyrics-controls" style="padding: 10px; background: #444; color: white; display: flex; gap: 10px; align-items: center;">
				<label>Taille:</label>
				<input type="range" id="font-size-slider" min="10" max="32" value="${this.fontSize}" style="width: 100px;">
				<span id="font-size-display">${this.fontSize}px</span>
				<button id="edit-mode-btn" style="padding: 5px 10px; margin-left: 20px;">Mode Édition</button>
				<button id="save-lyrics-btn" style="padding: 5px 10px; display: none;">Sauvegarder</button>
			</div>
			<div id="lyrics-content" style="height: 300px; overflow-y: auto; padding: 20px;">
				<p style="text-align: center; color: #666;">Chargez des paroles synchronisées</p>
			</div>
		`;
		
		this.setupEventListeners();
	}

	setupEventListeners() {
		// Contrôle de la taille de police
		const fontSizeSlider = document.getElementById('font-size-slider');
		const fontSizeDisplay = document.getElementById('font-size-display');
		
		if (fontSizeSlider) {
			fontSizeSlider.addEventListener('input', (e) => {
				this.fontSize = parseInt(e.target.value);
				fontSizeDisplay.textContent = this.fontSize + 'px';
				this.updateFontSize();
			});
		}
		
		// Bouton mode édition
		const editModeBtn = document.getElementById('edit-mode-btn');
		const saveLyricsBtn = document.getElementById('save-lyrics-btn');
		
		if (editModeBtn) {
			editModeBtn.addEventListener('click', () => {
				this.editMode = !this.editMode;
				editModeBtn.textContent = this.editMode ? 'Mode Lecture' : 'Mode Édition';
				editModeBtn.style.backgroundColor = this.editMode ? '#f39c12' : '#2c3e50';
				saveLyricsBtn.style.display = this.editMode ? 'inline-block' : 'none';
				this.toggleEditMode();
			});
		}
		
		// Bouton sauvegarder
		if (saveLyricsBtn) {
			saveLyricsBtn.addEventListener('click', () => {
				this.saveLyricsChanges();
			});
		}
	}

	updateFontSize() {
		document.querySelectorAll('.lyrics-line').forEach(el => {
			el.style.fontSize = this.fontSize + 'px';
		});
	}

	toggleEditMode() {
		const lyricsLines = document.querySelectorAll('.lyrics-line');
		
		lyricsLines.forEach(line => {
			if (this.editMode) {
				// Activer l'édition
				line.contentEditable = true;
				line.style.border = '1px dashed #555';
				line.style.padding = '10px';
				line.style.cursor = 'text';
				
				// Ajouter contrôles de timecode
				this.addTimecodeControl(line);
			} else {
				// Désactiver l'édition
				line.contentEditable = false;
				line.style.border = 'none';
				line.style.padding = '8px 0';
				line.style.cursor = 'default';
				
				// Retirer contrôles de timecode
				this.removeTimecodeControl(line);
			}
		});
	}

	addTimecodeControl(lineElement) {
		// Vérifier si le contrôle n'existe pas déjà
		if (lineElement.querySelector('.timecode-control')) return;
		
		const lineId = lineElement.id;
		const lineData = this.currentLyrics.lines.find(l => l.id === lineId);
		
		if (lineData) {
			const timecodeControl = document.createElement('div');
			timecodeControl.className = 'timecode-control';
			timecodeControl.style.cssText = `
				display: flex;
				align-items: center;
				gap: 10px;
				margin-top: 5px;
				padding: 5px;
				background: rgba(0, 0, 0, 0.3);
				border-radius: 4px;
				font-size: 12px;
			`;
			
			const timeSeconds = (lineData.time / 1000).toFixed(1);
			timecodeControl.innerHTML = `
				<label>Temps:</label>
				<input type="number" class="time-input" value="${timeSeconds}" step="0.1" style="width: 70px; padding: 2px;">
				<span>s</span>
				<label>Type:</label>
				<select class="type-select" style="padding: 2px;">
					<option value="vocal" ${lineData.type === 'vocal' ? 'selected' : ''}>Vocal</option>
					<option value="chorus" ${lineData.type === 'chorus' ? 'selected' : ''}>Refrain</option>
					<option value="bridge" ${lineData.type === 'bridge' ? 'selected' : ''}>Pont</option>
					<option value="instrumental" ${lineData.type === 'instrumental' ? 'selected' : ''}>Instrumental</option>
				</select>
			`;
			
			lineElement.appendChild(timecodeControl);
		}
	}

	removeTimecodeControl(lineElement) {
		const control = lineElement.querySelector('.timecode-control');
		if (control) {
			control.remove();
		}
	}

	saveLyricsChanges() {
		if (!this.currentLyrics || !this.editMode) return;
		
		const lyricsLines = document.querySelectorAll('.lyrics-line');
		const updatedLines = [];
		
		lyricsLines.forEach(lineElement => {
			const lineId = lineElement.id;
			const originalLine = this.currentLyrics.lines.find(l => l.id === lineId);
			
			if (originalLine) {
				// Récupérer le nouveau texte (sans le contrôle de timecode)
				const textContent = lineElement.childNodes[0].textContent.trim();
				
				// Récupérer les nouvelles valeurs de temps et type
				const timeInput = lineElement.querySelector('.time-input');
				const typeSelect = lineElement.querySelector('.type-select');
				
				const newTime = timeInput ? parseFloat(timeInput.value) * 1000 : originalLine.time;
				const newType = typeSelect ? typeSelect.value : originalLine.type;
				
				updatedLines.push({
					id: lineId,
					time: newTime,
					text: textContent,
					type: newType
				});
			}
		});
		
		// Mettre à jour les paroles
		this.currentLyrics.lines = updatedLines;
		this.currentLyrics.sortLines();
		this.currentLyrics.updateLastModified();
		
		// Sauvegarder dans localStorage si c'est une chanson de la bibliothèque
		if (lyricsLibrary) {
			lyricsLibrary.saveSong(this.currentLyrics);
		}
		
		console.log('✅ Modifications sauvegardées');
		
		// Rafraîchir l'affichage
		this.renderLines();
		this.toggleEditMode(); // Réactiver le mode édition pour voir les changements
	}

	loadLyrics(syncedLyrics) {
		this.currentLyrics = syncedLyrics;
		this.updateHeader();
		this.renderLines();
	}

	updateHeader() {
		if (!this.currentLyrics) return;
		
		document.getElementById('song-title').textContent = this.currentLyrics.metadata.title;
		document.getElementById('song-artist').textContent = this.currentLyrics.metadata.artist;
	}

	renderLines() {
		if (!this.currentLyrics) return;
		
		const content = document.getElementById('lyrics-content');
		content.innerHTML = '';
		
		this.currentLyrics.lines.forEach((line, index) => {
			const lineElement = document.createElement('div');
			lineElement.className = 'lyrics-line';
			lineElement.id = line.id;
			lineElement.style.cssText = `
				padding: 8px 0;
				font-size: ${this.fontSize}px;
				transition: all 0.3s ease;
				color: #666;
				line-height: 1.4;
				cursor: ${this.editMode ? 'text' : 'default'};
			`;
			lineElement.textContent = line.text;
			
			// Si en mode édition, ajouter les contrôles
			if (this.editMode) {
				lineElement.contentEditable = true;
				lineElement.style.border = '1px dashed #555';
				lineElement.style.padding = '10px';
				this.addTimecodeControl(lineElement);
			}
			
			content.appendChild(lineElement);
		});
	}

	updateTime(timeMs) {
		this.currentTime = timeMs;
		if (!this.currentLyrics) return;

		const activeLine = this.currentLyrics.getActiveLineAt(timeMs);
		if (activeLine && activeLine !== this.activeLine) {
			this.highlightLine(activeLine);
			this.activeLine = activeLine;
		}
	}

	highlightLine(line) {
		// Retirer le highlight précédent
		document.querySelectorAll('.lyrics-line').forEach(el => {
			el.style.color = '#666';
			el.style.fontWeight = 'normal';
			el.style.backgroundColor = 'transparent';
		});

		// Highlight la ligne active
		const lineElement = document.getElementById(line.id);
		if (lineElement) {
			lineElement.style.color = '#fff';
			lineElement.style.fontWeight = 'bold';
			lineElement.style.backgroundColor = 'rgba(0, 150, 255, 0.2)';
			
			// Scroll vers la ligne active
			lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}
}

// Rendre les fonctions globales pour qu'elles soient accessibles depuis Swift
// Vérification de compatibilité pour les deux environnements (avec/sans AUv3)
if (typeof window !== 'undefined') {
	// Environnement navigateur (pur JS ou AUv3)
	window.updateTimecode = updateTimecode;
	window.displayTransportInfo = displayTransportInfo;
	window.SyncedLyrics = SyncedLyrics;
	window.LyricsDisplay = LyricsDisplay;
	window.LyricsLibrary = LyricsLibrary;
	window.lyricsLibrary = lyricsLibrary;
	window.loadSongByName = loadSongByName;
	window.showLibraryStats = showLibraryStats;
	window.createDemoSongs = createDemoSongs;
	window.loadSongInDisplay = loadSongInDisplay;
	window.testLyricsAtTime = testLyricsAtTime;
	window.setFontSize = setFontSize;
	window.toggleEditMode = toggleEditMode;
	window.addNewLyricLine = addNewLyricLine;
	
	// Debug: Vérifier que les fonctions sont bien exposées
	console.log('🔧 Fonctions exposées globalement:');
	console.log('  - updateTimecode:', typeof window.updateTimecode);
	console.log('  - displayTransportInfo:', typeof window.displayTransportInfo);
	console.log('  - lyricsLibrary:', typeof window.lyricsLibrary);
	console.log('  - loadSongInDisplay:', typeof window.loadSongInDisplay);
	console.log('  - testLyricsAtTime:', typeof window.testLyricsAtTime);
	console.log('  - setFontSize:', typeof window.setFontSize);
	console.log('  - toggleEditMode:', typeof window.toggleEditMode);
	console.log('  - addNewLyricLine:', typeof window.addNewLyricLine);
} else {
	// Environnement Node.js ou autre
	console.log('⚠️ Environnement sans window object détecté');
}