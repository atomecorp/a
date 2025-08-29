// iPlug2 Web integration (Squirrel UI, no HTML)
// Auto-creates a small control panel (gain/play/position) and sends JSON commands.

export function initIPlugWeb(opts = {}) {
  const send = (msg) => {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.squirrel) {
        window.webkit.messageHandlers.squirrel.postMessage(msg);
        return;
      }
      if (window.AtomeDSP && typeof window.AtomeDSP.setParam === 'function') {
        if (msg && msg.type === 'param') {
          const idMap = { gain: 0, play: 1, position: 2 };
          window.AtomeDSP.setParam(idMap[msg.id] ?? 0, Number(msg.value) || 0);
        }
        return;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
        return;
      }
      window.postMessage(msg, '*');
    } catch(e) { console.error('iplug send error', e); }
  };

  const start = () => {
    if (document.getElementById('iplug-web-panel')) return;
    const parent = opts.parent || document.body;

    const panel = $('div', {
      id: 'iplug-web-panel',
      css: {
        backgroundColor: '#111', color: '#eee', padding: '10px', margin: '10px',
        display: 'inline-block', fontFamily: 'monospace', borderRadius: '6px'
      },
      text: 'iPlug2 Web Controls'
    });

    const row1 = $('div', { css: { marginTop: '8px' }, parent });
    const playBtn = $('button', {
      text: 'Play',
      css: { padding: '6px 12px', cursor: 'pointer', marginRight: '10px' },
      parent: row1,
      onclick: () => {
        const playing = playBtn._playing = !playBtn._playing;
        playBtn.textContent = playing ? 'Stop' : 'Play';
        send({ type: 'param', id: 'play', value: playing ? 1 : 0 });
      }
    });

    const row2 = $('div', { css: { marginTop: '8px' }, parent });
    $('span', { text: 'Gain', css: { marginRight: '8px' }, parent: row2 });
    $('input', {
      type: 'range', min: '0', max: '2', step: '0.01', value: '1',
      css: { width: '220px', verticalAlign: 'middle' }, parent: row2,
      oninput: (e) => send({ type: 'param', id: 'gain', value: Number(e.target.value) })
    });

    const row3 = $('div', { css: { marginTop: '8px' }, parent });
    $('span', { text: 'Position', css: { marginRight: '8px' }, parent: row3 });
    $('input', {
      type: 'range', min: '0', max: '1000000', step: '256', value: '0',
      css: { width: '300px', verticalAlign: 'middle' }, parent: row3,
      oninput: (e) => send({ type: 'param', id: 'position', value: Number(e.target.value) })
    });

    // Meter listener (native can dispatch)
    const meter = $('div', { css: { marginTop: '8px' }, parent, text: 'meter: -- dB' });
    window.addEventListener('meter', (ev) => {
      const d = ev.detail || {}; meter.textContent = `meter: ${d.level ?? '--'} dB`;
    });
  };

  // Start when Squirrel is ready
  if (typeof window !== 'undefined') {
    const handler = () => { start(); window.removeEventListener('squirrel:ready', handler); };
    window.addEventListener('squirrel:ready', handler);
  }
}

export default initIPlugWeb;