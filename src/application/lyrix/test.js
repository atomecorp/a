// Déclaration de la variable pour la bibliothèque de paroles (sera initialisée après la définition des classes)
let lyricsLibrary = null;

// État global pour le mode record
let recordMode = {
	isRecording: false,
	currentTimecode: 0,
	scrollBlocked: false
};

// Configuration globale pour les chemins audio
const AUDIO_CONFIG = {
	BASE_PATH: 'assets/audios/',
	BASE_URL: 'http://localhost:3001/assets/audios/',
	DEMO_FILES: {
		darkbox: 'darkbox.mp3',
		digitalDreams: 'digital_dreams.mp3'
	}
};

// Utilitaires audio regroupés
const AudioUtils = {
	// Normaliser les chemins audio
	normalize(audioPath) {
		if (!audioPath) return null;
		
		// Traitement des métadonnées JSON
		if (audioPath.startsWith('{')) {
			try {
				const { fileName } = JSON.parse(audioPath);
				return fileName ? this.createUrl(fileName) : null;
			} catch (e) {
				console.warn('⚠️ Métadonnées audio corrompues:', e);
				return null;
			}
		}
		
		// URL complète déjà formée
		if (audioPath.startsWith(AUDIO_CONFIG.BASE_URL)) return audioPath;
		
		// Chemin relatif
		if (audioPath.startsWith(AUDIO_CONFIG.BASE_PATH)) {
			return this.createUrl(audioPath.replace(AUDIO_CONFIG.BASE_PATH, ''));
		}
		
		// Extraction du nom de fichier depuis un chemin
		const fileName = audioPath.split(/[/\\]/).pop();
		return this.createUrl(fileName);
	},
	
	// Créer une URL audio complète
	createUrl(fileName) {
		return AUDIO_CONFIG.BASE_URL + encodeURIComponent(fileName);
	},
	
	// Obtenir les chemins de démo
	getDemoPaths() {
		return Object.fromEntries(
			Object.entries(AUDIO_CONFIG.DEMO_FILES).map(([key, file]) => [key, this.createUrl(file)])
		);
	},
	
	// Debug d'un chemin
	debug(input) {
		const result = this.normalize(input);
		console.log('🔍 Debug chemin audio:', { input, result });
		return result;
	}
};

// Fonctions compatibilité (garde l'API existante)
const normalizeAudioPath = (path) => AudioUtils.normalize(path);
const createAudioPath = (fileName) => AudioUtils.createUrl(fileName);
const getDemoAudioPaths = () => AudioUtils.getDemoPaths();
const debugAudioPath = (input) => AudioUtils.debug(input);

// Utilitaires DOM regroupés
const DOMUtils = {
	// Vérifier la compatibilité DOM
	isCompatible() {
		return typeof document !== 'undefined' && typeof $ !== 'undefined';
	},
	
	// Créer les éléments DOM nécessaires
	initialize() {
		if (!this.isCompatible()) {
			console.log('⚠️ Environnement sans DOM ou fonction $ détecté');
			return false;
		}

		// Timecode
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

		// Conteneur paroles
		$('div', {
			id: 'lyrics-container',
			css: {
				width: '100%',
				minHeight: '600px',
				height: 'auto',
				backgroundColor: '#1a1a1a',
				border: '1px solid #333',
				borderRadius: '8px',
				margin: '20px 0',
				overflow: 'visible',
				display: 'flex',
				flexDirection: 'column'
			},
			parent: '#view'
		});
		
		console.log('✅ Éléments DOM initialisés');
		return true;
	},
	
	// Initialiser l'affichage des paroles
	initLyricsDisplay() {
		const container = document.getElementById('lyrics-container');
		if (!container) {
			console.log('⚠️ lyrics-container non trouvé');
			return null;
		}
		
		const display = new LyricsDisplay('lyrics-container');
		console.log('✅ LyricsDisplay initialisé');
		
		// Charger chanson de démo
		const demoSongs = createDemoSongs();
		if (demoSongs?.darkboxSong) {
			display.loadLyrics(demoSongs.darkboxSong);
			console.log('✅ Chanson "The Darkbox" chargée');
		}
		
		return display;
	}
};

// Initialisation compatible (garde l'API existante)
function initializeDOM() {
	return DOMUtils.initialize();
}

// Initialisation progressive
setTimeout(() => DOMUtils.initialize(), 10);
setTimeout(() => {
	if (DOMUtils.isCompatible()) {
		lyricsDisplay = DOMUtils.initLyricsDisplay();
	}
}, 50);

// Fonction générique pour créer des chansons de démonstration
function createDemoSongs() {
	// Utiliser la méthode de la bibliothèque qui gère la synchronisation
	return lyricsLibrary.createDemoSongsIfNeeded();
}

// Utilitaires de gestion des chansons
const SongUtils = {
	// Chercher et charger une chanson
	loadByName(searchTerm) {
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
	},
	
	// Afficher les statistiques
	showStats() {
		const stats = lyricsLibrary.getStats();
		console.log('📊 Statistiques de la bibliothèque:');
		console.log(`  - ${stats.totalSongs} chansons`);
		console.log(`  - ${stats.uniqueArtists} artistes uniques`);
		console.log(`  - ${stats.totalLines} lignes de paroles`);
		console.log(`  - Durée totale: ${(stats.totalDuration / 1000 / 60).toFixed(1)} minutes`);
		return stats;
	},
	
	// Charger dans l'affichage
	loadInDisplay(songName) {
		if (!lyricsDisplay) {
			console.log('❌ LyricsDisplay non initialisé');
			return null;
		}
		
		const song = this.loadByName(songName);
		if (song) {
			lyricsDisplay.loadLyrics(song);
			console.log('✅ Chanson chargée dans l\'affichage:', song.metadata.title);
		}
		return song;
	},
	
	// Créer une nouvelle chanson
	create(title, artist, album = '') {
		if (!title || !artist) {
			console.log('❌ Titre et artiste requis');
			return null;
		}
		
		const newSong = lyricsLibrary.createSong(title, artist, album);
		newSong.addLine(0, 'Première ligne de paroles...', 'vocal');
		lyricsLibrary.saveSong(newSong);
		
		console.log('✅ Nouvelle chanson créée:', title, 'par', artist);
		return newSong;
	},
	
	// Supprimer une chanson
	delete(songIdentifier) {
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
		if (success && lyricsDisplay?.currentLyrics?.metadata.songId === songId) {
			// Nettoyer l'affichage si la chanson supprimée était affichée
			lyricsDisplay.currentLyrics = null;
			lyricsDisplay.updateHeader();
			lyricsDisplay.renderLines();
		}
		
		console.log(success ? '✅ Chanson supprimée' : '❌ Échec suppression');
		return success;
	},
	
	// Lister toutes les chansons
	listAll() {
		const songs = lyricsLibrary.getAllSongs();
		console.log('📋 Liste des chansons (' + songs.length + '):');
		songs.forEach((song, index) => {
			const audioIcon = song.hasAudio() ? '🎵' : '📝';
			console.log(`  ${index + 1}. ${audioIcon} ${song.metadata.title} - ${song.metadata.artist}`);
		});
		return songs;
	},
	
	// Basculer le gestionnaire de chansons
	toggleManager() {
		if (!lyricsDisplay) {
			console.log('❌ LyricsDisplay non initialisé');
			return;
		}
		
		lyricsDisplay.toggleSongManager();
		
		const btn = document.getElementById('song-manager-btn');
		if (btn) {
			btn.textContent = lyricsDisplay.songManagerVisible ? 
				'🔒 Fermer gestionnaire' : '📋 Gérer chansons';
		}
	}
};

