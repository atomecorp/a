// SVG Showcase & global scaling demo
// Requirements:
// - List all SVGs from icons & logos folders (static array below)
// - Fetch each via dataFetcher then render with render_svg only
// - Provide a global scale control calling setIntuitionMasterScale(value)
// - Cache raw svg text to avoid refetch on re-render
// - Re-render (if desired) should reuse cache (current implementation keeps initial render; scaling is global through framework)

// NOTE: If new SVG files are added, update the arrays below.

const __SVG_ICON_PATHS = [
	'assets/images/icons/high_pass.svg','assets/images/icons/shape.svg','assets/images/icons/open_menu.svg','assets/images/icons/tools.svg','assets/images/icons/target.svg','assets/images/icons/hamburger.svg','assets/images/icons/fullscreen.svg','assets/images/icons/create.svg','assets/images/icons/tool.svg','assets/images/icons/stop.svg','assets/images/icons/record.svg','assets/images/icons/load.svg','assets/images/icons/select-.svg','assets/images/icons/mail_green.svg','assets/images/icons/waveform-.svg','assets/images/icons/wave-saw.svg','assets/images/icons/settings1.svg','assets/images/icons/settings.svg','assets/images/icons/group.svg','assets/images/icons/wave-square-.svg','assets/images/icons/email.svg','assets/images/icons/mail_orange.svg','assets/images/icons/link.svg','assets/images/icons/settings2.svg','assets/images/icons/clear.svg','assets/images/icons/file.svg','assets/images/icons/microphone.svg','assets/images/icons/add.svg','assets/images/icons/waveform.svg','assets/images/icons/settings_old.svg','assets/images/icons/sequence.svg','assets/images/icons/wave-square.svg','assets/images/icons/select-all.svg','assets/images/icons/play2.svg','assets/images/icons/copy.svg','assets/images/icons/atome.svg','assets/images/icons/play.svg','assets/images/icons/select--.svg','assets/images/icons/previous.svg','assets/images/icons/midi_out.svg','assets/images/icons/save.svg','assets/images/icons/band_pass.svg','assets/images/icons/edition.svg','assets/images/icons/wave-sine.svg','assets/images/icons/panel.svg','assets/images/icons/communication.svg','assets/images/icons/color.svg','assets/images/icons/undo2.svg','assets/images/icons/infos.svg','assets/images/icons/filter.svg','assets/images/icons/undo.svg','assets/images/icons/modules.svg','assets/images/icons/edit-.svg','assets/images/icons/activate.svg','assets/images/icons/mail_gray.svg','assets/images/icons/midi_in.svg','assets/images/icons/new.svg','assets/images/icons/validate.svg','assets/images/icons/wave-triangle.svg','assets/images/icons/delete.svg','assets/images/icons/audio.svg','assets/images/icons/select.svg','assets/images/icons/equalizer.svg','assets/images/icons/next.svg','assets/images/icons/edit.svg','assets/images/icons/low_pass.svg','assets/images/icons/paste.svg','assets/images/icons/separator.svg','assets/images/icons/redo.svg','assets/images/icons/Lowpass.svg','assets/images/icons/speaker.svg','assets/images/icons/settingsBad.svg','assets/images/icons/mixer.svg','assets/images/icons/equalizer-.svg','assets/images/icons/folder.svg','assets/images/icons/menu.svg','assets/images/icons/pause.svg','assets/images/icons/module.svg'
];

const __SVG_LOGO_PATHS = [
	'assets/images/logos/TikTok.svg','assets/images/logos/apple.svg','assets/images/logos/tiktok_back.svg','assets/images/logos/Twitter.svg','assets/images/logos/LinkedIn.svg','assets/images/logos/GitHub Black.svg','assets/images/logos/YouTube.svg','assets/images/logos/vie.svg','assets/images/logos/Facebook.svg','assets/images/logos/atome.svg','assets/images/logos/arp.svg','assets/images/logos/arp2.svg','assets/images/logos/LinkedIn-full.svg','assets/images/logos/instagram.svg','assets/images/logos/vimeo.svg','assets/images/logos/freebsd.svg','assets/images/logos/GitHub.svg'
];

// Build a single alphabetically sorted list of all SVG asset paths (case-insensitive by filename)
function __getAllSortedSvgPaths(){
	return [...__SVG_ICON_PATHS, ...__SVG_LOGO_PATHS]
		.sort((a,b)=>{
			const an = a.split('/').pop().toLowerCase();
			const bn = b.split('/').pop().toLowerCase();
			if(an < bn) return -1; if(an > bn) return 1; return 0;
		});
}

// Simple in-memory cache: path -> raw svg text
const svgCache = new Map();
// Base cell size (square) before applying master scale
const __BASE_CELL_SIZE = 140;
let __currentScale = 1;
let __colorOverride = false; // toggles red/green override
let __cellDarkTheme = true; // true: dark cells, false: light cells

