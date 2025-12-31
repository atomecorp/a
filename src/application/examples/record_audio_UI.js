// Record audio UI (icon only)
// Places a clickable record icon at: top 3px, left 600px.

(function () {
	const ICON_ID = 'record-audio-icon';
	const ICON_SRC = './assets/images/icons/record.svg';

	function getIntuitionHost() {
		try {
			return document.getElementById('intuition') || document.getElementById('inutuition');
		} catch (_) {
			return null;
		}
	}

	function waitForIntuitionHost({ maxFrames = 180 } = {}) {
		return new Promise((resolve) => {
			let frames = 0;
			const tick = () => {
				const host = getIntuitionHost();
				if (host) {
					resolve(host);
					return;
				}
				frames += 1;
				if (frames >= maxFrames) {
					resolve(null);
					return;
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
	}

	if (typeof document === 'undefined') return;
	if (document.getElementById(ICON_ID)) return;

	const state = {
		isRecording: false,
		ctrl: null
	};

	(async () => {
		const host = await waitForIntuitionHost();
		if (!host) {
			console.warn('[record_audio_UI] Cannot attach record icon: #intuition not found.');
			return;
		}
		if (document.getElementById(ICON_ID)) return;

		const icon = $('img', {
			id: ICON_ID,
			parent: host,
			attrs: {
				src: ICON_SRC,
				alt: 'Record audio',
				title: 'Record audio'
			},
			css: {
				position: 'absolute',
				top: '3px',
				left: '600px',
				width: '26px',
				height: '26px',
				cursor: 'pointer',
				zIndex: 9999,
				userSelect: 'none',
				pointerEvents: 'auto'
			},
			onclick: async () => {
				try {
					if (typeof window.record_audio !== 'function') {
						console.warn('record_audio() is not available on window. Load record_audio.js first.');
						return;
					}

					if (!state.isRecording) {
						const name = `mic_${Date.now()}.wav`;
						state.ctrl = await window.record_audio(name);
						state.isRecording = true;
						icon.style.opacity = '0.6';
						return;
					}

					if (state.ctrl && typeof state.ctrl.stop === 'function') {
						await state.ctrl.stop();
					}
					state.ctrl = null;
					state.isRecording = false;
					icon.style.opacity = '1';
				} catch (e) {
					console.warn('Record icon action failed:', e && e.message ? e.message : e);
					state.ctrl = null;
					state.isRecording = false;
					try { icon.style.opacity = '1'; } catch (_) { }
				}
			}
		});

		// Ensure consistent initial UI
		try { icon.style.opacity = '1'; } catch (_) { }
	})();
})();
