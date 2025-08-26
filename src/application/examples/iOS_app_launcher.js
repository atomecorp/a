


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
      // Prefer Squirrel bridge shared by app and AUv3
      if (window.squirrel?.openURL) {
        window.squirrel.openURL(value);
      } else if (window.webkit?.messageHandlers && window.webkit.messageHandlers['squirrel.openURL']) {
        window.webkit.messageHandlers['squirrel.openURL'].postMessage({ url: value });
      } else if (window.iOS?.openExternalURL) {
        // Legacy fallback if present
        window.iOS.openExternalURL(value);
      } else {
        console.log('Open URL (no native bridge):', value);
      }
    } catch (err) {
      console.error('Open URL failed:', err);
    }
  }
});