function __colorArgs(){
	return __colorOverride ? { fill: 'red', stroke: 'green' } : { fill: null, stroke: null };
}

function __fullRerender(){
	__getAllSortedSvgPaths().forEach(p => {
		const id = 'svg_' + p.replace(/[^a-z0-9_\-]/gi,'_');
		const el = document.getElementById(id);
		if (el && el.parentNode) el.parentNode.removeChild(el);
	});
	while (grid.firstChild) grid.removeChild(grid.firstChild);
	__getAllSortedSvgPaths().forEach(loadAndRender);
	__resizeGridCells();
	__applyThemeToAllCells();
}

// Root container (ensure #view exists already in host app; we build a sub-root)
let showcaseRoot = document.getElementById('svg-showcase-root');
if (!showcaseRoot) {
	showcaseRoot = document.createElement('div');
	showcaseRoot.id = 'svg-showcase-root';
	showcaseRoot.style.padding = '8px';
	showcaseRoot.style.fontFamily = 'sans-serif';
	// Insert at top of body (before other dynamic stuff)
	document.body.appendChild(showcaseRoot);
}

// Control bar
const controls = document.createElement('div');
controls.style.display = 'flex';
controls.style.alignItems = 'center';
controls.style.gap = '8px';
controls.style.marginBottom = '12px';
controls.style.flexWrap = 'wrap';
controls.innerHTML = '<strong>SVG Scale:</strong>';
const scaleInput = document.createElement('input');
scaleInput.type = 'number';
scaleInput.min = '0.1';
scaleInput.step = '0.1';
scaleInput.value = '1';
scaleInput.style.width = '70px';
const applyBtn = document.createElement('button');
applyBtn.textContent = 'Appliquer';
applyBtn.style.cursor = 'pointer';
const toggleColorsBtn = document.createElement('button');
toggleColorsBtn.textContent = 'Couleurs OFF';
toggleColorsBtn.style.cursor = 'pointer';
const toggleCellThemeBtn = document.createElement('button');
toggleCellThemeBtn.textContent = 'Cellules: Noir';
toggleCellThemeBtn.style.cursor = 'pointer';

function __applyScale(){
	const v = parseFloat(scaleInput.value);
	if (!isFinite(v) || v <= 0) { console.warn('[testSVGSize] invalid scale input', scaleInput.value); return; }
	__currentScale = v;
	try { setIntuitionMasterScale(v); } catch(e) { console.warn('setIntuitionMasterScale error', e); }
	if (typeof refreshIntuitionScale === 'function') { try { refreshIntuitionScale(); } catch(e){} }
	__rebuildShowcaseFromCache();
	__resizeGridCells();
}
applyBtn.onclick = __applyScale;
// Allow pressing Enter inside the scale input to trigger apply
scaleInput.addEventListener('keydown', e => { if(e.key === 'Enter'){ __applyScale(); } });
controls.appendChild(scaleInput);
controls.appendChild(applyBtn);
controls.appendChild(toggleColorsBtn);
controls.appendChild(toggleCellThemeBtn);
toggleColorsBtn.onclick = () => {
	__colorOverride = !__colorOverride;
	toggleColorsBtn.textContent = __colorOverride ? 'Couleurs ON' : 'Couleurs OFF';
	__fullRerender();
};
toggleCellThemeBtn.onclick = () => {
	__cellDarkTheme = !__cellDarkTheme;
	toggleCellThemeBtn.textContent = 'Cellules: ' + (__cellDarkTheme ? 'Noir' : 'Blanc');
	__applyThemeToAllCells();
};
showcaseRoot.appendChild(controls);

// Grid container
const grid = document.createElement('div');
grid.style.display = 'grid';
grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
grid.style.gap = '12px';
grid.style.alignItems = 'start';
grid.style.borderTop = '1px solid #444';
grid.style.paddingTop = '10px';
showcaseRoot.appendChild(grid);

// Ensure a view container exists for render_svg parent usage
let viewEl = document.getElementById('view');
if (!viewEl) {
	viewEl = document.createElement('div');
	viewEl.id = 'view';
	document.body.appendChild(viewEl);
}
// Ensure the storage view is off-screen but still renderable for measurements
viewEl.style.position = 'absolute';
viewEl.style.top = '-10000px';
viewEl.style.left = '-10000px';
viewEl.style.width = '0px';
viewEl.style.height = '0px';
viewEl.style.overflow = 'hidden';
viewEl.style.pointerEvents = 'none';

