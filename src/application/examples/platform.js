function current_platform() {
  try {
    if (typeof window === 'undefined') return 'serveur';
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isTauri = !!window.__TAURI__ || ua.includes('Tauri');

    if (isTauri) {
      if (/Macintosh|Mac OS X/.test(ua)) return 'Taurie_mac';
      if (/Windows/.test(ua)) return 'Taurie_windows';
      if (/Linux/.test(ua)) return 'Taurie_linux';
      return 'Taurie';
    }

    // AUv3 bridge 
    const hasAUv3Bridge = !!(isIOS && window.webkit && window.webkit.messageHandlers && (
      window.webkit.messageHandlers.auv3 ||
      window.webkit.messageHandlers.auv3Bridge ||
      window.webkit.messageHandlers.bridge ||
      window.webkit.messageHandlers.swift ||
      window.webkit.messageHandlers['atome-bridge']
    ));

    if (hasAUv3Bridge || window.forceAUv3Mode === true) return 'ios_auv3';
    if (isIOS) return 'ios';

    if (/Macintosh|Mac OS X/.test(ua)) return 'desktop_mac';
    if (/Windows/.test(ua)) return 'desktop_windows';
    if (/Linux/.test(ua)) return 'desktop_linux';

    return 'web';
  } catch (_) {
    return 'inconnu';
  }
}


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

grab('test1').textContent = 'platform: ' + current_platform();