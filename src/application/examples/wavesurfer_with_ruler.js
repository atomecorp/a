/**
 * 🎵 WaveSurfer.js v7.9.5 Examples - Squirrel Framework
 * 
 * Demonstration complète de WaveSurfer.js v7.9.5 avec tous les plugins disponibles
 * Utilise l'API native ES6 modules pour Tauri
 */


// ==========================================
// Example 1: Professional Audio Workstation
// ==========================================

// Créer un conteneur pour le workstation professionnel
const proContainer = document.createElement('div');
proContainer.id = 'pro-workstation-container';
proContainer.style.cssText = `
	position: fixed;
	top: 100px;
	left: 50px;
	width: 1000px;
	height: 250px;
	background: rgba(255,255,255,0.95);
	border-radius: 10px;
	padding: 20px;
	box-shadow: 0 4px 20px rgba(0,0,0,0.2);
	z-index: 1000;
`;

// Ajouter un titre
const title = document.createElement('h3');
title.textContent = '🎵 Professional Audio Workstation - WaveSurfer.js v7.9.5';
title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-family: Arial, sans-serif;';
proContainer.appendChild(title);

// Conteneur pour la waveform
const waveContainer = document.createElement('div');
waveContainer.id = 'waveform-container';
waveContainer.style.cssText = 'width: 100%; height: 120px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px;';
proContainer.appendChild(waveContainer);

// Conteneur pour les contrôles
const controlsContainer = document.createElement('div');
controlsContainer.style.cssText = 'display: flex; gap: 10px; align-items: center;';

const playBtn = document.createElement('button');
playBtn.textContent = '▶️ Play';
playBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #667eea; color: white; cursor: pointer;';

const pauseBtn = document.createElement('button');
pauseBtn.textContent = '⏸️ Pause';
pauseBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #764ba2; color: white; cursor: pointer;';

const stopBtn = document.createElement('button');
stopBtn.textContent = '⏹️ Stop';
stopBtn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 5px; background: #f093fb; color: white; cursor: pointer;';

const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'margin-left: auto; font-family: monospace; color: #666;';

controlsContainer.appendChild(playBtn);
controlsContainer.appendChild(pauseBtn);
controlsContainer.appendChild(stopBtn);
controlsContainer.appendChild(statusDiv);
proContainer.appendChild(controlsContainer);

document.body.appendChild(proContainer);

// Créer l'instance WaveSurfer avec tous les plugins
const professionalWorkstation = WaveSurfer.create({
	container: waveContainer,
	
	// Enhanced waveform styling
	waveColor: '#667eea',
	progressColor: '#764ba2',
	cursorColor: '#f093fb',
	barWidth: 2,
	barRadius: 1,
	height: 120,
	normalize: true,
	
	// Enable plugins
	plugins: [
		RegionsPlugin.create({
			enableDragSelection: true,
			regionLabelFormatter: (region, index) => `Region ${index + 1}`
		}),
		TimelinePlugin.create({
			height: 20,
			timeInterval: 0.2,
			primaryLabelInterval: 5,
			style: {
				fontSize: '10px',
				color: '#666'
			}
		}),
		MinimapPlugin.create({
			height: 30,
			waveColor: '#ddd',
			progressColor: '#999'
		}),
		ZoomPlugin.create({
			scale: 0.5
		}),
		HoverPlugin.create({
			formatTimeCallback: (seconds) => [seconds / 60, seconds % 60].map(v => `0${Math.floor(v)}`.slice(-2)).join(':')
		})
	]
});

// Événements et callbacks
professionalWorkstation.on('ready', () => {
	console.log('🎵 Professional Workstation - Station audio professionnelle prête!');
	statusDiv.textContent = `Ready - Duration: ${Math.floor(professionalWorkstation.getDuration())}s`;
	
	// Ajouter quelques régions d'exemple
	setTimeout(() => {
		// Get regions plugin instance
		const regionsPlugin = professionalWorkstation.getActivePlugins().find(plugin => plugin.constructor.name === 'RegionsPlugin');
		if (regionsPlugin) {
			regionsPlugin.addRegion({
				start: 0,
				end: 10,
				color: 'rgba(255, 0, 0, 0.3)',
				content: 'Intro'
			});
			
			regionsPlugin.addRegion({
				start: 30,
				end: 60,
				color: 'rgba(0, 255, 0, 0.3)',
				content: 'Chorus'
			});
			
			regionsPlugin.addRegion({
				start: 120,
				end: 140,
				color: 'rgba(0, 0, 255, 0.3)',
				content: 'Outro'
			});
		}
	}, 1000);
});

professionalWorkstation.on('play', () => {
	console.log('▶️ Station: Lecture démarrée');
	statusDiv.textContent = 'Playing...';
});

professionalWorkstation.on('pause', () => {
	console.log('⏸️ Station: Lecture en pause');
	statusDiv.textContent = 'Paused';
});

professionalWorkstation.on('timeupdate', (currentTime) => {
	// Update status every second
	if (Math.floor(currentTime) % 1 === 0) {
		statusDiv.textContent = `Playing: ${Math.floor(currentTime)}s / ${Math.floor(professionalWorkstation.getDuration())}s`;
	}
});

// Contrôles
playBtn.onclick = () => professionalWorkstation.play();
pauseBtn.onclick = () => professionalWorkstation.pause();
stopBtn.onclick = () => {
	professionalWorkstation.stop();
	statusDiv.textContent = 'Stopped';
};

// Charger un fichier audio de test
professionalWorkstation.load('./assets/audios/riff.m4a');
