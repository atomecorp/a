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
    onHover,
    showSelectedLabel = true,
    backdropBlur,
    backdropBackground
  } = config || {};

  const placeholderText = placeholder != null ? String(placeholder) : '';

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
  const fontSize = css.fontSize || (themeObj["global-label-font-size"] || themeObj["tool-font-size"] || '10px');
  const baseHeight = css.height || '18px';
  const controlHeight = showSelectedLabel ? baseHeight : '0px';

  const root = $('div', {
    parent: parent,
    id: id,
    css: Object.assign({
      position: 'relative',
      width: css.width || '100%',
      height: controlHeight,
      backgroundColor: bgColor,
      color: labelColor,
      cursor: 'pointer',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      MozUserSelect: 'none'
    }, css)
  });
  if (root && root.dataset) {
    root.dataset.dropdownOpen = 'false';
  }
  if (!showSelectedLabel) {
    try {
      root.style.minHeight = '0px';
      root.style.pointerEvents = 'auto';
      root.style.margin = '0';
      root.style.padding = '0';
    } catch (_) { /* ignore */ }
  }

  const display = $('div', {
    parent: root,
    text: '',
    css: Object.assign({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      lineHeight: controlHeight,
      textAlign: 'center',
      fontFamily,
      fontSize,
      color: labelColor,
      pointerEvents: 'none'
    }, textCss)
  });
  if (!showSelectedLabel && display && display.style) {
    display.style.display = 'none';
  }

  const menu = $('div', {
    parent: root,
    css: Object.assign({
      position: 'absolute',
      left: '0px',
      width: '100%',
      maxHeight: '140px',
      overflowY: 'auto',
      display: 'none',
      zIndex: 10000061,
      backgroundColor: themeObj["tool-bg"] || '#222',
      boxShadow: themeObj["item-shadow"] || '0 2px 6px rgba(0,0,0,0.3)',
      borderRadius: themeObj["item-border-radius"] || '3px'
    }, listCss)
  });

  let isOpen = false;

  const applyBackdrop = (el, { includeBackground = true } = {}) => {
    if (!el || !el.style || !backdropBlur) return;
    if (includeBackground && typeof backdropBackground === 'string' && backdropBackground.trim()) {
      el.style.background = backdropBackground;
    }
    const blurVal = String(backdropBlur).includes('blur(')
      ? backdropBlur
      : `blur(${backdropBlur})`;
    el.style.backdropFilter = blurVal;
    el.style.WebkitBackdropFilter = blurVal;
    el.style.setProperty('backdrop-filter', blurVal);
    el.style.setProperty('-webkit-backdrop-filter', blurVal);
  };

  applyBackdrop(root);
  applyBackdrop(menu);

  const updateDisplayText = () => {
    if (!showSelectedLabel) {
      if (display) {
        display.textContent = '';
        display.innerText = '';
      }
      return;
    }
    const current = opts[selectedIndex];
    const label = showSelectedLabel ? (current ? current.label : placeholderText) : placeholderText;
    display.textContent = label;
    display.innerText = label;
  };

  updateDisplayText();

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
      menu.style.top = controlHeight;
      menu.style.bottom = 'auto';
      menu.style.maxHeight = Math.max(18, Math.floor(below)).toString() + 'px';
    } else {
      menu.style.bottom = controlHeight;
      menu.style.top = 'auto';
      menu.style.maxHeight = Math.max(18, Math.floor(above)).toString() + 'px';
    }

    if (wasHidden) menu.style.display = 'none';
  };

  // Build items
  const items = [];
  let highlightedIndex = selectedIndex;
  let highlightTone = themeObj["tool-bg-active"] || themeObj["tool_bg_active"] || '#444';
  if (typeof highlightTone !== 'string' || !highlightTone.trim()) {
    highlightTone = '#444';
  } else if (highlightTone.toLowerCase().includes('gradient')) {
    highlightTone = '#444';
  }
  const highlightTextColor = themeObj["tool-text-active"] || themeObj["tool_text_active"] || '#ffffff';

  const updateHighlight = () => {
    items.forEach((el, idx) => {
      if (!el) return;
      const isHighlighted = idx === highlightedIndex;
      el.setAttribute('data-highlighted', isHighlighted ? 'true' : 'false');
      if (isHighlighted) {
        el.style.background = highlightTone;
        el.style.backgroundColor = highlightTone;
        el.style.color = highlightTextColor || labelColor;
        el.style.fontWeight = '600';
      } else {
        el.style.background = 'transparent';
        el.style.backgroundColor = 'transparent';
        el.style.color = labelColor;
        el.style.fontWeight = itemCss.fontWeight || 'normal';
      }
    });
  };

  const ensureHighlightVisible = () => {
    const item = items[highlightedIndex];
    if (item && typeof item.scrollIntoView === 'function') {
      try {
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (_) { /* ignore */ }
    }
  };

  const handleKeyDown = (ev) => {
    if (!isOpen) return;
    if (!opts.length) return;
    const key = ev.key;
    const isArrowDown = key === 'ArrowDown';
    const isArrowUp = key === 'ArrowUp';
    if (isArrowDown || isArrowUp) {
      ev.preventDefault();
      const delta = isArrowDown ? 1 : -1;
      highlightedIndex = (highlightedIndex + delta + opts.length) % opts.length;
      updateHighlight();
      ensureHighlightVisible();
      return;
    }
    if (key === 'Home') {
      ev.preventDefault();
      highlightedIndex = 0;
      updateHighlight();
      ensureHighlightVisible();
      return;
    }
    if (key === 'End') {
      ev.preventDefault();
      highlightedIndex = opts.length - 1;
      updateHighlight();
      ensureHighlightVisible();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      commitSelection(highlightedIndex, true);
      return;
    }
    if (key === 'Escape') {
      ev.preventDefault();
      hideMenu();
    }
  };

  // Centralized selection logic
  const commitSelection = (i, userInitiated = true) => {
    if (i < 0 || i >= opts.length) return;
    if (selectedIndex === i && !userInitiated) return; // avoid redundant re-dispatch
    selectedIndex = i;
    const opt = opts[i];
    const label = opt.label;
    const value = opt.value;
    root.value = value;
    root.label = label;
    highlightedIndex = selectedIndex;
    if (isOpen) {
      updateHighlight();
      ensureHighlightVisible();
    }
    // aria selection
    items.forEach((el, idx) => {
      if (!el) return;
      el.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    });
    updateDisplayText();
    // Close menu if user picked it
    if (userInitiated) {
      hideMenu();
    }
    // Fire callback
    if (typeof onChange === 'function') {
      try { onChange(value, label, i); } catch (err) { console.error('dropDown onChange error', err); }
    }
    // Fire DOM event for external listeners
    try {
      root.dispatchEvent(new CustomEvent('change', { detail: { value, label, index: i } }));
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
    applyBackdrop(item, { includeBackground: false });
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', i === selectedIndex ? 'true' : 'false');

    // Hover (desktop)
    item.addEventListener('mouseenter', () => {
      highlightedIndex = i;
      updateHighlight();
      if (typeof onHover === 'function') {
        const opt = opts[i];
        try { onHover(opt.value, opt.label, i); } catch (err) { console.error('dropDown onHover error', err); }
      }
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
  updateHighlight();

  const showMenu = () => {
    if (isOpen) return;
    isOpen = true;
    root.dataset.dropdownOpen = 'true';
    menu.style.display = 'block';
    placeMenu();
    highlightedIndex = selectedIndex;
    updateHighlight();
    ensureHighlightVisible();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);
  };

  const hideMenu = () => {
    if (!isOpen && menu.style.display === 'none') {
      if (root && root.dataset) root.dataset.dropdownOpen = 'false';
      return;
    }
    menu.style.display = 'none';
    if (isOpen) {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    }
    isOpen = false;
    root.dataset.dropdownOpen = 'false';
  };

  const hideMenuAndRemoveListeners = () => {
    menu.style.display = 'none';
    window.removeEventListener('resize', placeMenu);
    window.removeEventListener('scroll', placeMenu, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    isOpen = false;
    root.dataset.dropdownOpen = 'false';
  };

  const toggleMenu = (e) => {
    if (e) e.stopPropagation();
    if (isOpen) hideMenu(); else showMenu();
  };

  root.addEventListener('click', toggleMenu);

  const outsideClose = (ev) => {
    if (!root.contains(ev.target)) {
      hideMenu();
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
  root.openDropDown = () => {
    showMenu();
  };
  root.closeDropDown = () => {
    hideMenu();
  };
  root.toggleDropDown = () => {
    if (isOpen) hideMenu(); else showMenu();
  };
  root.isDropDownOpen = () => isOpen;
  root.destroyDropDown = () => {
    document.removeEventListener('mousedown', outsideClose);
    hideMenuAndRemoveListeners();
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

// Expose globally at module load time (example scripts are not modules)
if (typeof window !== 'undefined') {
  window.dropDown = window.dropDown || dropDown;
}

export default dropDown;