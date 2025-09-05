// =============================
// Custom DropDown Component (UI-controlled)
// =============================


function dropDown(config) {
  const {
    parent,
    id,
    options = [],
    value,
    theme = 'light',
    placeholder = '',
  openDirection = 'up', // 'up' | 'down' (will auto-flip if no space)
    css = {},
    listCss = {},
    itemCss = {},
    textCss = {},
  onChange,
  onHover
  } = config || {};

  // Normalize options to { label, value }
  const opts = options.map((opt) => {
    if (opt && typeof opt === 'object') {
      const v = (opt.value ?? opt.label ?? String(opt));
      return { label: (opt.label ?? String(v)), value: String(v) };
    }
    return { label: String(opt), value: String(opt) };
  });

  let selectedIndex = 0;
  if (value !== undefined && value !== null) {
    const idx = opts.findIndex((o) => o.value === String(value));
    if (idx >= 0) selectedIndex = idx;
  }

  // Theme lookups are evaluated at runtime (available later in file)
  const themeObj = (typeof Inntuition_theme !== 'undefined' && Inntuition_theme[theme]) ? Inntuition_theme[theme] : {};
  const labelColor = themeObj["tool-text"] || css.color || '#cccccc';
  const bgColor = css.backgroundColor !== undefined ? css.backgroundColor : 'transparent';
  const fontFamily = css.fontFamily || 'Roboto';
  const fontSize = css.fontSize || (themeObj["tool-font-size"] || '10px');
  const height = css.height || '18px';

  const root = $('div', {
    parent: parent,
    id: id,
    css: Object.assign({
      position: 'relative',
      width: css.width || '100%',
      height: height,
      backgroundColor: bgColor,
      color: labelColor,
      cursor: 'pointer',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      MozUserSelect: 'none'
    }, css)
  });

  const display = $('div', {
    parent: root,
    text: (opts[selectedIndex] ? opts[selectedIndex].label : placeholder),
    css: Object.assign({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      lineHeight: height,
      textAlign: 'center',
      fontFamily,
      fontSize,
      color: labelColor,
      pointerEvents: 'none'
    }, textCss)
  });

  const menu = $('div', {
    parent: root,
    css: Object.assign({
      position: 'absolute',
      left: '0px',
      width: '100%',
      maxHeight: '140px',
      overflowY: 'auto',
      display: 'none',
      zIndex: 1000,
      backgroundColor: themeObj["tool-bg"] || '#222',
      boxShadow: themeObj["item-shadow"] || '0 2px 6px rgba(0,0,0,0.3)',
      borderRadius: themeObj["item-border-radius"] || '3px'
    }, listCss)
  });

  // Dynamic placement to avoid leaving the viewport
  const placeMenu = () => {
    // Show temporarily to measure
    const wasHidden = (menu.style.display === 'none');
    if (wasHidden) menu.style.display = 'block';

    const rect = root.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const margin = 6;
    const above = rect.top - margin;
    const below = (vh - rect.bottom) - margin;
    const contentH = menu.scrollHeight;
    let dir = openDirection; // requested direction

    // Flip if requested direction lacks space
    if (dir === 'up' && above < Math.min(contentH, 100) && below > above) dir = 'down';
    if (dir === 'down' && below < Math.min(contentH, 100) && above > below) dir = 'up';

    // Apply placement
    if (dir === 'down') {
      menu.style.top = height;
      menu.style.bottom = 'auto';
      menu.style.maxHeight = Math.max(18, Math.floor(below)).toString() + 'px';
    } else {
      menu.style.bottom = height;
      menu.style.top = 'auto';
      menu.style.maxHeight = Math.max(18, Math.floor(above)).toString() + 'px';
    }

    if (wasHidden) menu.style.display = 'none';
  };

  // Build items
  const items = [];

  // Centralized selection logic
  const commitSelection = (i, userInitiated = true) => {
    if (i < 0 || i >= opts.length) return;
    if (selectedIndex === i && !userInitiated) return; // avoid redundant re-dispatch
    selectedIndex = i;
    const opt = opts[i];
    const label = opt.label;
    const value = opt.value;
    // Update display text robustly (some webviews are picky)
    display.textContent = label;
    display.innerText = label;
    root.value = value;
    root.label = label;
    // aria selection
    items.forEach((el, idx) => {
      if (!el) return;
      el.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    });
    // Close menu if user picked it
    if (userInitiated) {
      menu.style.display = 'none';
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    }
    // Fire callback
    if (typeof onChange === 'function') {
      try { onChange(value, label, i); } catch (err) { console.error('dropDown onChange error', err); }
    }
    // Fire DOM event for external listeners
    try {
      root.dispatchEvent(new CustomEvent('change', { detail: { value, label, index: i }}));
    } catch (err) {
      // Some very old environments may lack CustomEvent constructor (unlikely here)
    }
  };

  opts.forEach((o, i) => {
    const item = $('div', {
      parent: menu,
      text: o.label,
      css: Object.assign({
        padding: '2px 6px',
        lineHeight: '18px',
        fontFamily,
        fontSize,
        color: labelColor,
        textAlign: 'center',
        cursor: 'pointer'
      }, itemCss)
    });
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', i === selectedIndex ? 'true' : 'false');

    // Hover (desktop)
    item.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.backgroundColor = themeObj["tool-bg-active"] || '#444';
      if (typeof onHover === 'function') {
        const opt = opts[i];
        try { onHover(opt.value, opt.label, i); } catch(err){ console.error('dropDown onHover error', err); }
      }
    });
    item.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
    });

    // Selection handlers: pointer > touch > click fallbacks
    const selectHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      commitSelection(i, true);
    };

    if (window.PointerEvent) {
      item.addEventListener('pointerdown', selectHandler, { passive: false });
    } else {
      // Touch first for iOS/WKWebView reliability
      item.addEventListener('touchstart', selectHandler, { passive: false });
      item.addEventListener('mousedown', selectHandler); // desktop fallback
    }
    // Ensure click also works (some browsers synthesize click after touchstart; commitSelection guards redundant events)
    item.addEventListener('click', selectHandler);

    items.push(item);
  });

  const toggleMenu = (e) => {
    e.stopPropagation();
    const showing = menu.style.display !== 'none';
    if (showing) {
      menu.style.display = 'none';
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    } else {
      menu.style.display = 'block';
      placeMenu();
      window.addEventListener('resize', placeMenu);
      window.addEventListener('scroll', placeMenu, true);
    }
  };

  root.addEventListener('click', toggleMenu);

  const outsideClose = (ev) => {
    if (!root.contains(ev.target)) {
      menu.style.display = 'none';
  window.removeEventListener('resize', placeMenu);
  window.removeEventListener('scroll', placeMenu, true);
    }
  };
  document.addEventListener('mousedown', outsideClose);

  // Public API
  root.getValue = () => opts[selectedIndex] ? opts[selectedIndex].value : undefined;
  root.getLabel = () => opts[selectedIndex] ? opts[selectedIndex].label : undefined;
  root.setValue = (val) => {
    const idx = opts.findIndex((o) => o.value === String(val));
    if (idx >= 0) {
      // userInitiated = false to avoid closing menu (if open) & avoid double-callback if same index
      commitSelection(idx, false);
    }
  };
  root.destroyDropDown = () => {
    document.removeEventListener('mousedown', outsideClose);
  window.removeEventListener('resize', placeMenu);
  window.removeEventListener('scroll', placeMenu, true);
  };

  // Initialize public data
  root.value = opts[selectedIndex] ? opts[selectedIndex].value : undefined;
  root.label = opts[selectedIndex] ? opts[selectedIndex].label : undefined;

  // Expose globally for convenience
  if (typeof window !== 'undefined') {
    window.dropDown = window.dropDown || dropDown;
  }

  return root;
}

export default dropDown;