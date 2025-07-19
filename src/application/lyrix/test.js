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

// Fonction pour créer une nouvelle chanson via code
function createNewSong(title, artist, album = '') {
	if (!title || !artist) {
		console.log('❌ Titre et artiste requis');
		return null;
	}
	
	const newSong = lyricsLibrary.createSong(title, artist, album);
	newSong.addLine(0, 'Première ligne de paroles...', 'vocal');
	lyricsLibrary.saveSong(newSong);
	
	console.log('✅ Nouvelle chanson créée:', title, 'par', artist);
	return newSong;
}

// Fonction pour supprimer une chanson
function deleteSong(songIdentifier) {
	let songId = songIdentifier;
	
	// Si c'est un nom, chercher l'ID
	if (typeof songIdentifier === 'string' && !songIdentifier.includes('_')) {
		const results = lyricsLibrary.searchSongs(songIdentifier);
		if (results.length === 0) {
			console.log('❌ Chanson non trouvée:', songIdentifier);
			return false;
		}
		songId = results[0].songId;
	}
	
	const success = lyricsLibrary.deleteSong(songId);
	if (success && lyricsDisplay) {
		lyricsDisplay.refreshSongsList();
	}
	
	return success;
}

// Fonction pour lister toutes les chansons
function listAllSongs() {
	const songs = lyricsLibrary.getAllSongs();
	console.log('📚 Chansons dans la bibliothèque:');
	songs.forEach((song, index) => {
		console.log(`  ${index + 1}. "${song.title}" - ${song.artist} (${song.linesCount} lignes)`);
	});
	return songs;
}

// Fonction pour ouvrir/fermer le gestionnaire de chansons
function toggleSongManager() {
	if (!lyricsDisplay) {
		console.log('❌ LyricsDisplay non initialisé');
		return;
	}
	
	const btn = document.getElementById('song-manager-btn');
	if (btn) {
		btn.click();
	}
}

