


// === EXEMPLE 2: Champ de saisie (Input) + bouton « Open » (Squirrel syntax) ===
let urlToLaunch = 'shortcuts://run-shortcut?name=Shazam';

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

// Status pill
const statusRow = $('div', {
  parent: '#view',
  css: {
    marginTop: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#cfd8dc',
    fontSize: '12px'
  },
  text: 'Ready'
});

function setStatus(msg, color) {
  statusRow.textContent = msg;
  statusRow.style.color = color || '#cfd8dc';
}

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
        // In AUv3, the host may block activation; the request is queued for the container app.
        const inAUv3 = typeof __HOST_ENV !== 'undefined';
        if (inAUv3) {
          setStatus('Request queued. Switch to the Atome app to finish. You will see a confirmation to open the target app.', '#ffd54f');
        } else {
          setStatus('Open request sent. If the target needs confirmation, a prompt will appear.', '#c5e1a5');
        }
      } else if (window.webkit?.messageHandlers && window.webkit.messageHandlers['squirrel.openURL']) {
        window.webkit.messageHandlers['squirrel.openURL'].postMessage({ url: value });
        setStatus('Request sent via WebKit handler.', '#c5e1a5');
      } else if (window.iOS?.openExternalURL) {
        // Legacy fallback if present
        window.iOS.openExternalURL(value);
        setStatus('Legacy bridge used to send request.', '#c5e1a5');
      } else {
        console.log('Open URL (no native bridge):', value);
        setStatus('No native bridge available in this environment.', '#ef9a9a');
      }
    } catch (err) {
      console.error('Open URL failed:', err);
      setStatus('Open failed: ' + (err?.message || err), '#ef9a9a');
    }
  }
});

// Extra helpers row
const helpersRow = $('div', {
  parent: '#view',
  css: { display: 'flex', gap: '8px', marginTop: '8px' }
});

Button({
  text: 'Copy URL',
  parent: helpersRow,
  css: {
    height: '26px',
    padding: '0 10px',
    backgroundColor: '#3949ab',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  onClick: async () => {
    const value = (urlToLaunch || '').trim();
    if (!value) { setStatus('Nothing to copy.', '#ef9a9a'); return; }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      setStatus('URL copied to clipboard.', '#c5e1a5');
    } catch (e) {
      setStatus('Copy failed: ' + (e?.message || e), '#ef9a9a');
    }
  }
});

Button({
  text: 'Why no direct open in AUv3?',
  parent: helpersRow,
  css: {
    height: '26px',
    padding: '0 10px',
    backgroundColor: '#546e7a',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  onClick: () => {
    setStatus('Host apps can block activation from extensions. We queue the request and the Atome app completes it once foregrounded.', '#ffd54f');
  }
});
