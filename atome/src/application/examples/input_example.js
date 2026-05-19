


// === EXEMPLE 2: Champ de saisie (Input) + bouton « Open » (Squirrel syntax) ===
let urlToLaunch = 'shortcuts://run-shortcut?name=MyFlow';

const inputRow = $('div', {
  parent: '#view',
  css: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '14px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: '8px',
    borderRadius: '8px'
  }
});

$('div', {
  parent: inputRow,
  text: 'URL:',
  css: {
    color: '#eee',
    fontSize: '12px',
    minWidth: '34px'
  }
});

const urlInput = $('input', {
  parent: inputRow,
  attrs: { type: 'text', value: urlToLaunch, placeholder: 'Enter URL scheme (ex: shortcuts://...)' },
  css: {
    flex: '1',
    height: '28px',
    lineHeight: '28px',
    padding: '0 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.25)',
    backgroundColor: '#1e232a',
    color: '#fff',
    outline: 'none'
  },
  onInput: (e) => {
    urlToLaunch = e.target.value || '';
  }
});

Button({
  text: 'Open',
  parent: inputRow,
  css: {
    height: '28px',
    padding: '0 12px',
    backgroundColor: '#27986a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  onClick: () => {
    const value = (urlToLaunch || '').trim();
    if (!value) { console.warn('No URL provided'); return; }
    try {
      // If a native bridge exists, use it; otherwise log for demo purposes.
      if (window.iOS?.openExternalURL) {
        window.iOS.openExternalURL(value);
      } else if (window.webkit?.messageHandlers?.ios?.postMessage) {
        window.webkit.messageHandlers.ios.postMessage({ type: 'openURL', url: value });
      } else {
        console.log('Open URL (demo):', value);
      }
    } catch (err) {
      console.error('Open URL failed:', err);
    }
  }
});
