// Minimal keyboard shortcut utility
// Usage:
//   const myFct = function atest(key){ console.log('you press: ' + key); };
//   shortcut('cmd-a', myFct);

(function(){
	const ORDER = ['ctrl','alt','shift','meta'];
	const MOD_SYNONYMS = new Map([
		['cmd','meta'], ['command','meta'], ['win','meta'], ['super','meta'],
		['ctl','ctrl'], ['control','ctrl'],
		['opt','alt'], ['option','alt']
	]);

	const registry = new Map(); // combo -> Set<callback>

	function normToken(tok){
		if (!tok) return '';
		tok = String(tok).trim().toLowerCase();
		if (MOD_SYNONYMS.has(tok)) tok = MOD_SYNONYMS.get(tok);
		// Normalize common key names
		if (tok === 'space' || tok === ' ') tok = 'space';
		if (tok === 'arrowup' || tok === 'up') tok = 'arrowup';
		if (tok === 'arrowdown' || tok === 'down') tok = 'arrowdown';
		if (tok === 'arrowleft' || tok === 'left') tok = 'arrowleft';
		if (tok === 'arrowright' || tok === 'right') tok = 'arrowright';
		return tok;
	}

	function normalizeCombo(input){
		if (!input) return '';
		const rawParts = String(input).split(/[-+]/).map(s => String(s).trim()).filter(Boolean);
		const mods = new Set();
		let key = '';
		let wantsShiftFromUpper = false;
		for (const raw of rawParts) {
			const p = normToken(raw);
			if (ORDER.includes(p)) {
				mods.add(p);
			} else {
				// Preserve intent for uppercase letter by translating to shift+lowercase
				if (/^[A-Z]$/.test(raw)) {
					wantsShiftFromUpper = true;
					key = raw.toLowerCase();
				} else {
					key = p; // last non-mod wins
				}
			}
		}
		if (wantsShiftFromUpper) mods.add('shift');
		const sortedMods = ORDER.filter(m => mods.has(m));
		return [...sortedMods, key].filter(Boolean).join('+');
	}

	function eventToCombo(e){
		// Build mods in canonical ORDER to match normalizeCombo
		const mods = [];
		if (e.ctrlKey) mods.push('ctrl');
		if (e.altKey) mods.push('alt');
		if (e.shiftKey) mods.push('shift');
		if (e.metaKey) mods.push('meta');

		let k = '';
		const code = e.code || '';
		// Prefer physical key for letters/digits so Alt/Option layout changes don't break matching
		if (/^Key[A-Z]$/.test(code)) {
			k = code.slice(3).toLowerCase(); // KeyB -> 'b'
		} else if (/^Digit[0-9]$/.test(code)) {
			k = code.slice(5); // Digit3 -> '3'
		} else {
			k = (e.key || '').toLowerCase();
			if (k === ' ') k = 'space';
			if (/^arrow(Up|Down|Left|Right)$/i.test(e.key)) k = e.key.toLowerCase();
		}

		return [...mods, k].filter(Boolean).join('+');
	}

	function addHandler(){
		if (addHandler._installed) return;
		window.addEventListener('keydown', (e) => {
			const combo = eventToCombo(e);
			const cbs = registry.get(combo);
			if (!cbs || cbs.size === 0) return;
			// Call all callbacks with the normalized combo and the event
			for (const cb of cbs) {
				try { cb(combo, e); } catch(_) {}
			}
		}, true);
		addHandler._installed = true;
	}

	function shortcut(key_cmb, fctToCall){
		const combo = normalizeCombo(key_cmb);
		if (!combo || typeof fctToCall !== 'function') return () => {};
		addHandler();
		let set = registry.get(combo);
		if (!set) { set = new Set(); registry.set(combo, set); }
		set.add(fctToCall);
		// return an unsubscribe function
		return function unsubscribe(){
			const s = registry.get(combo);
			if (!s) return;
			s.delete(fctToCall);
			if (s.size === 0) registry.delete(combo);
		};
	}

	// expose globally
	window.shortcut = shortcut;
})();
