function current_platform() {
  try {
    if (typeof window === 'undefined') return 'serveur';
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const lowerUA = ua.toLowerCase();
    const isAppleVendor = /apple/i.test(vendor);
    const touchCapable = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

    const isTrueIOSUA = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ can present itself as Mac; detect via touch + Apple vendor + 'Mac' in UA
    const isIPadDesktopMode = (!isTrueIOSUA && isAppleVendor && touchCapable && /macintosh/i.test(ua));
    const isIOS = isTrueIOSUA || isIPadDesktopMode;

    const isTauri = !!window.__TAURI__ || ua.includes('Tauri');
    if (isTauri) {
      if (/Macintosh|Mac OS X/.test(ua)) return 'Taurie_mac';
      if (/Windows/.test(ua)) return 'Taurie_windows';
      if (/Linux/.test(ua)) return 'Taurie_linux';
      return 'Taurie';
    }

    // AUv3 bridge heuristics (extended)
    let hasAUv3Bridge = false;
  // Fast explicit flag (injected by Swift) or query param (?auv3=1 / ?mode=auv3)
  const explicitAUv3 = !!(window.__AUV3_MODE__ || window.__AUV3__ || (typeof location !== 'undefined' && /[?&](auv3=1|mode=auv3)(?:&|$)/i.test(location.search)));
  if (explicitAUv3 && isIOS) return 'ios_auv3';
    if (isIOS && window.webkit && window.webkit.messageHandlers) {
      try {
        const mh = window.webkit.messageHandlers;
        const names = Object.keys(mh);
        if (names.length) {
          // match typical naming patterns
          const pattern = /(auv3|plug|audio|swift|host|bridge|atome)/i;
          if (names.some(n => pattern.test(n))) hasAUv3Bridge = true;
          // fallback: if running from file:// or embedded context with any handlers
          if (!hasAUv3Bridge && (location.protocol === 'file:' || names.length > 1)) {
            hasAUv3Bridge = true;
          }
        }
      } catch(_) {}
    }
    if (window.forceAUv3Mode === true) hasAUv3Bridge = true;
    if (hasAUv3Bridge) return 'ios_auv3';
    if (isIOS) return 'ios';

    // Distinguish Safari (desktop) from generic desktop Mac
    const isSafari = isAppleVendor && /safari/i.test(ua) && !/chrome|crios|chromium|edg|opr|firefox|fxios|tauri|electron/i.test(lowerUA);

    if (/Macintosh|Mac OS X/.test(ua)) return isSafari ? 'safari_mac' : 'desktop_mac';
    if (/Windows/.test(ua)) return 'desktop_windows';
    if (/Linux/.test(ua)) return 'desktop_linux';

    return 'web';
  } catch (_) {
    return 'inconnu';
  }
}

// expose globally
if (typeof window !== 'undefined') { window.current_platform = current_platform; }


// usage 


$('span', {
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'platform: '
});

// Safe badge update (works even if element not yet created by squirrel at first call)
(function(){
  const updater = () => {
    const g = (typeof grab === 'function') ? grab : (id => document.getElementById(id));
    let el = g('test1');
    if (!el && typeof $ === 'function') {
      el = $('span', { id:'test1', css:{ backgroundColor:'#00f', marginLeft:'0', padding:'10px', color:'white', margin:'10px', display:'inline-block' }, text:'' });
    }
    if (!el) {
      const s = document.createElement('span');
      s.id = 'test1';
      s.style.backgroundColor = '#00f';
      s.style.padding = '10px';
      s.style.color = 'white';
      s.style.margin = '10px';
      s.style.display = 'inline-block';
      document.body.appendChild(s);
      el = s;
    }
    el.textContent = 'platform: ' + current_platform();
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    updater();
  } else {
    document.addEventListener('DOMContentLoaded', updater, { once:true });
  }
  // Refresh once after small delay to catch late AUv3 bridge injection
  setTimeout(() => { try { updater(); } catch(_){} }, 400);
})();