const demoCard = $('div', {
	parent: '#view',
	css: {
		width: 'min(520px, 90vw)',
		padding: '24px',
		borderRadius: '18px',
		backgroundColor: 'rgba(13, 18, 28, 0.9)',
		color: '#f6f6f6',
		fontFamily: 'Inter, system-ui, sans-serif',
		lineHeight: '1.5',
		boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
		border: '1px solid rgba(255, 255, 255, 0.08)',
		margin: '32px auto'
	}
});

$('div', {
	parent: demoCard,
	text: 'Local file loader',
	css: {
		fontSize: '20px',
		fontWeight: '600',
		marginBottom: '6px'
	}
});

$('div', {
	parent: demoCard,
	text: 'Pick any file from your disk and inspect its name, MIME type and contents. The full payload is also exposed on window.lastSelectedLocalFile for scripting.',
	css: {
		fontSize: '13px',
		color: 'rgba(255, 255, 255, 0.75)',
		marginBottom: '16px'
	}
});

const actionsRow = $('div', {
	parent: demoCard,
	css: {
		display: 'flex',
		alignItems: 'center',
		gap: '12px',
		marginBottom: '18px'
	}
});

const fileInput = $('input', {
	parent: demoCard,
	css: { display: 'none' },
	attrs: { type: 'file' },
	onChange: async (event) => {
		const target = event.target;
		const file = target?.files && target.files[0];
		if (!file) return;
		await handleSelectedFile(file);
		target.value = '';
	}
});

Button({
	parent: actionsRow,
	text: 'Choose a file',
	css: {
		padding: '10px 18px',
		borderRadius: '10px',
		border: 'none',
		fontWeight: '600',
		background: 'linear-gradient(120deg, #3f8efc, #9457ff)',
		color: '#fff',
		cursor: 'pointer',
		letterSpacing: '0.3px'
	},
	onClick: () => openFilePicker()
});

$('div', {
	parent: actionsRow,
	text: 'or drop a file directly onto this window.',
	css: {
		fontSize: '12px',
		color: 'rgba(255, 255, 255, 0.65)'
	}
});

const metaPanel = $('div', {
	parent: demoCard,
	css: {
		display: 'grid',
		gridTemplateColumns: 'max-content 1fr',
		rowGap: '6px',
		columnGap: '10px',
		fontSize: '13px',
		padding: '14px 16px',
		backgroundColor: 'rgba(255, 255, 255, 0.03)',
		borderRadius: '12px',
		border: '1px solid rgba(255, 255, 255, 0.08)',
		marginBottom: '16px'
	}
});

const metaNameValue = $('div', { parent: metaPanel, text: 'No file selected', css: { gridColumn: 'span 2', color: 'rgba(255,255,255,0.6)' } });
const metaTypeLabel = $('div', { parent: metaPanel, text: 'Type', css: { color: 'rgba(255,255,255,0.6)' } });
const metaTypeValue = $('div', { parent: metaPanel, text: '-', css: { fontWeight: '500' } });
const metaSizeLabel = $('div', { parent: metaPanel, text: 'Size', css: { color: 'rgba(255,255,255,0.6)' } });
const metaSizeValue = $('div', { parent: metaPanel, text: '-', css: { fontWeight: '500' } });
const metaEncodingLabel = $('div', { parent: metaPanel, text: 'Encoding', css: { color: 'rgba(255,255,255,0.6)' } });
const metaEncodingValue = $('div', { parent: metaPanel, text: '-', css: { fontWeight: '500' } });

$('div', {
	parent: demoCard,
	text: 'Content preview',
	css: {
		fontSize: '12px',
		letterSpacing: '0.12em',
		textTransform: 'uppercase',
		color: 'rgba(255, 255, 255, 0.5)',
		marginBottom: '6px'
	}
});

const contentPreview = $('pre', {
	parent: demoCard,
	text: 'Select a file to display its contents here. Large binary files will be shown as base64.',
	css: {
		minHeight: '180px',
		maxHeight: '320px',
		overflow: 'auto',
		padding: '16px',
		borderRadius: '12px',
		backgroundColor: 'rgba(0, 0, 0, 0.55)',
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
		fontSize: '12px',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word',
		border: '1px solid rgba(255, 255, 255, 0.08)'
	}
});

async function openFilePicker() {
	const hasNativePicker = typeof window.showOpenFilePicker === 'function';
	if (hasNativePicker) {
		try {
			const [handle] = await window.showOpenFilePicker({ multiple: false });
			if (!handle) return;
			const file = await handle.getFile();
			if (file) {
				await handleSelectedFile(file);
				return;
			}
		} catch (err) {
			if (err?.name === 'AbortError') return;
			console.warn('Native picker unavailable, falling back to hidden input.', err);
		}
	}
	fileInput?.click();
}

async function handleSelectedFile(file) {
	metaNameValue.textContent = 'Loading...';
	metaTypeValue.textContent = '-';
	metaSizeValue.textContent = '-';
	metaEncodingValue.textContent = '-';
	contentPreview.textContent = 'Reading file contents...';

	try {
		const payload = await serializeFile(file);
		updatePreview(payload);
		window.lastSelectedLocalFile = payload;
		console.log('Loaded file payload', payload);
	} catch (error) {
		console.error('Failed to read file', error);
		metaNameValue.textContent = 'Error while reading file';
		contentPreview.textContent = String(error?.message || error || 'Unknown error');
	}
}

function shouldReadAsText(file) {
	const mime = (file?.type || '').toLowerCase();
	if (!mime && typeof file?.name === 'string') {
		return /\.(txt|md|json|csv|xml|html?|css|js|ts|lrc)$/i.test(file.name);
	}
	if (mime.startsWith('text/')) return true;
	return ['application/json', 'application/xml', 'application/javascript', 'application/x-javascript', 'application/x-sh'].includes(mime);
}

async function serializeFile(file) {
	if (!file) throw new Error('No file provided');
	const readAsText = shouldReadAsText(file);
	if (readAsText && typeof file.text === 'function') {
		const textContent = await file.text();
		return {
			name: file.name,
			type: file.type || 'text/plain',
			size: file.size,
			encoding: 'utf-8',
			content: textContent
		};
	}

	const buffer = await file.arrayBuffer();
	const base64 = arrayBufferToBase64(buffer);
	return {
		name: file.name,
		type: file.type || 'application/octet-stream',
		size: file.size,
		encoding: 'base64',
		content: base64
	};
}

function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		binary += String.fromCharCode.apply(null, slice);
	}
	return btoa(binary);
}

function formatBytes(bytes) {
	if (!Number.isFinite(bytes)) return 'Unknown';
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / Math.pow(1024, exponent);
	return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function updatePreview(payload) {
	metaNameValue.textContent = payload.name || 'Unnamed file';
	metaTypeValue.textContent = payload.type || 'Unknown';
	metaSizeValue.textContent = formatBytes(payload.size);
	metaEncodingValue.textContent = payload.encoding;

	if (typeof payload.content === 'string' && payload.content.length) {
		const limit = 4000;
		const truncated = payload.content.length > limit;
		const preview = truncated ? `${payload.content.slice(0, limit)}\n... (${payload.content.length - limit} more characters)` : payload.content;
		contentPreview.textContent = preview;
	} else {
		contentPreview.textContent = '(Empty file)';
	}
}

window.handleLocalFileSelection = handleSelectedFile;
