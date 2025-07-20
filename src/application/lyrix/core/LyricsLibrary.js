import { SyncedLyrics } from './SyncedLyrics.js';
import { STORAGE_KEYS } from '../config/constants.js';

export class LyricsLibrary {
	constructor() {
		this.storagePrefix = 'lyrics_';
		this.settingsKey = STORAGE_KEYS.LIBRARY_SETTINGS;
		this.songListKey = STORAGE_KEYS.SONG_LIST;
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

	// Rechercher des chansons par titre/artiste
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
		console.log('🗑️ Suppression chanson:', songId);
		const storageKey = this.storagePrefix + songId;
		
		try {
			const existingSong = localStorage.getItem(storageKey);
			if (!existingSong) {
				console.warn('⚠️ Chanson non trouvée:', songId);
				return false;
			}
			
			// Supprimer de localStorage
			localStorage.removeItem(storageKey);
			
			// Supprimer des chansons intégrées si applicable
			if (this.builtInSongs.has(songId)) {
				this.builtInSongs.delete(songId);
			}
			
			// Sauvegarder les paramètres
			this.saveSettings();
			this.saveSongList();
			
			console.log('✅ Chanson supprimée:', songId);
			return true;
		} catch (error) {
			console.error('❌ Erreur de suppression:', error);
			return false;
		}
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
		const existingSongs = this.getAllSongs();
		const darkboxExists = existingSongs.some(song => 
			song.title === "The Darkbox" && song.artist === "Atome Artist"
		);
		const digitalExists = existingSongs.some(song => 
			song.title === "Digital Dreams" && song.artist === "Cyber Collective"
		);
		
		if (darkboxExists && digitalExists) {
			console.log('📚 Chansons de démo déjà présentes');
			return null;
		}
		
		console.log('🎵 Création des chansons de démonstration...');
		
		let darkboxSong = null;
		let digitalDreamsSong = null;
		
		if (!darkboxExists) {
			darkboxSong = this.createDemoSong({
				title: "The Darkbox",
				artist: "Atome Artist", 
				album: "Demo Album",
				audioFile: "darkbox.mp3",
				lyrics: [
					{ time: 0, text: "Spread the words", type: "vocal" },
					{ time: 2000, text: "That'll burn your mind", type: "vocal" },
					{ time: 4000, text: "Seal your eyes", type: "vocal" },
					{ time: 6000, text: "Shut your ears", type: "vocal" },
					{ time: 8000, text: "Swallow this and dive inside", type: "vocal" },
					{ time: 16000, text: "The darkbox...", type: "chorus" },
					{ time: 20000, text: "Do you wanna be scared", type: "vocal" },
					{ time: 22000, text: "No real fun won't begin", type: "vocal" },
					{ time: 38000, text: "The darkbox", type: "chorus" }
				]
			});
		}
		
		if (!digitalExists) {
			digitalDreamsSong = this.createDemoSong({
				title: "Digital Dreams",
				artist: "Cyber Collective",
				album: "Electronic Visions", 
				audioFile: "digital_dreams.mp3",
				lyrics: [
					{ time: 0, text: "In the neon lights we find", type: "vocal" },
					{ time: 3000, text: "Digital dreams of a different kind", type: "vocal" },
					{ time: 6000, text: "Circuits dancing in the night", type: "vocal" },
					{ time: 15000, text: "Download my heart", type: "chorus" },
					{ time: 18000, text: "Upload your soul", type: "chorus" }
				]
			});
		}
		
		console.log('✅ Chansons de démo créées');
		return { darkboxSong, digitalDreamsSong };
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
		}
		
		return cleaned;
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

	// Vérifier si une chanson est intégrée
	isBuiltInSong(songId) {
		return this.builtInSongs.has(songId);
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