// Helper to create a cell wrapper
function createCell(title) {
	const cell = document.createElement('div');
	cell.style.borderRadius = '6px';
	cell.style.padding = '6px 4px 8px';
	// theme applied after sizing
	cell.style.fontSize = '11px';
	cell.style.display = 'flex';
	cell.style.flexDirection = 'column';
	cell.style.alignItems = 'center';
	cell.style.justifyContent = 'flex-start';
	cell.style.position = 'relative';
	const label = document.createElement('div');
	label.textContent = title;
	label.style.marginBottom = '4px';
	label.style.textAlign = 'center';
	label.style.whiteSpace = 'nowrap';
	label.style.overflow = 'hidden';
	label.style.textOverflow = 'ellipsis';
	label.style.width = '100%';
	cell.appendChild(label);
	cell.setAttribute('data-svg-cell','1');
	// placeholder area for actual rendered svg (tracked by id + clone)
	cell.style.width = __BASE_CELL_SIZE + 'px';
	cell.style.height = __BASE_CELL_SIZE + 'px';
	__applyCellTheme(cell);
	return cell;
}

function __applyCellTheme(cell){
	if (!cell) return;
	if (__cellDarkTheme) {
		cell.style.background = '#111';
		cell.style.color = '#ddd';
		cell.style.border = '1px solid #333';
	} else {
		cell.style.background = '#fff';
		cell.style.color = '#000';
		cell.style.border = '1px solid #ccc';
	}
}

function __applyThemeToAllCells(){
	const cells = grid.querySelectorAll('[data-svg-cell="1"]');
	cells.forEach(c => __applyCellTheme(c));
}

// Render one SVG (fetch if needed, then render_svg)
function loadAndRender(path) {
	const baseName = path.split('/').pop();
	// Use full path for uniqueness (icon vs logo may share same filename)
	const id = 'svg_' + path.replace(/[^a-z0-9_\-]/gi,'_');
	const cell = createCell(baseName);
	grid.appendChild(cell);
	const cached = svgCache.get(path);
	const clr = __colorArgs();
	if (cached) {
		render_svg(cached, id, 'view', '0px', '0px', '120px', '120px', clr.fill, clr.stroke);
		attachClone(id, cell);
		return;
	}
	dataFetcher(path, { mode: 'text' })
		.then(svgData => {
			svgCache.set(path, svgData);
			render_svg(svgData, id, 'view', '0px', '0px', '120px', '120px', clr.fill, clr.stroke);
			attachClone(id, cell);
		})
		.catch(err => {
			const errDiv = document.createElement('div');
			errDiv.textContent = 'Erreur de chargement';
			errDiv.style.color = '#e66';
			errDiv.style.fontSize = '10px';
			cell.appendChild(errDiv);
			console.warn('Failed to load', path, err);
		});
}

// Attach a cloned visible copy inside the cell while keeping original in hidden #view for layout isolation

function attachClone(origId, cell) {
	const orig = document.getElementById(origId);
	if (!orig) return;
	// Clone node to display it inside the grid cell (avoid absolute coords collision)
	const clone = orig.cloneNode(true);
	// Reset positioning for clone
	clone.style.position = 'static';
	clone.style.top = '';
	clone.style.left = '';
	clone.style.margin = '0';
	// Let master scale drive internal metrics; clone just fills its cell
	clone.style.width = '100%';
	clone.style.height = '100%';
	clone.style.maxWidth = '100%';
	clone.style.maxHeight = '100%';
	// Ensure clone is visible even if original was temporarily hidden during render pipeline
	try {
		clone.style.visibility = 'visible';
		clone.removeAttribute('visibility');
	} catch(e) {}
		cell.appendChild(clone);
		// Hide / move off-screen the original (we keep it for potential future metrics)
		orig.style.position = 'absolute';
		orig.style.top = '-999999px';
		orig.style.left = '-999999px';
		orig.style.visibility = 'hidden';
}

// Kickoff loading for all icons & logos (alphabetical)
__getAllSortedSvgPaths().forEach(loadAndRender);

// Optional: expose a manual refresh that re-clones from cache if needed
function __rebuildShowcaseFromCache(){
	while (grid.firstChild) grid.removeChild(grid.firstChild);
	__getAllSortedSvgPaths().forEach(p => {
		const cached = svgCache.get(p);
		const baseName = p.split('/').pop();
		const id = 'svg_' + p.replace(/[^a-z0-9_\-]/gi,'_');
		const cell = createCell(baseName);
		grid.appendChild(cell);
		if (cached) {
			const clr = __colorArgs();
			if (!document.getElementById(id)) {
				render_svg(cached, id, 'view', '0px', '0px', '120px', '120px', clr.fill, clr.stroke);
			}
			attachClone(id, cell);
		} else {
			loadAndRender(p);
		}
	});
}

window.__refreshSVGShowcase = __rebuildShowcaseFromCache;

// Log helper

function __resizeGridCells(){
	const cells = grid.querySelectorAll('[data-svg-cell="1"]');
	const side = Math.round(__BASE_CELL_SIZE * __currentScale);
	cells.forEach(c => { c.style.width = side + 'px'; c.style.height = side + 'px'; });
	// Keep strict homothety: remove previous capping at 260px
	grid.style.gridTemplateColumns = `repeat(auto-fill, ${side}px)`;
	grid.style.gridAutoRows = side + 'px';
}

__resizeGridCells();