// Fonction pour contrôler le mode plein écran
function fullscreen(enable) {
	if (!lyricsDisplay) {
		console.log('❌ LyricsDisplay non initialisé');
		return false;
	}
	
	if (typeof enable === 'boolean') {
		lyricsDisplay.setFullscreen(enable);
		return enable;
	} else {
		// Si pas de paramètre, basculer
		lyricsDisplay.toggleFullscreen();
		return lyricsDisplay.isFullscreen;
	}
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
		this.isFullscreen = false; // Mode plein écran
		this.longPressTimer = null; // Timer pour le clic long
		this.originalStyles = {}; // Styles originaux pour la restauration
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
			<div id="lyrics-controls" style="padding: 10px; background: #444; color: white; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
				<label>Taille:</label>
				<input type="range" id="font-size-slider" min="10" max="120" value="${this.fontSize}" style="width: 100px;">
				<span id="font-size-display">${this.fontSize}px</span>
				<button id="edit-mode-btn" style="padding: 5px 10px; margin-left: 20px;">Mode Édition</button>
				<button id="save-lyrics-btn" style="padding: 5px 10px; display: none;">Sauvegarder</button>
				<button id="song-manager-btn" style="padding: 5px 10px; margin-left: 20px; background: #27ae60;">Gérer Chansons</button>
				<button id="fullscreen-btn" style="padding: 5px 10px; margin-left: 20px; background: #9b59b6;">Plein Écran</button>
			</div>
			<div id="song-manager" style="display: none; padding: 15px; background: #2c3e50; color: white; border-top: 1px solid #555;">
				<div style="display: flex; gap: 15px; margin-bottom: 15px;">
					<div style="flex: 1;">
						<h4 style="margin: 0 0 10px 0;">Nouvelle Chanson</h4>
						<input type="text" id="new-song-title" placeholder="Titre" style="width: 100%; margin-bottom: 5px; padding: 5px;">
						<input type="text" id="new-song-artist" placeholder="Artiste" style="width: 100%; margin-bottom: 5px; padding: 5px;">
						<input type="text" id="new-song-album" placeholder="Album (optionnel)" style="width: 100%; margin-bottom: 10px; padding: 5px;">
						<button id="create-song-btn" style="padding: 8px 15px; background: #27ae60; color: white; border: none;">Créer</button>
					</div>
					<div style="flex: 2;">
						<h4 style="margin: 0 0 10px 0;">Bibliothèque de Chansons</h4>
						<div id="songs-list" style="max-height: 200px; overflow-y: auto; background: #34495e; padding: 10px; border-radius: 4px;">
							<p style="color: #bdc3c7;">Chargement...</p>
						</div>
					</div>
				</div>
				<div style="text-align: center;">
					<button id="refresh-songs-btn" style="padding: 5px 10px; margin-right: 10px;">Actualiser</button>
					<button id="close-manager-btn" style="padding: 5px 10px; background: #95a5a6;">Fermer</button>
				</div>
			</div>
			<div id="lyrics-content" style="height: 300px; overflow-y: auto; padding: 20px; position: relative;">
				<div id="drop-zone" style="
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background: rgba(52, 152, 219, 0.1);
					border: 2px dashed #3498db;
					display: none;
					justify-content: center;
					align-items: center;
					font-size: 18px;
					color: #3498db;
					z-index: 10;
					pointer-events: none;
				">
					📄 Déposez un fichier texte ici pour créer une nouvelle chanson
				</div>
				<p style="text-align: center; color: #666;">Chargez des paroles synchronisées</p>
			</div>
		`;
		
		this.setupEventListeners();
		this.refreshSongsList();
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
		
		// Gestionnaire de chansons
		this.setupSongManagerListeners();
		
		// Mode plein écran
		this.setupFullscreenListeners();
		
		// Drag and drop de fichiers
		this.setupDragAndDropListeners();
	}

	setupSongManagerListeners() {
		// Bouton ouvrir/fermer gestionnaire
		const songManagerBtn = document.getElementById('song-manager-btn');
		const songManager = document.getElementById('song-manager');
		const closeManagerBtn = document.getElementById('close-manager-btn');
		
		if (songManagerBtn) {
			songManagerBtn.addEventListener('click', () => {
				const isVisible = songManager.style.display !== 'none';
				songManager.style.display = isVisible ? 'none' : 'block';
				songManagerBtn.textContent = isVisible ? 'Gérer Chansons' : 'Fermer Gestion';
				if (!isVisible) {
					this.refreshSongsList();
				}
			});
		}
		
		if (closeManagerBtn) {
			closeManagerBtn.addEventListener('click', () => {
				songManager.style.display = 'none';
				songManagerBtn.textContent = 'Gérer Chansons';
			});
		}
		
		// Bouton créer chanson
		const createSongBtn = document.getElementById('create-song-btn');
		if (createSongBtn) {
			createSongBtn.addEventListener('click', () => {
				this.createNewSong();
			});
		}
		
		// Bouton actualiser
		const refreshSongsBtn = document.getElementById('refresh-songs-btn');
		if (refreshSongsBtn) {
			refreshSongsBtn.addEventListener('click', () => {
				this.refreshSongsList();
			});
		}
		
		// Entrée sur Enter pour créer chanson
		const titleInput = document.getElementById('new-song-title');
		const artistInput = document.getElementById('new-song-artist');
		const albumInput = document.getElementById('new-song-album');
		
		[titleInput, artistInput, albumInput].forEach(input => {
			if (input) {
				input.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						this.createNewSong();
					}
				});
			}
		});
	}

	createNewSong() {
		const title = document.getElementById('new-song-title').value.trim();
		const artist = document.getElementById('new-song-artist').value.trim();
		const album = document.getElementById('new-song-album').value.trim();
		
		if (!title || !artist) {
			alert('Veuillez remplir au moins le titre et l\'artiste');
			return;
		}
		
		// Créer la nouvelle chanson
		const newSong = lyricsLibrary.createSong(title, artist, album);
		
		// Ajouter une ligne de départ
		newSong.addLine(0, 'Première ligne de paroles...', 'vocal');
		
		// Sauvegarder
		lyricsLibrary.saveSong(newSong);
		
		// Charger dans l'affichage
		this.loadLyrics(newSong);
		
		// Vider les champs
		document.getElementById('new-song-title').value = '';
		document.getElementById('new-song-artist').value = '';
		document.getElementById('new-song-album').value = '';
		
		// Actualiser la liste
		this.refreshSongsList();
		
		console.log('✅ Nouvelle chanson créée:', title, 'par', artist);
	}

	refreshSongsList() {
		const songsList = document.getElementById('songs-list');
		if (!songsList || !lyricsLibrary) return;
		
		const allSongs = lyricsLibrary.getAllSongs();
		
		if (allSongs.length === 0) {
			songsList.innerHTML = '<p style="color: #bdc3c7;">Aucune chanson dans la bibliothèque</p>';
			return;
		}
		
		songsList.innerHTML = '';
		
		allSongs.forEach(song => {
			const songItem = document.createElement('div');
			songItem.style.cssText = `
				padding: 8px;
				margin-bottom: 8px;
				background: #2c3e50;
				border-radius: 4px;
				border-left: 3px solid #3498db;
				display: flex;
				justify-content: space-between;
				align-items: center;
			`;
			
			const songInfo = document.createElement('div');
			songInfo.style.cssText = 'flex: 1; cursor: pointer;';
			songInfo.innerHTML = `
				<strong>${song.title}</strong><br>
				<small style="color: #bdc3c7;">${song.artist}${song.album ? ' - ' + song.album : ''}</small><br>
				<small style="color: #95a5a6;">${song.linesCount} lignes</small>
			`;
			
			// Charger la chanson au clic
			songInfo.addEventListener('click', () => {
				const loadedSong = lyricsLibrary.loadSongById(song.songId);
				if (loadedSong) {
					this.loadLyrics(loadedSong);
					console.log('✅ Chanson chargée:', song.title);
				}
			});
			
			const controls = document.createElement('div');
			controls.style.cssText = 'display: flex; gap: 5px;';
			
			// Bouton supprimer
			const deleteBtn = document.createElement('button');
			deleteBtn.textContent = '🗑️';
			deleteBtn.style.cssText = 'padding: 4px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;';
			deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				if (confirm(`Supprimer "${song.title}" par ${song.artist} ?`)) {
					lyricsLibrary.deleteSong(song.songId);
					this.refreshSongsList();
					console.log('🗑️ Chanson supprimée:', song.title);
				}
			});
			
			controls.appendChild(deleteBtn);
			songItem.appendChild(songInfo);
			songItem.appendChild(controls);
			songsList.appendChild(songItem);
		});
	}

	setupFullscreenListeners() {
		const fullscreenBtn = document.getElementById('fullscreen-btn');
		const lyricsContent = document.getElementById('lyrics-content');
		
		// Bouton plein écran
		if (fullscreenBtn) {
			fullscreenBtn.addEventListener('click', () => {
				this.toggleFullscreen();
			});
		}
		
		// Clic long sur la zone des paroles
		if (lyricsContent) {
			// Mouse events
			lyricsContent.addEventListener('mousedown', (e) => {
				if (e.button === 0) { // Clic gauche seulement
					this.longPressTimer = setTimeout(() => {
						this.toggleFullscreen();
					}, 800); // 800ms pour le clic long
				}
			});
			
			lyricsContent.addEventListener('mouseup', () => {
				if (this.longPressTimer) {
					clearTimeout(this.longPressTimer);
					this.longPressTimer = null;
				}
			});
			
			lyricsContent.addEventListener('mouseleave', () => {
				if (this.longPressTimer) {
					clearTimeout(this.longPressTimer);
					this.longPressTimer = null;
				}
			});
			
			// Touch events pour mobile
			lyricsContent.addEventListener('touchstart', (e) => {
				this.longPressTimer = setTimeout(() => {
					this.toggleFullscreen();
				}, 800);
			});
			
			lyricsContent.addEventListener('touchend', () => {
				if (this.longPressTimer) {
					clearTimeout(this.longPressTimer);
					this.longPressTimer = null;
				}
			});
			
			lyricsContent.addEventListener('touchcancel', () => {
				if (this.longPressTimer) {
					clearTimeout(this.longPressTimer);
					this.longPressTimer = null;
				}
			});
		}
		
		// Échapper du plein écran avec la touche Escape
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this.isFullscreen) {
				this.setFullscreen(false);
			}
		});
	}

	setupDragAndDropListeners() {
		const container = this.container;
		const dropZone = document.getElementById('drop-zone');
		const lyricsContent = document.getElementById('lyrics-content');
		
		if (!container || !dropZone || !lyricsContent) return;
		
		// Événements de drag and drop sur le conteneur principal
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			container.addEventListener(eventName, (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
		});
		
		// Montrer la zone de drop
		container.addEventListener('dragenter', (e) => {
			if (this.isDraggedFileText(e)) {
				dropZone.style.display = 'flex';
				container.style.filter = 'brightness(0.8)';
			}
		});
		
		container.addEventListener('dragover', (e) => {
			if (this.isDraggedFileText(e)) {
				dropZone.style.display = 'flex';
			}
		});
		
		// Cacher la zone de drop
		container.addEventListener('dragleave', (e) => {
			// Vérifier que nous sortons vraiment du conteneur
			if (!container.contains(e.relatedTarget)) {
				dropZone.style.display = 'none';
				container.style.filter = '';
			}
		});
		
		// Gérer le drop
		container.addEventListener('drop', (e) => {
			dropZone.style.display = 'none';
			container.style.filter = '';
			
			const files = e.dataTransfer.files;
			if (files.length > 0) {
				this.handleDroppedFiles(files);
			}
		});
		
		console.log('✅ Drag and drop configuré');
	}

	isDraggedFileText(event) {
		const items = event.dataTransfer.items;
		if (!items) return false;
		
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.kind === 'file') {
				const type = item.type;
				// Vérifier les types MIME pour les fichiers texte
				if (type.startsWith('text/') || 
					type === 'application/json' ||
					type === '' || // Fichiers sans extension ou .txt
					item.getAsFile()?.name.match(/\.(txt|lrc|json|md|lyrics)$/i)) {
					return true;
				}
			}
		}
		return false;
	}

	async handleDroppedFiles(files) {
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			
			// Vérifier que c'est un fichier texte
			if (this.isTextFile(file)) {
				try {
					const content = await this.readFileContent(file);
					this.createSongFromText(file.name, content);
				} catch (error) {
					console.error('❌ Erreur lecture fichier:', error);
					alert(`Erreur lors de la lecture du fichier ${file.name}: ${error.message}`);
				}
			} else {
				console.warn('⚠️ Fichier ignoré (pas un fichier texte):', file.name);
				alert(`Le fichier "${file.name}" n'est pas un fichier texte supporté.`);
			}
		}
	}

	isTextFile(file) {
		// Vérifier le type MIME
		if (file.type.startsWith('text/') || 
			file.type === 'application/json' ||
			file.type === '') {
			return true;
		}
		
		// Vérifier l'extension
		const validExtensions = /\.(txt|lrc|json|md|lyrics)$/i;
		return validExtensions.test(file.name);
	}

	readFileContent(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result);
			reader.onerror = (e) => reject(new Error('Erreur de lecture du fichier'));
			reader.readAsText(file, 'UTF-8');
		});
	}

	createSongFromText(filename, content) {
		try {
			// Extraire le nom du fichier sans extension pour le titre
			const title = filename.replace(/\.[^/.]+$/, '');
			
			// Vérifier si c'est un fichier LRC (karaoké)
			if (filename.toLowerCase().endsWith('.lrc')) {
				this.createSongFromLRC(title, content);
				return;
			}
			
			// Traiter comme fichier texte simple
			this.createSongFromPlainText(title, content);
			
		} catch (error) {
			console.error('❌ Erreur création chanson:', error);
			alert(`Erreur lors de la création de la chanson: ${error.message}`);
		}
	}

	createSongFromLRC(title, lrcContent) {
		try {
			// Utiliser la méthode existante pour parser le LRC
			const syncedLyrics = SyncedLyrics.fromLRC(lrcContent);
			
			// Si le titre/artiste n'est pas dans le LRC, utiliser le nom du fichier
			if (!syncedLyrics.metadata.title) {
				syncedLyrics.metadata.title = title;
			}
			if (!syncedLyrics.metadata.artist) {
				syncedLyrics.metadata.artist = 'Artiste Inconnu';
			}
			
			// Régénérer l'ID avec les nouvelles métadonnées
			syncedLyrics.songId = lyricsLibrary.generateSongId(
				syncedLyrics.metadata.title, 
				syncedLyrics.metadata.artist
			);
			
			// Sauvegarder et charger
			lyricsLibrary.saveSong(syncedLyrics);
			this.loadLyrics(syncedLyrics);
			this.refreshSongsList();
			
			console.log('✅ Chanson LRC créée:', syncedLyrics.metadata.title);
			alert(`Chanson LRC "${syncedLyrics.metadata.title}" créée avec succès!`);
			
		} catch (error) {
			console.error('❌ Erreur parsing LRC:', error);
			// Fallback vers texte simple
			this.createSongFromPlainText(title, lrcContent);
		}
	}

	createSongFromPlainText(title, textContent) {
		// Créer une nouvelle chanson
		const newSong = lyricsLibrary.createSong(title, 'Artiste Inconnu', '');
		
		// Diviser le texte en lignes
		const lines = textContent.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0);
		
		// Ajouter chaque ligne avec un timecode automatique (5 secondes entre chaque ligne)
		lines.forEach((line, index) => {
			const timeMs = index * 5000; // 5 secondes entre chaque ligne
			newSong.addLine(timeMs, line, 'vocal');
		});
		
		// Si aucune ligne n'a été ajoutée, ajouter une ligne par défaut
		if (lines.length === 0) {
			newSong.addLine(0, 'Paroles importées du fichier...', 'vocal');
		}
		
		// Sauvegarder et charger
		lyricsLibrary.saveSong(newSong);
		this.loadLyrics(newSong);
		this.refreshSongsList();
		
		console.log('✅ Chanson texte créée:', title, `(${lines.length} lignes)`);
		alert(`Chanson "${title}" créée avec ${lines.length} lignes!\nVous pouvez maintenant éditer les timecodes en mode édition.`);
	}

	toggleFullscreen() {
		this.setFullscreen(!this.isFullscreen);
	}

	setFullscreen(enable) {
		const container = this.container;
		const lyricsContent = document.getElementById('lyrics-content');
		const fullscreenBtn = document.getElementById('fullscreen-btn');
		
		if (!container || !lyricsContent) return;
		
		if (enable && !this.isFullscreen) {
			// Sauvegarder les styles originaux
			this.originalStyles = {
				containerPosition: container.style.position,
				containerTop: container.style.top,
				containerLeft: container.style.left,
				containerWidth: container.style.width,
				containerHeight: container.style.height,
				containerZIndex: container.style.zIndex,
				containerBackground: container.style.backgroundColor,
				containerMargin: container.style.margin,
				containerPadding: container.style.padding,
				contentHeight: lyricsContent.style.height,
				contentPadding: lyricsContent.style.padding,
				contentMargin: lyricsContent.style.margin,
				bodyOverflow: document.body.style.overflow
			};
			
			// Appliquer les styles plein écran
			container.style.position = 'fixed';
			container.style.top = '0';
			container.style.left = '0';
			container.style.width = '100vw';
			container.style.height = '100vh';
			container.style.zIndex = '9999';
			container.style.backgroundColor = '#000';
			container.style.margin = '0';
			container.style.padding = '0';
			container.style.boxSizing = 'border-box';
			
			// Empêcher le scroll du body
			document.body.style.overflow = 'hidden';
			
			// Cacher les contrôles en plein écran
			const header = document.getElementById('lyrics-header');
			const controls = document.getElementById('lyrics-controls');
			const songManager = document.getElementById('song-manager');
			
			if (header) header.style.display = 'none';
			if (controls) controls.style.display = 'none';
			if (songManager) songManager.style.display = 'none';
			
			// Ajuster la zone de contenu pour coller parfaitement
			lyricsContent.style.height = '100vh';
			lyricsContent.style.width = '100vw';
			lyricsContent.style.padding = '40px';
			lyricsContent.style.margin = '0';
			lyricsContent.style.boxSizing = 'border-box';
			lyricsContent.style.display = 'flex';
			lyricsContent.style.flexDirection = 'column';
			lyricsContent.style.justifyContent = 'center';
			lyricsContent.style.alignItems = 'center';
			lyricsContent.style.textAlign = 'center';
			lyricsContent.style.position = 'absolute';
			lyricsContent.style.top = '0';
			lyricsContent.style.left = '0';
			
			this.isFullscreen = true;
			if (fullscreenBtn) fullscreenBtn.textContent = 'Sortir Plein Écran';
			
			console.log('✅ Mode plein écran activé');
			
		} else if (!enable && this.isFullscreen) {
			// Restaurer les styles originaux
			container.style.position = this.originalStyles.containerPosition || '';
			container.style.top = this.originalStyles.containerTop || '';
			container.style.left = this.originalStyles.containerLeft || '';
			container.style.width = this.originalStyles.containerWidth || '';
			container.style.height = this.originalStyles.containerHeight || '';
			container.style.zIndex = this.originalStyles.containerZIndex || '';
			container.style.backgroundColor = this.originalStyles.containerBackground || '';
			container.style.margin = this.originalStyles.containerMargin || '';
			container.style.padding = this.originalStyles.containerPadding || '';
			container.style.boxSizing = '';
			
			// Restaurer le scroll du body
			document.body.style.overflow = this.originalStyles.bodyOverflow || '';
			
			// Restaurer les contrôles
			const header = document.getElementById('lyrics-header');
			const controls = document.getElementById('lyrics-controls');
			
			if (header) header.style.display = '';
			if (controls) controls.style.display = '';
			
			// Restaurer la zone de contenu
			lyricsContent.style.height = this.originalStyles.contentHeight || '300px';
			lyricsContent.style.width = '';
			lyricsContent.style.padding = this.originalStyles.contentPadding || '20px';
			lyricsContent.style.margin = this.originalStyles.contentMargin || '';
			lyricsContent.style.boxSizing = '';
			lyricsContent.style.display = '';
			lyricsContent.style.flexDirection = '';
			lyricsContent.style.justifyContent = '';
			lyricsContent.style.alignItems = '';
			lyricsContent.style.textAlign = '';
			lyricsContent.style.position = '';
			lyricsContent.style.top = '';
			lyricsContent.style.left = '';
			
			this.isFullscreen = false;
			if (fullscreenBtn) fullscreenBtn.textContent = 'Plein Écran';
			
			console.log('✅ Mode plein écran désactivé');
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
	window.createNewSong = createNewSong;
	window.deleteSong = deleteSong;
	window.listAllSongs = listAllSongs;
	window.toggleSongManager = toggleSongManager;
	window.fullscreen = fullscreen;
	
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
	console.log('  - createNewSong:', typeof window.createNewSong);
	console.log('  - deleteSong:', typeof window.deleteSong);
	console.log('  - listAllSongs:', typeof window.listAllSongs);
	console.log('  - toggleSongManager:', typeof window.toggleSongManager);
	console.log('  - fullscreen:', typeof window.fullscreen);
} else {
	// Environnement Node.js ou autre
	console.log('⚠️ Environnement sans window object détecté');
}