// Utilitaires de contrôle UI
const UIUtils = {
	// Tester l'affichage à un moment donné
	testAtTime(timeMs) {
		if (!lyricsDisplay?.currentLyrics) {
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
	},
	
	// Changer la taille de police
	setFontSize(size) {
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
	},
	
	// Basculer le mode édition
	toggleEdit() {
		if (!lyricsDisplay) {
			console.log('❌ LyricsDisplay non initialisé');
			return;
		}
		
		lyricsDisplay.editMode = !lyricsDisplay.editMode;
		lyricsDisplay.renderLines();
		
		const editBtn = document.getElementById('edit-mode-btn');
		if (editBtn) {
			editBtn.textContent = lyricsDisplay.editMode ? 
				'🔒 Quitter le mode édition' : '✏️ Mode édition';
			editBtn.style.backgroundColor = lyricsDisplay.editMode ? '#e74c3c' : '#3498db';
		}
		
		console.log('✅ Mode édition:', lyricsDisplay.editMode ? 'activé' : 'désactivé');
	},
	
	// Ajouter une ligne de paroles
	addLyricLine(timeMs, text, type = 'vocal') {
		if (!lyricsDisplay?.currentLyrics) {
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
	},
	
	// Fonctions du mode record
	toggleRecord() {
		if (!lyricsDisplay) {
			console.log('❌ LyricsDisplay non initialisé');
			return;
		}
		
		lyricsDisplay.toggleRecordMode();
		console.log('✅ Mode record:', recordMode.isRecording ? 'activé' : 'désactivé');
	},
	
	// Obtenir l'état du mode record
	getRecordState() {
		return {
			isRecording: recordMode.isRecording,
			currentTimecode: recordMode.currentTimecode,
			scrollBlocked: recordMode.scrollBlocked
		};
	},
	
	// Synchroniser manuellement une ligne avec le timecode actuel
	syncLineToCurrentTime(lineIndex) {
		if (!lyricsDisplay?.currentLyrics) {
			console.log('❌ Aucune chanson chargée');
			return;
		}
		
		const line = lyricsDisplay.currentLyrics.lyrics[lineIndex];
		if (!line) {
			console.log('❌ Ligne non trouvée à l\'index:', lineIndex);
			return;
		}
		
		const oldTime = line.startTime;
		line.startTime = recordMode.currentTimecode;
		
		console.log(`🎯 Ligne ${lineIndex + 1} synchronisée:`, {
			texte: line.text,
			ancien: (oldTime / 1000).toFixed(3) + 's',
			nouveau: (recordMode.currentTimecode / 1000).toFixed(3) + 's'
		});
		
		// Sauvegarder automatiquement
		if (lyricsLibrary) {
			lyricsLibrary.addSong(lyricsDisplay.currentLyrics);
		}
		
		return true;
	}
};

// Fonctions compatibilité (garde l'API existante)
const loadSongByName = (term) => SongUtils.loadByName(term);
const showLibraryStats = () => SongUtils.showStats();
const loadSongInDisplay = (name) => SongUtils.loadInDisplay(name);
const createNewSong = (title, artist, album) => SongUtils.create(title, artist, album);
const deleteSong = (identifier) => SongUtils.delete(identifier);
const listAllSongs = () => SongUtils.listAll();
const toggleSongManager = () => SongUtils.toggleManager();
const testLyricsAtTime = (timeMs) => UIUtils.testAtTime(timeMs);
const setFontSize = (size) => UIUtils.setFontSize(size);
const toggleEditMode = () => UIUtils.toggleEdit();
const addNewLyricLine = (timeMs, text, type) => UIUtils.addLyricLine(timeMs, text, type);

// Nouvelles fonctions pour le mode record
const toggleRecordMode = () => UIUtils.toggleRecord();
const getRecordModeState = () => UIUtils.getRecordState();
const syncLineToCurrentTimecode = (lineIndex) => UIUtils.syncLineToCurrentTime(lineIndex);

// Fonctions de diagnostic pour les boutons de suppression
const debugDeleteButtons = () => lyricsDisplay?.debugDeleteButtons();
const repairDeleteButtons = () => {
	if (lyricsDisplay) {
		lyricsDisplay.debugDeleteButtons();
		console.log('🔧 Diagnostic et réparation des boutons terminés');
	} else {
		console.log('❌ lyricsDisplay non disponible');
	}
};

// Fonction pour associer un fichier audio à une chanson
const AudioController = {
	// Associer un fichier audio à une chanson
	associate(songIdentifier, audioPath) {
		const normalizedAudioPath = AudioUtils.normalize(audioPath);
		
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
		
		// Charger la chanson
		const song = lyricsLibrary.loadSongById(songId);
		if (!song) {
			console.log('❌ Impossible de charger la chanson:', songId);
			return false;
		}
		
		// Associer l'audio (la normalisation se fait automatiquement dans setAudioPath)
		song.setAudioPath(normalizedAudioPath);
		lyricsLibrary.saveSong(song);
		
		// Si c'est la chanson actuellement affichée, recharger l'audio
		if (lyricsDisplay?.currentLyrics?.songId === songId) {
			lyricsDisplay.loadAssociatedAudio(normalizedAudioPath);
		}
		
		console.log('✅ Audio associé à la chanson:', song.metadata.title, 'avec le chemin:', normalizedAudioPath);
		return true;
	},
	
	// Dissocier l'audio d'une chanson
	remove(songIdentifier) {
		return this.associate(songIdentifier, null);
	},
	
	// Contrôler le lecteur audio
	control(action, value = null) {
		if (!lyricsDisplay) {
			console.log('❌ LyricsDisplay non initialisé');
			return false;
		}
		
		switch (action.toLowerCase()) {
			case 'play':
				if (lyricsDisplay.audioPlayer) {
					lyricsDisplay.audioPlayer.play();
					lyricsDisplay.isPlayingInternal = true;
					lyricsDisplay.updatePlayPauseButton();
					console.log('▶️ Lecture audio');
				}
				break;
				
			case 'pause':
				if (lyricsDisplay.audioPlayer) {
					lyricsDisplay.audioPlayer.pause();
					lyricsDisplay.isPlayingInternal = false;
					lyricsDisplay.updatePlayPauseButton();
					console.log('⏸️ Pause audio');
				}
				break;
				
			case 'toggle':
				lyricsDisplay.togglePlayPause();
				return lyricsDisplay.isPlayingInternal;
				
			case 'seek':
			case 'time':
				if (lyricsDisplay.audioPlayer && value !== null) {
					lyricsDisplay.audioPlayer.currentTime = value;
					console.log('⏩ Saut à', value + 's');
				}
				break;
				
			case 'volume':
				if (lyricsDisplay.audioPlayer && value !== null) {
					lyricsDisplay.audioPlayer.volume = Math.max(0, Math.min(1, value));
					const volumeSlider = document.getElementById('volume-slider');
					if (volumeSlider) volumeSlider.value = value * 100;
					console.log('🔊 Volume:', (value * 100) + '%');
				}
				break;
				
			case 'currenttime':
				return lyricsDisplay.audioPlayer ? lyricsDisplay.audioPlayer.currentTime : 0;
				
			case 'duration':
				return lyricsDisplay.audioPlayer ? lyricsDisplay.audioPlayer.duration : 0;
				
			case 'isplaying':
				return lyricsDisplay.isPlayingInternal;
				
			case 'hasaudio':
				return !!lyricsDisplay.audioPlayer && !!lyricsDisplay.audioPath;
				
			default:
				console.log('❌ Action audio inconnue:', action);
				return false;
		}
		
		return true;
	}
};

// Fonctions de compatibilité audio
function associateAudioToSong(songIdentifier, audioPath) {
	return AudioController.associate(songIdentifier, audioPath);
}

// Fonction pour dissocier l'audio d'une chanson
function removeAudioFromSong(songIdentifier) {
	return AudioController.remove(songIdentifier);
}

// Fonction pour contrôler le lecteur audio
function audioControl(action, value = null) {
	return AudioController.control(action, value);
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
		this.settingsKey = 'lyrics_library_settings';
		this.songListKey = 'lyrics_song_list';
		this.builtInSongs = new Set(); // Pour tracker les chansons intégrées
		this.initializeLibrary();
	}

	// Initialiser la bibliothèque au démarrage
	initializeLibrary() {
		console.log('🔄 Initialisation de la bibliothèque de paroles...');
		
		// Charger les paramètres existants
		this.loadSettings();
		
		// Synchroniser avec les chansons intégrées
		this.syncBuiltInSongs();
		
		// Charger la liste des chansons depuis localStorage
		this.loadSongList();
		
		console.log('✅ Bibliothèque de paroles initialisée');
	}

	// Charger les paramètres de la bibliothèque
	loadSettings() {
		try {
			const settings = localStorage.getItem(this.settingsKey);
			if (settings) {
				const parsed = JSON.parse(settings);
				this.builtInSongs = new Set(parsed.builtInSongs || []);
				console.log('📋 Paramètres chargés:', parsed);
			}
		} catch (error) {
			console.error('❌ Erreur chargement paramètres:', error);
		}
	}

	// Sauvegarder les paramètres de la bibliothèque
	saveSettings() {
		try {
			const settings = {
				builtInSongs: Array.from(this.builtInSongs),
				lastSync: new Date().toISOString()
			};
			localStorage.setItem(this.settingsKey, JSON.stringify(settings));
			console.log('💾 Paramètres sauvegardés');
		} catch (error) {
			console.error('❌ Erreur sauvegarde paramètres:', error);
		}
	}

	// Synchroniser avec les chansons intégrées au démarrage
	syncBuiltInSongs() {
		console.log('🔄 Synchronisation des chansons intégrées...');
		
		// Créer les chansons de démonstration si elles n'existent pas déjà
		const demoSongs = this.createDemoSongsIfNeeded();
		
		// Marquer les chansons de démo comme intégrées
		if (demoSongs) {
			if (demoSongs.darkboxSong) {
				this.builtInSongs.add(demoSongs.darkboxSong.songId);
			}
			if (demoSongs.digitalDreamsSong) {
				this.builtInSongs.add(demoSongs.digitalDreamsSong.songId);
			}
		}
		
		this.saveSettings();
		console.log('✅ Synchronisation terminée');
	}

	// Créer les chansons de démo seulement si nécessaire
	createDemoSongsIfNeeded() {
		// Vérifier d'abord dans les chansons intégrées trackées
		const hasTrackedDarkbox = Array.from(this.builtInSongs).some(songId => {
			const song = this.loadSongById(songId);
			return song && song.metadata.title === "The Darkbox";
		});
		
		const hasTrackedDigital = Array.from(this.builtInSongs).some(songId => {
			const song = this.loadSongById(songId);
			return song && song.metadata.title === "Digital Dreams";
		});
		
		// Vérification secondaire par titre et artiste (au cas où le tracking aurait échoué)
		const existingSongs = this.getAllSongs();
		const darkboxExists = hasTrackedDarkbox || existingSongs.some(song => 
			song.title === "The Darkbox" && song.artist === "Atome Artist"
		);
		const digitalExists = hasTrackedDigital || existingSongs.some(song => 
			song.title === "Digital Dreams" && song.artist === "Cyber Collective"
		);
		
		if (darkboxExists && digitalExists) {
			console.log('📚 Chansons de démo déjà présentes');
			
			// S'assurer qu'elles sont bien trackées
			existingSongs.forEach(song => {
				if ((song.title === "The Darkbox" && song.artist === "Atome Artist") ||
					(song.title === "Digital Dreams" && song.artist === "Cyber Collective")) {
					this.builtInSongs.add(song.songId);
				}
			});
			this.saveSettings();
			return null;
		}
		
		console.log('🎵 Création des chansons de démonstration...');
		
		let darkboxSong = null;
		let digitalDreamsSong = null;
		
		// Créer The Darkbox si elle n'existe pas
		if (!darkboxExists) {
			const darkboxData = {
				title: "The Darkbox",
				artist: "Atome Artist",
				album: "Demo Album",
				audioFile: "darkbox.mp3", // Ce fichier sera automatiquement préfixé par assets/audios/
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
			darkboxSong = this.createDemoSong(darkboxData);
		}
		
		// Créer Digital Dreams si elle n'existe pas
		if (!digitalExists) {
			const demoSong2Data = {
				title: "Digital Dreams",
				artist: "Cyber Collective",
				album: "Electronic Visions",
				audioFile: "digital_dreams.mp3", // Ce fichier sera automatiquement préfixé par assets/audios/
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
			digitalDreamsSong = this.createDemoSong(demoSong2Data);
		}
		
		console.log('✅ Chansons de démo créées');
		return { darkboxSong, digitalDreamsSong };
	}

	// Nettoyer les chansons de démo dupliquées
	cleanupDuplicateDemoSongs() {
		console.log('🧹 Nettoyage des chansons de démo dupliquées...');
		
		const allSongs = this.getAllSongs();
		const darkboxSongs = allSongs.filter(s => s.title === "The Darkbox" && s.artist === "Atome Artist");
		const digitalSongs = allSongs.filter(s => s.title === "Digital Dreams" && s.artist === "Cyber Collective");
		
		let cleaned = false;
		
		// Garder seulement la plus récente de chaque type
		if (darkboxSongs.length > 1) {
			const latest = darkboxSongs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))[0];
			darkboxSongs.filter(s => s.songId !== latest.songId).forEach(duplicate => {
				console.log('🗑️ Suppression doublon Darkbox:', duplicate.songId);
				this.deleteSong(duplicate.songId);
				cleaned = true;
			});
			this.builtInSongs.add(latest.songId);
		}
		
		if (digitalSongs.length > 1) {
			const latest = digitalSongs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))[0];
			digitalSongs.filter(s => s.songId !== latest.songId).forEach(duplicate => {
				console.log('🗑️ Suppression doublon Digital Dreams:', duplicate.songId);
				this.deleteSong(duplicate.songId);
				cleaned = true;
			});
			this.builtInSongs.add(latest.songId);
		}
		
		if (cleaned) {
			this.saveSettings();
			console.log('✅ Nettoyage terminé - doublons supprimés');
		} else {
			console.log('✅ Aucun doublon trouvé');
		}
		
		return cleaned;
	}

	// Supprimer toutes les chansons
	deleteAllSongs() {
		console.log('🗑️ Suppression de toutes les chansons...');
		
		const allSongs = this.getAllSongs();
		let deletedCount = 0;
		
		allSongs.forEach(song => {
			try {
				this.deleteSong(song.songId);
				deletedCount++;
			} catch (error) {
				console.error('❌ Erreur suppression chanson:', song.title, error);
			}
		});
		
		// Vider aussi les sets de tracking
		this.builtInSongs.clear();
		this.saveSettings();
		
		console.log(`✅ ${deletedCount} chansons supprimées`);
		return deletedCount;
	}

	// Charger la liste des chansons depuis localStorage
	loadSongList() {
		try {
			const songList = localStorage.getItem(this.songListKey);
			if (songList) {
				const parsed = JSON.parse(songList);
				console.log('📋 Liste des chansons chargée:', parsed.length, 'chansons');
				return parsed;
			}
		} catch (error) {
			console.error('❌ Erreur chargement liste:', error);
		}
		return [];
	}

	// Sauvegarder la liste des chansons dans localStorage
	saveSongList() {
		try {
			const songs = this.getAllSongs();
			localStorage.setItem(this.songListKey, JSON.stringify(songs));
			console.log('💾 Liste des chansons sauvegardée:', songs.length, 'chansons');
		} catch (error) {
			console.error('❌ Erreur sauvegarde liste:', error);
		}
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
			
			// Mettre à jour la liste des chansons
			this.saveSongList();
			
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
					linesCount: data.lines.length,
					hasAudio: !!data.metadata.audioPath,
					audioPath: data.metadata.audioPath
				};
			} catch {
				return null;
			}
		}).filter(item => item !== null);
	}

	// Supprimer une chanson
	deleteSong(songId) {
		console.log('🔍 DEBUT deleteSong - songId:', songId);
		const storageKey = this.storagePrefix + songId;
		console.log('🔍 storageKey calculée:', storageKey);
		console.log('🔍 storagePrefix:', this.storagePrefix);
		
		// Lister toutes les clés dans localStorage pour debug
		const allKeys = Object.keys(localStorage).filter(key => key.startsWith('lyrics_'));
		console.log('🔍 Toutes les clés lyrics_ dans localStorage:', allKeys);
		
		// Vérifier d'abord si la chanson existe
		const existingSong = localStorage.getItem(storageKey);
		console.log('🔍 Chanson existante trouvée:', existingSong ? 'OUI' : 'NON');
		
		if (!existingSong) {
			console.warn('⚠️ Chanson non trouvée pour suppression:', songId);
			console.warn('⚠️ Clé recherchée:', storageKey);
			console.warn('⚠️ Clés disponibles:', allKeys);
			return false;
		}
		
		console.log('🔍 Contenu de la chanson à supprimer:', JSON.parse(existingSong));
		
		try {
			// Supprimer de localStorage
			localStorage.removeItem(storageKey);
			console.log('🗑️ localStorage.removeItem appelé pour:', storageKey);
			
			// Vérifier immédiatement après la suppression
			const verificationImmediante = localStorage.getItem(storageKey);
			console.log('🔍 Vérification immédiate - chanson encore là?', verificationImmediante ? 'OUI' : 'NON');
			
			// Supprimer des chansons intégrées si applicable
			if (this.builtInSongs.has(songId)) {
				this.builtInSongs.delete(songId);
				console.log('🗑️ Chanson supprimée des chansons intégrées:', songId);
			} else {
				console.log('🔍 Chanson non trouvée dans builtInSongs:', songId);
			}
			
			// Sauvegarder les paramètres
			console.log('🔍 Appel de saveSettings...');
			this.saveSettings();
			console.log('🔍 saveSettings terminé');
			
			// Mettre à jour la liste des chansons
			console.log('🔍 Appel de saveSongList...');
			this.saveSongList();
			console.log('🔍 saveSongList terminé');
			
			// Vérifier que la suppression a bien eu lieu
			const verification = localStorage.getItem(storageKey);
			console.log('🔍 Vérification finale - chanson encore là?', verification ? 'OUI' : 'NON');
			
			if (verification === null) {
				console.log('✅ Suppression confirmée pour:', songId);
				
				// Vérifier aussi que la chanson n'apparaît plus dans getAllSongs
				const allSongsAfter = this.getAllSongs();
				const stillThere = allSongsAfter.find(s => s.songId === songId);
				console.log('🔍 Chanson encore dans getAllSongs?', stillThere ? 'OUI' : 'NON');
				
				return true;
			} else {
				console.error('❌ La suppression a échoué, la chanson existe encore:', songId);
				console.error('❌ Contenu encore présent:', verification);
				return false;
			}
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
		const { title, artist, album, lyrics, audioFile } = songData;
		const song = this.createSong(title, artist, album);
		
		// Ajouter les paroles
		lyrics.forEach(lyric => {
			song.addLine(lyric.time, lyric.text, lyric.type || 'vocal');
		});
		
		// Ajouter le fichier audio s'il est fourni
		if (audioFile) {
			song.setAudioPath(audioFile);
		}
		
		// Sauvegarder
		this.saveSong(song);
		return song;
	}

	// Vérifier si une chanson est intégrée
	isBuiltInSong(songId) {
		return this.builtInSongs.has(songId);
	}

	// Obtenir le nombre de chansons par type
	getSongStats() {
		const allSongs = this.getAllSongs();
		const builtInCount = allSongs.filter(song => this.isBuiltInSong(song.songId)).length;
		const userCount = allSongs.length - builtInCount;
		
		return {
			total: allSongs.length,
			builtIn: builtInCount,
			user: userCount
		};
	}

	// Nettoyer la bibliothèque (supprimer les entrées orphelines)
	cleanup() {
		console.log('🧹 Nettoyage de la bibliothèque...');
		
		const songKeys = Object.keys(localStorage).filter(key => key.startsWith(this.storagePrefix));
		let cleanedCount = 0;
		
		songKeys.forEach(key => {
			try {
				const data = localStorage.getItem(key);
				if (!data) {
					localStorage.removeItem(key);
					cleanedCount++;
					return;
				}
				
				const parsed = JSON.parse(data);
				if (!parsed.songId || !parsed.metadata || !parsed.lines) {
					localStorage.removeItem(key);
					cleanedCount++;
				}
			} catch (error) {
				console.warn('⚠️ Suppression entrée corrompue:', key);
				localStorage.removeItem(key);
				cleanedCount++;
			}
		});
		
		// Mettre à jour la liste après nettoyage
		this.saveSongList();
		
		console.log('✅ Nettoyage terminé:', cleanedCount, 'entrées supprimées');
		return cleanedCount;
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
			lastModified: new Date().toISOString(),
			audioPath: null // Chemin vers le fichier audio associé
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

	// Associer un fichier audio à cette chanson
	setAudioPath(audioPath) {
		// Normaliser le chemin audio pour qu'il commence par assets/audios/
		this.metadata.audioPath = normalizeAudioPath(audioPath);
		this.updateLastModified();
		return this;
	}

	// Obtenir le chemin audio associé
	getAudioPath() {
		return this.metadata.audioPath;
	}

	// Vérifier si la chanson a un fichier audio associé
	hasAudio() {
		return !!this.metadata.audioPath;
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
		this.audioPlayer = null; // Lecteur audio intégré
		this.isPlayingInternal = false; // État de lecture interne
		this.audioPath = null; // Chemin du fichier audio
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
				<button id="record-mode-btn" style="padding: 5px 10px; margin-left: 10px; background: #e74c3c; color: white;">🔴 Record</button>
				<button id="save-lyrics-btn" style="padding: 5px 10px; display: none;">Sauvegarder</button>
				<button id="song-manager-btn" style="padding: 5px 10px; margin-left: 20px; background: #27ae60;">Gérer Chansons</button>
				<button id="fullscreen-btn" style="padding: 5px 10px; margin-left: 20px; background: #9b59b6;">Plein Écran</button>
			</div>
			<div id="song-metadata-edit" style="display: none; padding: 15px; background: #34495e; color: white; min-height: 200px; max-height: 50vh; overflow-y: auto;">
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
					<div>
						<label style="display: block; margin-bottom: 5px; font-weight: bold;">Titre:</label>
						<input type="text" id="edit-title" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555;">
					</div>
					<div>
						<label style="display: block; margin-bottom: 5px; font-weight: bold;">Artiste:</label>
						<input type="text" id="edit-artist" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555;">
					</div>
				</div>
				<div style="margin-bottom: 15px;">
					<label style="display: block; margin-bottom: 5px; font-weight: bold;">Album:</label>
					<input type="text" id="edit-album" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555;">
				</div>
				<div style="margin-bottom: 10px;">
					<label style="display: block; margin-bottom: 5px; font-weight: bold;">Fichier Audio:</label>
					<div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
						<input type="text" id="edit-audio-path" placeholder="Chemin vers le fichier audio" style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #555;">
						<input type="file" id="audio-file-input" accept="audio/*,video/*" style="display: none;">
						<button id="select-audio-btn" style="padding: 8px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Sélectionner</button>
						<button id="remove-audio-btn-edit" style="padding: 8px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Supprimer</button>
					</div>
					<small style="color: #bdc3c7; font-style: italic;">Les métadonnées du fichier (nom, taille, date) sont sauvegardées pour faciliter l'identification</small>
				</div>
			</div>
			<div id="audio-player" style="display: none; padding: 10px; background: #2c3e50; color: white; border-top: 1px solid #555;">
				<div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
					<button id="play-pause-btn" style="padding: 8px 15px; background: #27ae60; color: white; border: none; border-radius: 4px; font-size: 16px;">▶️ Play</button>
					<span id="current-time">0:00</span>
					<div style="flex: 1; position: relative;">
						<input type="range" id="audio-scrubber" min="0" max="100" value="0" style="width: 100%; height: 6px; background: #34495e; outline: none; border-radius: 3px;">
					</div>
					<span id="total-time">0:00</span>
					<input type="range" id="volume-slider" min="0" max="100" value="70" style="width: 80px;">
					<span>🔊</span>
				</div>
				<div style="font-size: 12px; color: #bdc3c7;">
					<span id="audio-filename">Aucun fichier audio</span>
					<button id="remove-audio-btn" style="padding: 2px 6px; margin-left: 10px; background: #e74c3c; color: white; border: none; border-radius: 3px; font-size: 10px;">Supprimer</button>
				</div>
			</div>
			<div id="song-manager" style="display: none; padding: 15px; background: #2c3e50; color: white; border-top: 1px solid #555; min-height: 400px; max-height: 70vh; overflow-y: auto;">
				<div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
					<div style="flex: 1; min-width: 250px;">
						<h4 style="margin: 0 0 10px 0;">Nouvelle Chanson</h4>
						<input type="text" id="new-song-title" placeholder="Titre" style="width: 100%; margin-bottom: 5px; padding: 5px;">
						<input type="text" id="new-song-artist" placeholder="Artiste" style="width: 100%; margin-bottom: 5px; padding: 5px;">
						<input type="text" id="new-song-album" placeholder="Album (optionnel)" style="width: 100%; margin-bottom: 10px; padding: 5px;">
						<button id="create-song-btn" style="padding: 8px 15px; background: #27ae60; color: white; border: none;">Créer</button>
					</div>
					<div style="flex: 2; min-width: 300px;">
						<h4 style="margin: 0 0 10px 0;">Bibliothèque de Chansons</h4>
						<div id="songs-list" style="min-height: 300px; max-height: 50vh; overflow-y: auto; background: #34495e; padding: 10px; border-radius: 4px;">
							<p style="color: #bdc3c7;">Chargement...</p>
						</div>
					</div>
				</div>
				<div style="text-align: center; border-top: 1px solid #555; padding-top: 10px; margin-top: 15px;">
					<button id="refresh-songs-btn" style="padding: 5px 10px; margin-right: 10px;">Actualiser</button>
					<button id="cleanup-duplicates-btn" style="padding: 5px 10px; margin-right: 10px; background: #f39c12; color: white; border: none; border-radius: 3px;">Nettoyer Doublons</button>
					<button id="delete-all-songs-btn" style="padding: 5px 10px; margin-right: 10px; background: #e74c3c; color: white; border: none; border-radius: 3px;">Supprimer Toutes</button>
					<button id="close-manager-btn" style="padding: 5px 10px; background: #95a5a6;">Fermer</button>
				</div>
			</div>
			<div id="lyrics-content" style="flex: 1; min-height: 300px; max-height: 80vh; overflow-y: auto; padding: 20px; position: relative; box-sizing: border-box;">
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
					📄 Déposez un fichier texte ici pour créer une nouvelle chanson<br>
					🎵 Ou un fichier audio (MP3, MP4, WAV) pour ajouter la musique
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
				
				// Afficher/cacher l'édition des métadonnées
				const metadataEdit = document.getElementById('song-metadata-edit');
				if (metadataEdit) {
					metadataEdit.style.display = this.editMode ? 'block' : 'none';
					if (this.editMode) {
						this.populateMetadataEdit();
					}
				}
				
				this.toggleEditMode();
			});
		}
		
		// Bouton mode record
		const recordModeBtn = document.getElementById('record-mode-btn');
		if (recordModeBtn) {
			recordModeBtn.addEventListener('click', () => {
				this.toggleRecordMode();
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
		
		// Lecteur audio
		this.setupAudioPlayerListeners();
		
		// Édition des métadonnées
		this.setupMetadataEditListeners();
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
		
		// Bouton nettoyer les doublons
		const cleanupDuplicatesBtn = document.getElementById('cleanup-duplicates-btn');
		if (cleanupDuplicatesBtn) {
			cleanupDuplicatesBtn.addEventListener('click', () => {
				this.showCustomConfirm(
					'Nettoyer les doublons ?',
					'Voulez-vous supprimer les chansons de démo dupliquées ?',
					() => {
						const cleaned = lyricsLibrary.cleanupDuplicateDemoSongs();
						if (cleaned) {
							this.refreshSongsList();
							this.showCustomAlert('Succès', 'Doublons supprimés avec succès');
						} else {
							this.showCustomAlert('Information', 'Aucun doublon trouvé');
						}
					},
					() => {
						console.log('❌ Nettoyage annulé');
					}
				);
			});
		}
		
		// Bouton supprimer toutes les chansons
		const deleteAllSongsBtn = document.getElementById('delete-all-songs-btn');
		if (deleteAllSongsBtn) {
			deleteAllSongsBtn.addEventListener('click', () => {
				const songCount = lyricsLibrary.getAllSongs().length;
				if (songCount === 0) {
					this.showCustomAlert('Information', 'Aucune chanson à supprimer');
					return;
				}
				
				this.showCustomConfirm(
					'⚠️ SUPPRIMER TOUTES LES CHANSONS ?',
					`Êtes-vous ABSOLUMENT sûr de vouloir supprimer TOUTES les ${songCount} chansons ?\n\nCette action est IRRÉVERSIBLE !`,
					() => {
						const deletedCount = lyricsLibrary.deleteAllSongs();
						
						// Nettoyer l'affichage
						if (this.currentLyrics) {
							this.currentLyrics = null;
							this.updateHeader();
							this.renderLines();
						}
						
						// Rafraîchir la liste
						this.refreshSongsList();
						
						this.showCustomAlert('Succès', `${deletedCount} chansons supprimées`);
						console.log(`🗑️ ${deletedCount} chansons supprimées`);
					},
					() => {
						console.log('❌ Suppression totale annulée');
					}
				);
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
			this.showCustomAlert('Champ manquant', 'Veuillez remplir au moins le titre et l\'artiste');
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
				${song.hasAudio ? '<br><small style="color: #3498db;">🎵 Audio associé</small>' : ''}
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
			deleteBtn.title = `Supprimer "${song.title}"`;
			
			// Stocker une référence à this pour l'utiliser dans l'événement
			const self = this;
			
			deleteBtn.addEventListener('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				
				console.log('🔍 Clic sur bouton suppression détecté pour:', song.title);
				console.log('🔍 Song ID:', song.songId);
				console.log('🔍 Type de song.songId:', typeof song.songId);
				
				// Créer une boîte de dialogue personnalisée pour Tauri
				self.showCustomConfirm(
					`Supprimer "${song.title}" ?`,
					`Êtes-vous sûr de vouloir supprimer la chanson "${song.title}" par ${song.artist} ?`,
					() => {
						// Callback de confirmation (OUI)
						console.log('✅ Confirmation de suppression pour:', song.songId);
						
						try {
							// Supprimer de la bibliothèque
							const success = lyricsLibrary.deleteSong(song.songId);
							console.log('🔍 Résultat de deleteSong:', success);
							
							if (success) {
								console.log('🗑️ Chanson supprimée avec succès:', song.title);
								
								// Si la chanson supprimée était en cours d'affichage, nettoyer l'affichage
								if (lyricsDisplay && lyricsDisplay.currentLyrics && 
									lyricsDisplay.currentLyrics.metadata.songId === song.songId) {
									lyricsDisplay.currentLyrics = null;
									lyricsDisplay.updateHeader();
									lyricsDisplay.renderLines();
									console.log('🧹 Affichage nettoyé');
								}
								
								// Rafraîchir la liste immédiatement
								self.refreshSongsList();
								console.log('🔄 Liste rafraîchie');
								
							} else {
								console.error('❌ Échec de la suppression de:', song.title);
								self.showCustomAlert('Erreur', 'Erreur lors de la suppression de la chanson');
							}
						} catch (error) {
							console.error('❌ Erreur lors de la suppression:', error);
							self.showCustomAlert('Erreur', 'Erreur lors de la suppression: ' + error.message);
						}
					},
					() => {
						// Callback d'annulation (NON)
						console.log('❌ Suppression annulée pour:', song.title);
					}
				);
			});
			
			// Marquer que ce bouton a des event listeners attachés
			deleteBtn.setAttribute('data-has-listeners', 'true');
			
			controls.appendChild(deleteBtn);
			songItem.appendChild(songInfo);
			songItem.appendChild(controls);
			songsList.appendChild(songItem);
		});
	}

	// Méthode de diagnostic pour vérifier et réparer les boutons de suppression
	debugDeleteButtons() {
		console.log('🔍 DIAGNOSTIC DES BOUTONS DE SUPPRESSION');
		
		const songsList = document.getElementById('songs-list');
		if (!songsList) {
			console.log('❌ Element songs-list non trouvé');
			return;
		}
		
		const deleteButtons = songsList.querySelectorAll('button[title*="Supprimer"]');
		console.log(`Nombre de boutons trouvés: ${deleteButtons.length}`);
		
		deleteButtons.forEach((btn, index) => {
			console.log(`Bouton ${index + 1}:`, btn.title);
			
			// Vérifier si le bouton a des événements
			const hasOnClick = btn.onclick !== null;
			const hasListeners = btn.hasAttribute('data-has-listeners');
			
			console.log(`  - onclick: ${hasOnClick}`);
			console.log(`  - listeners: ${hasListeners}`);
			
			if (!hasListeners) {
				console.log(`  - RÉPARATION du bouton ${index + 1}`);
				this.repairDeleteButton(btn);
			}
		});
	}
	
	// Réparer un bouton de suppression qui n'a pas d'événements
	repairDeleteButton(deleteBtn) {
		const title = deleteBtn.title;
		const songTitle = title.replace('Supprimer "', '').replace('"', '');
		
		console.log(`🔧 Réparation du bouton pour: ${songTitle}`);
		
		// Trouver la chanson correspondante
		const songs = lyricsLibrary.getAllSongs();
		const song = songs.find(s => s.title === songTitle);
		
		if (!song) {
			console.log(`❌ Chanson non trouvée pour: ${songTitle}`);
			return;
		}
		
		console.log(`✅ Chanson trouvée:`, song);
		
		// Supprimer tous les événements existants
		const newBtn = deleteBtn.cloneNode(true);
		
		// Réattacher l'événement
		const self = this;
		newBtn.addEventListener('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			
			console.log('🔍 BOUTON RÉPARÉ - Clic détecté pour:', song.title);
			
			self.showCustomConfirm(
				`Supprimer "${song.title}" ?`,
				`Êtes-vous sûr de vouloir supprimer "${song.title}" par ${song.artist} ?`,
				() => {
					// Callback de confirmation (OUI)
					const success = lyricsLibrary.deleteSong(song.songId);
					
					if (success) {
						console.log('🗑️ Suppression réussie:', song.title);
						self.refreshSongsList();
					} else {
						console.log('❌ Échec de la suppression:', song.title);
						self.showCustomAlert('Erreur', 'Erreur lors de la suppression');
					}
				},
				() => {
					// Callback d'annulation (NON)
					console.log('❌ Suppression annulée pour:', song.title);
				}
			);
		});
		
		// Marquer comme réparé
		newBtn.setAttribute('data-has-listeners', 'true');
		
		// Remplacer l'ancien bouton
		deleteBtn.parentNode.replaceChild(newBtn, deleteBtn);
		
		console.log(`✅ Bouton réparé pour: ${songTitle}`);
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
			if (this.isDraggedFile(e)) {
				dropZone.style.display = 'flex';
				container.style.filter = 'brightness(0.8)';
			}
		});
		
		container.addEventListener('dragover', (e) => {
			if (this.isDraggedFile(e)) {
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

	isDraggedFileAudio(event) {
		const items = event.dataTransfer.items;
		if (!items) return false;
		
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item.kind === 'file') {
				const type = item.type;
				// Vérifier les types MIME pour les fichiers audio
				if (type.startsWith('audio/') || 
					type.startsWith('video/') ||
					item.getAsFile()?.name.match(/\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i)) {
					return true;
				}
			}
		}
		return false;
	}

	isDraggedFile(event) {
		return this.isDraggedFileText(event) || this.isDraggedFileAudio(event);
	}

	async handleDroppedFiles(files) {
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			
			// Vérifier si c'est un fichier texte
			if (this.isTextFile(file)) {
				try {
					const content = await this.readFileContent(file);
					this.createSongFromText(file.name, content);
				} catch (error) {
					console.error('❌ Erreur lecture fichier:', error);
					this.showCustomAlert('Erreur', `Erreur lors de la lecture du fichier ${file.name}: ${error.message}`);
				}
			}
			// Vérifier si c'est un fichier audio
			else if (this.isAudioFile(file)) {
				try {
					this.loadAudioFile(file);
				} catch (error) {
					console.error('❌ Erreur chargement audio:', error);
					this.showCustomAlert('Erreur', `Erreur lors du chargement du fichier audio ${file.name}: ${error.message}`);
				}
			}
			else {
				console.warn('⚠️ Fichier ignoré (format non supporté):', file.name);
				this.showCustomAlert('Format non supporté', `Le fichier "${file.name}" n'est pas un format supporté (texte ou audio).`);
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

	isAudioFile(file) {
		// Vérifier le type MIME
		if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
			return true;
		}
		
		// Vérifier l'extension
		const validExtensions = /\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i;
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
			this.showCustomAlert('Erreur', `Erreur lors de la création de la chanson: ${error.message}`);
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
			this.showCustomAlert('Succès', `Chanson LRC "${syncedLyrics.metadata.title}" créée avec succès!`);
			
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
		this.showCustomAlert('Succès', `Chanson "${title}" créée avec ${lines.length} lignes!\nVous pouvez maintenant éditer les timecodes en mode édition.`);
	}

	loadAudioFile(file) {
		// Les navigateurs ne donnent que le nom du fichier pour des raisons de sécurité
		const fileName = file.name;
		const fileSize = file.size;
		const lastModified = file.lastModified;
		
		// Créer un identifiant unique pour le fichier basé sur ses propriétés
		const fileId = `${fileName}_${fileSize}_${lastModified}`;
		
		// Créer les métadonnées du fichier
		const audioMetadata = {
			fileName: fileName,
			fileSize: fileSize,
			lastModified: lastModified,
			fileId: fileId
		};
		
		// Si une chanson est actuellement chargée, associer les infos du fichier
		if (this.currentLyrics) {
			this.currentLyrics.setAudioPath(JSON.stringify(audioMetadata));
			// Sauvegarder les changements
			if (lyricsLibrary) {
				lyricsLibrary.saveSong(this.currentLyrics);
			}
			console.log('✅ Métadonnées audio associées à la chanson:', this.currentLyrics.metadata.title, '→', fileName);
		}
		
		// Créer une URL temporaire pour la session actuelle
		const audioUrl = URL.createObjectURL(file);
		
		// Créer ou réutiliser l'élément audio
		if (!this.audioPlayer) {
			this.audioPlayer = document.createElement('audio');
			this.audioPlayer.preload = 'metadata';
			
			// Événements du lecteur audio
			this.audioPlayer.addEventListener('loadedmetadata', () => {
				this.updateAudioPlayerUI();
			});
			
			this.audioPlayer.addEventListener('timeupdate', () => {
				this.updateAudioTime();
			});
			
			this.audioPlayer.addEventListener('ended', () => {
				this.isPlayingInternal = false;
				this.updatePlayPauseButton();
			});
			
			this.audioPlayer.addEventListener('error', (e) => {
				console.warn('⚠️ Erreur audio:', e);
				this.showAudioNotFoundMessage();
			});
		}
		
		// Charger le fichier temporairement
		this.audioPlayer.src = audioUrl;
		this.audioPath = audioUrl;
		this.currentAudioFileName = fileName;
		this.currentAudioMetadata = audioMetadata;
		
		// Afficher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) {
			audioPlayerDiv.style.display = 'block';
			this.restoreAudioControls();
		}
		if (audioFilename) {
			const sizeInMB = (fileSize / (1024 * 1024)).toFixed(1);
			audioFilename.textContent = `${fileName} (${sizeInMB} MB)`;
		}
		
		console.log('✅ Fichier audio chargé:', fileName, `(${(fileSize/(1024*1024)).toFixed(1)} MB)`);
		this.showCustomAlert('Audio associé', `Fichier audio "${fileName}" associé!\nTaille: ${(fileSize/(1024*1024)).toFixed(1)} MB\n\nLe fichier sera reconnu automatiquement s'il n'est pas modifié.`);
	}

	setupAudioPlayerListeners() {
		// Bouton play/pause
		const playPauseBtn = document.getElementById('play-pause-btn');
		if (playPauseBtn) {
			playPauseBtn.addEventListener('click', () => {
				this.togglePlayPause();
			});
		}
		
		// Scrubber audio
		const audioScrubber = document.getElementById('audio-scrubber');
		if (audioScrubber) {
			let isDragging = false;
			
			audioScrubber.addEventListener('mousedown', () => {
				isDragging = true;
			});
			
			audioScrubber.addEventListener('mouseup', () => {
				if (isDragging && this.audioPlayer) {
					const time = (audioScrubber.value / 100) * this.audioPlayer.duration;
					this.audioPlayer.currentTime = time;
				}
				isDragging = false;
			});
			
			audioScrubber.addEventListener('input', (e) => {
				if (isDragging && this.audioPlayer) {
					const time = (e.target.value / 100) * this.audioPlayer.duration;
					// Mettre à jour les paroles même pendant le scrubbing
					this.updateTime(time * 1000); // Convertir en millisecondes
				}
			});
		}
		
		// Contrôle du volume
		const volumeSlider = document.getElementById('volume-slider');
		if (volumeSlider) {
			volumeSlider.addEventListener('input', (e) => {
				if (this.audioPlayer) {
					this.audioPlayer.volume = e.target.value / 100;
				}
			});
		}
		
		// Bouton supprimer audio
		const removeAudioBtn = document.getElementById('remove-audio-btn');
		if (removeAudioBtn) {
			removeAudioBtn.addEventListener('click', () => {
				this.removeAudio();
			});
		}
		
		console.log('✅ Contrôles audio configurés');
	}

	togglePlayPause() {
		if (!this.audioPlayer || !this.audioPath) {
			console.warn('⚠️ Aucun fichier audio chargé');
			return;
		}
		
		// Vérifier si l'audio est disponible
		if (this.audioPlayer.readyState === 0) {
			console.warn('⚠️ Fichier audio non prêt ou non trouvé');
			this.showAudioNotFoundMessage(this.currentAudioFileName);
			return;
		}
		
		try {
			if (this.isPlayingInternal) {
				this.audioPlayer.pause();
				this.isPlayingInternal = false;
			} else {
				// Tentative de lecture
				const playPromise = this.audioPlayer.play();
				if (playPromise !== undefined) {
					playPromise
						.then(() => {
							this.isPlayingInternal = true;
							this.restoreAudioControls();
						})
						.catch((error) => {
							console.warn('⚠️ Erreur de lecture audio:', error);
							this.showAudioNotFoundMessage(this.currentAudioFileName);
						});
				} else {
					this.isPlayingInternal = true;
					this.restoreAudioControls();
				}
			}
		} catch (error) {
			console.warn('⚠️ Erreur contrôle audio:', error);
			this.showAudioNotFoundMessage(this.currentAudioFileName);
		}
		
		this.updatePlayPauseButton();
	}

	updatePlayPauseButton() {
		const playPauseBtn = document.getElementById('play-pause-btn');
		if (playPauseBtn) {
			playPauseBtn.textContent = this.isPlayingInternal ? '⏸️ Pause' : '▶️ Play';
			playPauseBtn.style.backgroundColor = this.isPlayingInternal ? '#e74c3c' : '#27ae60';
		}
	}

	updateAudioPlayerUI() {
		if (!this.audioPlayer) return;
		
		const totalTime = document.getElementById('total-time');
		if (totalTime && this.audioPlayer.duration) {
			totalTime.textContent = this.formatTime(this.audioPlayer.duration);
		}
		
		// Réinitialiser le scrubber
		const audioScrubber = document.getElementById('audio-scrubber');
		if (audioScrubber) {
			audioScrubber.value = 0;
		}
		
		// Réinitialiser le temps actuel
		const currentTime = document.getElementById('current-time');
		if (currentTime) {
			currentTime.textContent = '0:00';
		}
	}

	updateAudioTime() {
		if (!this.audioPlayer) return;
		
		const currentTime = document.getElementById('current-time');
		const audioScrubber = document.getElementById('audio-scrubber');
		
		// Mettre à jour l'affichage du temps
		if (currentTime) {
			currentTime.textContent = this.formatTime(this.audioPlayer.currentTime);
		}
		
		// Mettre à jour le scrubber (seulement si on ne le manipule pas)
		if (audioScrubber && !audioScrubber.matches(':active')) {
			const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
			audioScrubber.value = progress || 0;
		}
		
		// Synchroniser les paroles avec la musique (seulement si on joue depuis le lecteur interne)
		if (this.isPlayingInternal && this.currentLyrics) {
			const timeMs = this.audioPlayer.currentTime * 1000;
			this.updateTime(timeMs);
		}
	}

	formatTime(seconds) {
		if (!seconds || isNaN(seconds)) return '0:00';
		
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	openFileSelector(expectedMetadata) {
		// Créer un input file invisible
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'audio/*,video/*';
		fileInput.style.display = 'none';
		
		// Gestionnaire pour quand un fichier est sélectionné
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				// Vérifier si c'est le bon fichier
				const isCorrectFile = this.validateAudioFile(file, expectedMetadata);
				
				if (isCorrectFile.isValid) {
					this.loadAudioFile(file);
					console.log('✅ Fichier audio retrouvé et chargé:', file.name);
				} else {
					// Demander confirmation si le fichier ne correspond pas exactement
					const message = `Le fichier sélectionné semble différent:\n\n` +
						`Attendu: ${expectedMetadata.fileName}\n` +
						`Sélectionné: ${file.name}\n\n` +
						`Raison: ${isCorrectFile.reason}\n\n` +
						`Voulez-vous quand même l'utiliser ?`;
					
					if (confirm(message)) {
						this.loadAudioFile(file);
					}
				}
			}
			// Nettoyer
			document.body.removeChild(fileInput);
		});
		
		// Ajouter temporairement à la page et déclencher
		document.body.appendChild(fileInput);
		fileInput.click();
	}

	validateAudioFile(file, expectedMetadata) {
		// Vérifier le nom du fichier
		if (file.name !== expectedMetadata.fileName) {
			return { isValid: false, reason: 'Nom de fichier différent' };
		}
		
		// Vérifier la taille si disponible
		if (expectedMetadata.fileSize && Math.abs(file.size - expectedMetadata.fileSize) > 1024) {
			return { isValid: false, reason: 'Taille de fichier différente' };
		}
		
		// Vérifier la date de modification si disponible
		if (expectedMetadata.lastModified && file.lastModified !== expectedMetadata.lastModified) {
			return { isValid: false, reason: 'Date de modification différente' };
		}
		
		return { isValid: true, reason: 'Fichier correspond' };
	}

	disableAudioControls() {
		const playPauseBtn = document.getElementById('play-pause-btn');
		const audioScrubber = document.getElementById('audio-scrubber');
		const volumeSlider = document.getElementById('volume-slider');
		
		[playPauseBtn, audioScrubber, volumeSlider].forEach(control => {
			if (control) {
				control.disabled = true;
				control.style.opacity = '0.5';
			}
		});
		
		if (playPauseBtn) {
			playPauseBtn.textContent = '📁 Charger audio';
			playPauseBtn.style.backgroundColor = '#95a5a6';
		}
	}

	showAudioNotFoundMessage(audioInfo = null) {
		// Afficher le lecteur avec un message d'aide
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) {
			audioPlayerDiv.style.display = 'block';
			audioPlayerDiv.style.backgroundColor = '#8e44ad'; // Couleur violette pour indiquer l'état "manquant"
		}
		
		if (audioFilename) {
			const displayName = audioInfo || 'Fichier audio';
			audioFilename.innerHTML = `
				<span style="color: #f39c12;">⚠️ ${displayName} - Erreur</span><br>
				<small style="color: #bdc3c7;">Glissez le fichier audio dans la zone ou utilisez "Sélectionner" dans les métadonnées</small>
			`;
		}
		
		this.disableAudioControls();
		console.log('⚠️ Fichier audio non disponible:', audioInfo);
	}

	restoreAudioControls() {
		// Réactiver les contrôles audio
		const playPauseBtn = document.getElementById('play-pause-btn');
		const audioScrubber = document.getElementById('audio-scrubber');
		const volumeSlider = document.getElementById('volume-slider');
		const audioPlayerDiv = document.getElementById('audio-player');
		
		[playPauseBtn, audioScrubber, volumeSlider].forEach(control => {
			if (control) {
				control.disabled = false;
				control.style.opacity = '1';
			}
		});
		
		if (audioPlayerDiv) {
			audioPlayerDiv.style.backgroundColor = '#2c3e50'; // Couleur normale
		}
		
		if (playPauseBtn) {
			playPauseBtn.textContent = '▶️ Play';
			playPauseBtn.style.backgroundColor = '#27ae60';
		}
	}

	removeAudio() {
		if (this.audioPlayer) {
			this.audioPlayer.pause();
			this.audioPlayer.src = '';
			if (this.audioPath && this.audioPath.startsWith('blob:')) {
				URL.revokeObjectURL(this.audioPath);
			}
		}
		
		this.audioPath = null;
		this.isPlayingInternal = false;
		this.currentAudioFileName = null;
		
		// Cacher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		if (audioPlayerDiv) audioPlayerDiv.style.display = 'none';
		
		console.log('✅ Fichier audio supprimé');
	}

	loadAudioFromUrl(audioUrl) {
		// Créer ou réutiliser l'élément audio
		if (!this.audioPlayer) {
			this.audioPlayer = document.createElement('audio');
			this.audioPlayer.preload = 'metadata';
			this.audioPlayer.crossOrigin = 'anonymous'; // Pour éviter les problèmes CORS
			
			// Événements du lecteur audio
			this.audioPlayer.addEventListener('loadedmetadata', () => {
				this.updateAudioPlayerUI();
			});
			
			this.audioPlayer.addEventListener('timeupdate', () => {
				this.updateAudioTime();
			});
			
			this.audioPlayer.addEventListener('ended', () => {
				this.isPlayingInternal = false;
				this.updatePlayPauseButton();
			});
			
			this.audioPlayer.addEventListener('error', (e) => {
				console.warn('⚠️ Erreur chargement audio depuis URL:', audioUrl, e);
				this.showAudioNotFoundMessage(audioUrl);
			});
		}
		
		// Charger l'audio depuis l'URL
		this.audioPlayer.src = audioUrl;
		this.audioPath = audioUrl;
		
		// Afficher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) audioPlayerDiv.style.display = 'block';
		if (audioFilename) {
			// Extraire le nom du fichier depuis l'URL (decoder pour gérer les espaces)
			const fileName = decodeURIComponent(audioUrl.split('/').pop());
			audioFilename.textContent = fileName;
		}
		
		console.log('✅ Audio chargé depuis URL:', audioUrl);
	}

	loadAssociatedAudio(audioPath) {
		if (!audioPath) return;
		
		// Normaliser le chemin audio
		const normalizedPath = normalizeAudioPath(audioPath);
		
		if (!normalizedPath) {
			console.warn('⚠️ Impossible de normaliser le chemin audio:', audioPath);
			return;
		}
		
		console.log('🎵 Chargement audio:', normalizedPath);
		
		// Si c'est une URL http, essayer de charger directement
		if (normalizedPath.startsWith('http')) {
			this.loadAudioFromUrl(normalizedPath);
			return;
		}
		
		// Si c'est un chemin de fichier (pas une URL blob), essayer de le charger
		if (!normalizedPath.startsWith('blob:')) {
			this.loadAudioFromUrl(normalizedPath);
			return;
		}
		
		// Créer ou réutiliser l'élément audio
		if (!this.audioPlayer) {
			this.audioPlayer = document.createElement('audio');
			this.audioPlayer.preload = 'metadata';
			
			// Événements du lecteur audio
			this.audioPlayer.addEventListener('loadedmetadata', () => {
				this.updateAudioPlayerUI();
			});
			
			this.audioPlayer.addEventListener('timeupdate', () => {
				this.updateAudioTime();
			});
			
			this.audioPlayer.addEventListener('ended', () => {
				this.isPlayingInternal = false;
				this.updatePlayPauseButton();
			});
			
			this.audioPlayer.addEventListener('error', (e) => {
				console.warn('⚠️ Erreur chargement audio:', e);
				this.showAudioNotFoundMessage(audioPath);
			});
		}
		
		// Charger l'audio associé
		this.audioPlayer.src = audioPath;
		this.audioPath = audioPath;
		
		// Afficher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) audioPlayerDiv.style.display = 'block';
		if (audioFilename) {
			// Extraire le nom du fichier depuis l'URL blob ou le chemin
			const filename = audioPath.startsWith('blob:') ? 'Fichier audio temporaire' : audioPath;
			audioFilename.textContent = filename;
		}
		
		console.log('✅ Audio associé chargé pour la chanson');
	}

	// Méthode pour essayer de charger un audio depuis un chemin normalisé
	tryLoadAudioFromPath(normalizedPath) {
		// Créer ou réutiliser l'élément audio
		if (!this.audioPlayer) {
			this.audioPlayer = document.createElement('audio');
			this.audioPlayer.preload = 'metadata';
			
			// Événements du lecteur audio
			this.audioPlayer.addEventListener('loadedmetadata', () => {
				this.updateAudioPlayerUI();
			});
			
			this.audioPlayer.addEventListener('timeupdate', () => {
				this.updateAudioTime();
			});
			
			this.audioPlayer.addEventListener('ended', () => {
				this.isPlayingInternal = false;
				this.updatePlayPauseButton();
			});
			
			this.audioPlayer.addEventListener('error', (e) => {
				console.warn('⚠️ Erreur chargement audio depuis le chemin:', normalizedPath, e);
				this.showAudioNotFoundMessage(normalizedPath);
			});
		}
		
		// Charger l'audio avec le chemin normalisé
		this.audioPlayer.src = normalizedPath;
		this.audioPath = normalizedPath;
		
		// Afficher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) audioPlayerDiv.style.display = 'block';
		if (audioFilename) {
			// Extraire le nom du fichier depuis le chemin normalisé
			const filename = normalizedPath.split('/').pop();
			audioFilename.textContent = filename;
		}
		
		console.log('✅ Audio chargé depuis le chemin normalisé:', normalizedPath);
	}

	loadAssociatedAudio(audioPath) {
		if (!audioPath) return;
		
		// Si c'est des métadonnées JSON, analyser et proposer de charger le fichier
		if (audioPath.startsWith('{')) {
			try {
				const audioMetadata = JSON.parse(audioPath);
				this.showAudioLoadInterface(audioMetadata);
				return;
			} catch (e) {
				console.warn('⚠️ Métadonnées audio corrompues:', e);
				this.showAudioNotFoundMessage(audioPath);
				return;
			}
		}
		
		// Si c'est un chemin de fichier classique, proposer de le charger
		if (!audioPath.startsWith('blob:') && !audioPath.startsWith('http')) {
			this.showAudioLoadInterface({ fileName: audioPath });
			return;
		}
		
		// Créer ou réutiliser l'élément audio
		if (!this.audioPlayer) {
			this.audioPlayer = document.createElement('audio');
			this.audioPlayer.preload = 'metadata';
			
			// Événements du lecteur audio
			this.audioPlayer.addEventListener('loadedmetadata', () => {
				this.updateAudioPlayerUI();
			});
			
			this.audioPlayer.addEventListener('timeupdate', () => {
				this.updateAudioTime();
			});
			
			this.audioPlayer.addEventListener('ended', () => {
				this.isPlayingInternal = false;
				this.updatePlayPauseButton();
			});
			
			this.audioPlayer.addEventListener('error', (e) => {
				console.warn('⚠️ Erreur chargement audio:', e);
				this.showAudioNotFoundMessage(audioPath);
			});
		}
		
		// Charger l'audio associé
		this.audioPlayer.src = audioPath;
		this.audioPath = audioPath;
		
		// Afficher le lecteur
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) audioPlayerDiv.style.display = 'block';
		if (audioFilename) {
			// Extraire le nom du fichier depuis l'URL blob ou le chemin
			const filename = audioPath.startsWith('blob:') ? 'Fichier audio temporaire' : audioPath;
			audioFilename.textContent = filename;
		}
		
		console.log('✅ Audio associé chargé pour la chanson');
	}

	showAudioLoadInterface(audioMetadata) {
		// Afficher le lecteur avec interface de chargement améliorée
		const audioPlayerDiv = document.getElementById('audio-player');
		const audioFilename = document.getElementById('audio-filename');
		
		if (audioPlayerDiv) {
			audioPlayerDiv.style.display = 'block';
			audioPlayerDiv.style.backgroundColor = '#3498db'; // Couleur bleue pour "à charger"
		}
		
		if (audioFilename) {
			const fileName = audioMetadata.fileName || 'Fichier audio';
			const fileSize = audioMetadata.fileSize ? `(${(audioMetadata.fileSize/(1024*1024)).toFixed(1)} MB)` : '';
			
			audioFilename.innerHTML = `
				<div style="text-align: left;">
					<span style="color: #fff; font-weight: bold;">🎵 ${fileName} ${fileSize}</span><br>
					<button id="load-file-btn" style="padding: 4px 12px; background: #2ecc71; color: white; border: none; border-radius: 4px; font-size: 12px; margin-top: 4px; cursor: pointer;">📁 Charger ce fichier</button>
					<small style="color: #ecf0f1; display: block; margin-top: 3px;">Cliquez pour sélectionner le fichier audio correspondant</small>
				</div>
			`;
			
			// Ajouter l'événement pour charger le fichier
			const loadBtn = document.getElementById('load-file-btn');
			if (loadBtn) {
				loadBtn.addEventListener('click', () => {
					this.openFileSelector(audioMetadata);
				});
			}
		}
		
		// Désactiver les contrôles audio
		this.disableAudioControls();
		
		console.log('📁 Métadonnées audio trouvées:', fileName, '- En attente de chargement');
	}

	setupMetadataEditListeners() {
		// Bouton sélectionner fichier audio
		const selectAudioBtn = document.getElementById('select-audio-btn');
		const audioFileInput = document.getElementById('audio-file-input');
		
		if (selectAudioBtn && audioFileInput) {
			selectAudioBtn.addEventListener('click', () => {
				audioFileInput.click();
			});
			
			audioFileInput.addEventListener('change', (e) => {
				const file = e.target.files[0];
				if (file && this.currentLyrics) {
					// Créer les métadonnées du fichier
					const audioMetadata = {
						fileName: file.name,
						fileSize: file.size,
						lastModified: file.lastModified,
						fileId: `${file.name}_${file.size}_${file.lastModified}`
					};
					
					// Stocker les métadonnées JSON dans les métadonnées de la chanson
					this.currentLyrics.setAudioPath(JSON.stringify(audioMetadata));
					document.getElementById('edit-audio-path').value = file.name;
					
					// Charger le fichier temporairement pour cette session
					this.loadAudioFile(file);
					
					console.log('✅ Fichier audio sélectionné et métadonnées sauvegardées:', file.name);
				}
			});
		}
		
		// Bouton supprimer audio depuis l'édition
		const removeAudioBtnEdit = document.getElementById('remove-audio-btn-edit');
		if (removeAudioBtnEdit) {
			removeAudioBtnEdit.addEventListener('click', () => {
				if (this.currentLyrics) {
					this.currentLyrics.setAudioPath(null);
					document.getElementById('edit-audio-path').value = '';
					this.removeAudio();
					console.log('✅ Audio dissocié de la chanson');
				}
			});
		}
		
		console.log('✅ Contrôles d\'édition des métadonnées configurés');
	}

	populateMetadataEdit() {
		if (!this.currentLyrics) return;
		
		const titleInput = document.getElementById('edit-title');
		const artistInput = document.getElementById('edit-artist');
		const albumInput = document.getElementById('edit-album');
		const audioPathInput = document.getElementById('edit-audio-path');
		
		if (titleInput) titleInput.value = this.currentLyrics.metadata.title || '';
		if (artistInput) artistInput.value = this.currentLyrics.metadata.artist || '';
		if (albumInput) albumInput.value = this.currentLyrics.metadata.album || '';
		if (audioPathInput) {
			const audioPath = this.currentLyrics.metadata.audioPath || '';
			
			// Si c'est des métadonnées JSON, extraire le nom du fichier
			if (audioPath.startsWith('{')) {
				try {
					const audioMetadata = JSON.parse(audioPath);
					audioPathInput.value = audioMetadata.fileName || '';
				} catch (e) {
					audioPathInput.value = 'Métadonnées corrompues';
				}
			} else {
				audioPathInput.value = audioPath;
			}
		}
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
			lyricsContent.style.minHeight = this.editMode ? '500px' : '300px';
			lyricsContent.style.maxHeight = this.editMode ? '85vh' : '80vh';
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
			lyricsContent.style.flex = '1';
			
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
		
		// Ajuster la hauteur du conteneur en mode édition
		this.adjustContentHeight();
	}

	// Mode record pour synchronisation en temps réel
	toggleRecordMode() {
		recordMode.isRecording = !recordMode.isRecording;
		recordMode.scrollBlocked = recordMode.isRecording;
		
		const recordBtn = document.getElementById('record-mode-btn');
		if (recordBtn) {
			if (recordMode.isRecording) {
				recordBtn.textContent = '⏹️ Stop Record';
				recordBtn.style.backgroundColor = '#27ae60';
				recordBtn.style.animation = 'pulse 1s infinite';
			} else {
				recordBtn.textContent = '🔴 Record';
				recordBtn.style.backgroundColor = '#e74c3c';
				recordBtn.style.animation = 'none';
			}
		}
		
		// Ajouter/supprimer les événements de clic sur les lignes
		const lyricsLines = document.querySelectorAll('.lyrics-line');
		lyricsLines.forEach(line => {
			if (recordMode.isRecording) {
				line.addEventListener('click', this.recordLineTimecode.bind(this));
				line.style.cursor = 'crosshair';
				line.title = 'Cliquez pour synchroniser avec le timecode actuel';
			} else {
				line.removeEventListener('click', this.recordLineTimecode.bind(this));
				line.style.cursor = this.editMode ? 'text' : 'default';
				line.title = '';
			}
		});
		
		// Ajouter CSS pour l'animation pulse
		if (recordMode.isRecording && !document.getElementById('record-mode-styles')) {
			const style = document.createElement('style');
			style.id = 'record-mode-styles';
			style.textContent = `
				@keyframes pulse {
					0% { opacity: 1; }
					50% { opacity: 0.6; }
					100% { opacity: 1; }
				}
				@keyframes flash {
					0% { background-color: transparent; }
					50% { background-color: rgba(39, 174, 96, 0.4); }
					100% { background-color: transparent; }
				}
				.recording-mode .lyrics-line:hover {
					background-color: rgba(231, 76, 60, 0.2) !important;
					border-left: 4px solid #e74c3c;
				}
			`;
			document.head.appendChild(style);
		}
		
		// Ajouter/supprimer la classe recording-mode
		const lyricsContainer = document.getElementById('lyrics-content');
		if (lyricsContainer) {
			if (recordMode.isRecording) {
				lyricsContainer.classList.add('recording-mode');
			} else {
				lyricsContainer.classList.remove('recording-mode');
			}
		}
		
		console.log(`🎵 Mode record ${recordMode.isRecording ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
	}

	// Enregistrer le timecode d'une ligne lors du clic en mode record
	recordLineTimecode(event) {
		if (!recordMode.isRecording) return;
		
		event.preventDefault();
		event.stopPropagation();
		
		const lineElement = event.target;
		const lineId = lineElement.id;
		
		// Obtenir le timecode actuel (de l'hôte ou du lecteur audio)
		let currentTimeMs = this.currentTime;
		
		// Si un lecteur audio est actif, utiliser son timecode
		if (this.audioPlayer && !this.audioPlayer.paused) {
			currentTimeMs = this.audioPlayer.currentTime * 1000;
		}
		
		// Mettre à jour le timecode de la ligne dans les paroles synchronisées
		if (this.currentLyrics) {
			const lineIndex = Array.from(lineElement.parentNode.children).indexOf(lineElement);
			const lyricLine = this.currentLyrics.lyrics[lineIndex];
			
			if (lyricLine) {
				// Sauvegarder l'ancien timecode pour la possibilité d'annulation
				const oldTimecode = lyricLine.startTime;
				lyricLine.startTime = currentTimeMs;
				
				// Feedback visuel
				lineElement.style.animation = 'flash 0.5s';
				lineElement.style.borderLeft = '4px solid #27ae60';
				
				// Mettre à jour l'affichage du timecode si en mode édition
				const timecodeDisplay = lineElement.querySelector('.timecode-control input');
				if (timecodeDisplay) {
					timecodeDisplay.value = (currentTimeMs / 1000).toFixed(3);
				}
				
				// Log pour debug
				console.log(`🎯 Ligne "${lyricLine.text}" synchronisée:`, {
					ancien: (oldTimecode / 1000).toFixed(3) + 's',
					nouveau: (currentTimeMs / 1000).toFixed(3) + 's',
					ligne: lineIndex + 1
				});
				
				// Sauvegarder automatiquement si la chanson est dans la bibliothèque
				if (lyricsLibrary && this.currentLyrics.metadata) {
					lyricsLibrary.addSong(this.currentLyrics);
					console.log('💾 Timecode sauvegardé automatiquement');
				}
				
				// Supprimer le feedback visuel après un délai
				setTimeout(() => {
					lineElement.style.animation = '';
					lineElement.style.borderLeft = '';
				}, 500);
			}
		}
	}

	adjustContentHeight() {
		const lyricsContent = document.getElementById('lyrics-content');
		if (!lyricsContent) return;
		
		if (this.editMode) {
			// En mode édition, utiliser plus d'espace vertical
			lyricsContent.style.minHeight = '500px';
			lyricsContent.style.maxHeight = '85vh';
		} else {
			// En mode lecture, taille plus compacte
			lyricsContent.style.minHeight = '300px';
			lyricsContent.style.maxHeight = '80vh';
		}
		
		// Ajuster aussi le conteneur parent
		const container = this.container;
		if (container && !this.isFullscreen) {
			container.style.minHeight = this.editMode ? '700px' : '600px';
			container.style.height = 'auto';
		}
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
		
		// Sauvegarder les métadonnées modifiées
		const titleInput = document.getElementById('edit-title');
		const artistInput = document.getElementById('edit-artist');
		const albumInput = document.getElementById('edit-album');
		const audioPathInput = document.getElementById('edit-audio-path');
		
		if (titleInput) this.currentLyrics.metadata.title = titleInput.value.trim();
		if (artistInput) this.currentLyrics.metadata.artist = artistInput.value.trim();
		if (albumInput) this.currentLyrics.metadata.album = albumInput.value.trim();
		if (audioPathInput) this.currentLyrics.metadata.audioPath = audioPathInput.value.trim() || null;
		
		// Sauvegarder les paroles modifiées
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
		
		// Mettre à jour l'affichage de l'en-tête
		this.updateHeader();
		
		console.log('✅ Modifications sauvegardées (métadonnées et paroles)');
		
		// Rafraîchir l'affichage
		this.renderLines();
		this.toggleEditMode(); // Réactiver le mode édition pour voir les changements
	}

	loadLyrics(syncedLyrics) {
		this.currentLyrics = syncedLyrics;
		this.updateHeader();
		this.renderLines();
		
		// Vérifier s'il y a un audio associé
		if (syncedLyrics.hasAudio()) {
			const audioPath = syncedLyrics.getAudioPath();
			// Si c'est un nom de fichier simple, afficher le message d'aide
			if (!audioPath.startsWith('blob:') && !audioPath.startsWith('http')) {
				this.showAudioNotFoundMessage(audioPath);
			} else {
				this.loadAssociatedAudio(audioPath);
			}
		} else {
			// Pas d'audio associé, cacher le lecteur
			const audioPlayerDiv = document.getElementById('audio-player');
			if (audioPlayerDiv) audioPlayerDiv.style.display = 'none';
		}
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
				margin-bottom: ${this.editMode ? '10px' : '4px'};
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
		
		// Ajuster la hauteur après le rendu
		this.adjustContentHeight();
	}

	updateTime(timeMs) {
		this.currentTime = timeMs;
		recordMode.currentTimecode = timeMs; // Mettre à jour le timecode global pour le mode record
		
		if (!this.currentLyrics) return;

		const activeLine = this.currentLyrics.getActiveLineAt(timeMs);
		if (activeLine && activeLine !== this.activeLine) {
			this.highlightLine(activeLine);
			this.activeLine = activeLine;
		}
		
		// Mettre à jour le timecode externe (pour compatibilité avec l'hôte)
		const timecodeElement = document.getElementById('timecode');
		if (timecodeElement) {
			const seconds = (timeMs / 1000).toFixed(3);
			const isHostPlaying = !this.isPlayingInternal; // Si ce n'est pas le lecteur interne, c'est l'hôte
			const playIcon = (this.isPlayingInternal || isHostPlaying) ? '▶️' : '⏸️';
			const recordIndicator = recordMode.isRecording ? ' 🔴' : '';
			timecodeElement.textContent = `${playIcon} ${seconds}s${recordIndicator}`;
			timecodeElement.style.backgroundColor = (this.isPlayingInternal || isHostPlaying) ? '#0a0' : '#a00';
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
			
			// Scroll vers la ligne active seulement si le scroll n'est pas bloqué (mode record)
			if (!recordMode.scrollBlocked) {
				lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}

	// Boîtes de dialogue personnalisées pour Tauri
	showCustomConfirm(title, message, onConfirm, onCancel) {
		// Créer un overlay
		const overlay = document.createElement('div');
		overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0, 0, 0, 0.7);
			z-index: 10000;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		`;

		// Créer la boîte de dialogue
		const dialog = document.createElement('div');
		dialog.style.cssText = `
			background: #2c3e50;
			border-radius: 10px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
			max-width: 400px;
			width: 90%;
			padding: 0;
			color: white;
			text-align: center;
			border: 1px solid #34495e;
		`;

		// En-tête
		const header = document.createElement('div');
		header.style.cssText = `
			background: #34495e;
			padding: 15px;
			border-radius: 10px 10px 0 0;
			border-bottom: 1px solid #1a252f;
		`;
		header.innerHTML = `<h3 style="margin: 0; font-size: 18px; color: #ecf0f1;">${title}</h3>`;

		// Contenu
		const content = document.createElement('div');
		content.style.cssText = `
			padding: 20px;
			font-size: 16px;
			line-height: 1.4;
			color: #bdc3c7;
		`;
		content.textContent = message;

		// Boutons
		const buttons = document.createElement('div');
		buttons.style.cssText = `
			display: flex;
			gap: 10px;
			padding: 15px 20px 20px;
			justify-content: center;
		`;

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Annuler';
		cancelBtn.style.cssText = `
			padding: 10px 20px;
			border: none;
			border-radius: 5px;
			background: #7f8c8d;
			color: white;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s;
		`;
		cancelBtn.onmouseover = () => cancelBtn.style.background = '#95a5a6';
		cancelBtn.onmouseout = () => cancelBtn.style.background = '#7f8c8d';

		const confirmBtn = document.createElement('button');
		confirmBtn.textContent = 'Supprimer';
		confirmBtn.style.cssText = `
			padding: 10px 20px;
			border: none;
			border-radius: 5px;
			background: #e74c3c;
			color: white;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s;
			font-weight: bold;
		`;
		confirmBtn.onmouseover = () => confirmBtn.style.background = '#c0392b';
		confirmBtn.onmouseout = () => confirmBtn.style.background = '#e74c3c';

		// Événements
		cancelBtn.addEventListener('click', () => {
			document.body.removeChild(overlay);
			if (onCancel) onCancel();
		});

		confirmBtn.addEventListener('click', () => {
			document.body.removeChild(overlay);
			if (onConfirm) onConfirm();
		});

		// Fermer avec Escape
		const escapeHandler = (e) => {
			if (e.key === 'Escape') {
				document.body.removeChild(overlay);
				document.removeEventListener('keydown', escapeHandler);
				if (onCancel) onCancel();
			}
		};
		document.addEventListener('keydown', escapeHandler);

		// Fermer en cliquant sur l'overlay
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				document.body.removeChild(overlay);
				if (onCancel) onCancel();
			}
		});

		// Assembler la boîte de dialogue
		buttons.appendChild(cancelBtn);
		buttons.appendChild(confirmBtn);
		dialog.appendChild(header);
		dialog.appendChild(content);
		dialog.appendChild(buttons);
		overlay.appendChild(dialog);

		// Ajouter au DOM
		document.body.appendChild(overlay);

		// Focus sur le bouton Annuler par défaut
		setTimeout(() => cancelBtn.focus(), 100);
	}

	showCustomAlert(title, message, onOk) {
		// Créer un overlay
		const overlay = document.createElement('div');
		overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0, 0, 0, 0.7);
			z-index: 10000;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		`;

		// Créer la boîte de dialogue
		const dialog = document.createElement('div');
		dialog.style.cssText = `
			background: #2c3e50;
			border-radius: 10px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
			max-width: 400px;
			width: 90%;
			padding: 0;
			color: white;
			text-align: center;
			border: 1px solid #34495e;
		`;

		// En-tête
		const header = document.createElement('div');
		header.style.cssText = `
			background: #e74c3c;
			padding: 15px;
			border-radius: 10px 10px 0 0;
			border-bottom: 1px solid #c0392b;
		`;
		header.innerHTML = `<h3 style="margin: 0; font-size: 18px; color: white;">⚠️ ${title}</h3>`;

		// Contenu
		const content = document.createElement('div');
		content.style.cssText = `
			padding: 20px;
			font-size: 16px;
			line-height: 1.4;
			color: #bdc3c7;
		`;
		content.textContent = message;

		// Bouton
		const button = document.createElement('div');
		button.style.cssText = `
			padding: 15px 20px 20px;
			display: flex;
			justify-content: center;
		`;

		const okBtn = document.createElement('button');
		okBtn.textContent = 'OK';
		okBtn.style.cssText = `
			padding: 10px 30px;
			border: none;
			border-radius: 5px;
			background: #3498db;
			color: white;
			cursor: pointer;
			font-size: 14px;
			transition: all 0.2s;
			font-weight: bold;
		`;
		okBtn.onmouseover = () => okBtn.style.background = '#2980b9';
		okBtn.onmouseout = () => okBtn.style.background = '#3498db';

		// Événements
		okBtn.addEventListener('click', () => {
			document.body.removeChild(overlay);
			if (onOk) onOk();
		});

		// Fermer avec Escape ou Entrée
		const keyHandler = (e) => {
			if (e.key === 'Escape' || e.key === 'Enter') {
				document.body.removeChild(overlay);
				document.removeEventListener('keydown', keyHandler);
				if (onOk) onOk();
			}
		};
		document.addEventListener('keydown', keyHandler);

		// Fermer en cliquant sur l'overlay
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				document.body.removeChild(overlay);
				if (onOk) onOk();
			}
		});

		// Assembler la boîte de dialogue
		button.appendChild(okBtn);
		dialog.appendChild(header);
		dialog.appendChild(content);
		dialog.appendChild(button);
		overlay.appendChild(dialog);

		// Ajouter au DOM
		document.body.appendChild(overlay);

		// Focus sur le bouton OK
		setTimeout(() => okBtn.focus(), 100);
	}
}

// Rendre les fonctions globales pour qu'elles soient accessibles depuis Swift
// Vérification de compatibilité pour les deux environnements (avec/sans AUv3)
if (typeof window !== 'undefined') {
	// Environnement navigateur (pur JS ou AUv3)
	
	// Classes principales
	window.SyncedLyrics = SyncedLyrics;
	window.LyricsDisplay = LyricsDisplay;
	window.LyricsLibrary = LyricsLibrary;
	window.lyricsLibrary = lyricsLibrary;
	
	// Objets utilitaires (refactorisation)
	window.AudioUtils = AudioUtils;
	window.DOMUtils = DOMUtils;
	window.SongUtils = SongUtils;
	window.UIUtils = UIUtils;
	window.AudioController = AudioController;
	
	// Fonctions de transport
	window.updateTimecode = updateTimecode;
	window.displayTransportInfo = displayTransportInfo;
	
	// API de compatibilité (alias vers les objets utilitaires)
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
	window.audioControl = audioControl;
	window.associateAudioToSong = associateAudioToSong;
	window.removeAudioFromSong = removeAudioFromSong;
	
	// Nouvelles fonctions mode record
	window.toggleRecordMode = toggleRecordMode;
	window.getRecordModeState = getRecordModeState;
	window.syncLineToCurrentTimecode = syncLineToCurrentTimecode;
	
	// Fonctions de diagnostic et réparation
	window.debugDeleteButtons = debugDeleteButtons;
	window.repairDeleteButtons = repairDeleteButtons;
	
	// Fonctions d'aide pour les chemins audio (rétrocompatibilité)
	window.normalizeAudioPath = normalizeAudioPath;
	window.createAudioPath = createAudioPath;
	window.getDemoAudioPaths = getDemoAudioPaths;
	window.debugAudioPath = debugAudioPath;
	
	// Debug: Vérifier que les composants principaux sont bien exposés
	console.log('🔧 Composants exposés globalement:');
	console.log('  - Classes:', {
		SyncedLyrics: typeof window.SyncedLyrics,
		LyricsDisplay: typeof window.LyricsDisplay,
		LyricsLibrary: typeof window.LyricsLibrary,
		lyricsLibrary: typeof window.lyricsLibrary
	});
	console.log('  - Objets utilitaires:', {
		AudioUtils: typeof window.AudioUtils,
		DOMUtils: typeof window.DOMUtils,
		SongUtils: typeof window.SongUtils,
		UIUtils: typeof window.UIUtils,
		AudioController: typeof window.AudioController
	});
	console.log('  - API de compatibilité:', {
		loadSongByName: typeof window.loadSongByName,
		audioControl: typeof window.audioControl,
		associateAudioToSong: typeof window.associateAudioToSong
	});
	console.log('  - Mode record:', {
		toggleRecordMode: typeof window.toggleRecordMode,
		getRecordModeState: typeof window.getRecordModeState,
		syncLineToCurrentTimecode: typeof window.syncLineToCurrentTimecode
	});
} else {
	// Environnement Node.js ou autre
	console.log('⚠️ Environnement sans window object détecté');
}

console.log('✅ Lyrix application initialisée avec succès');