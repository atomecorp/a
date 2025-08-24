// AUv3 Safe App Launcher example
// Important: keep all JS here per project guidelines
(function(){
	'use strict';

	// Helper: log to Xcode if available
	function xlog(msg){
		try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console) {
			window.webkit.messageHandlers.console.postMessage(String(msg));
		} } catch(_) {}
		try { console.log(msg); } catch(_) {}
	}

	// Public helper to open URL via native bridge
	// Returns a Promise<boolean> indicating if the request was sent (not whether target app handled it)
	function openURL(url){
		return new Promise((resolve) => {
			try {
					// Ensure bridge namespace and method exist once
					if (!window.squirrel) window.squirrel = {};
					if (!window.squirrel.openURL) {
						window.squirrel.openURL = function(u){
							try { window.webkit.messageHandlers['squirrel.openURL'].postMessage({ url: String(u || '') }); }
							catch(e) { return false; }
							return true;
						};
					}
					if (typeof window.squirrel.openURL === 'function') {
						const sent = window.squirrel.openURL(String(url || ''));
					xlog('JS openURL sent: ' + url + ' via squirrel.openURL -> ' + sent);
					resolve(!!sent);
				} else {
					xlog('squirrel.openURL not available in this context');
					resolve(false);
				}
			} catch(e){ xlog('openURL error: '+e); resolve(false); }
		});
	}

	// Minimal demo UI: a small fixed button
	function ensureDemoButton(){
		if (document.getElementById('app-launcher-btn')) return;
		const btn = document.createElement('button');
		btn.id = 'app-launcher-btn';
		btn.textContent = 'Open Shortcuts';
		Object.assign(btn.style, {
			position: 'fixed', right: '12px', bottom: '12px', zIndex: 9999,
			padding: '10px 12px', background: '#0a84ff', color: '#fff', border: '0', borderRadius: '10px',
			fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
		});
		btn.addEventListener('click', async () => {
			// Example: run a Shortcut (adjust name/url as needed)
			const url = 'shortcuts://run-shortcut?name=MyFlow';
			const ok = await openURL(url);
			if (!ok) {
				btn.textContent = 'Open failed';
				setTimeout(()=>btn.textContent='Open Shortcuts', 1200);
			}
		});
		document.body.appendChild(btn);
	}

	// Expose helper on window without clobbering existing API
	if (!window.AppLauncher) window.AppLauncher = {};
	window.AppLauncher.openURL = openURL;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', ensureDemoButton);
	} else {
		ensureDemoButton();
	}
})();
