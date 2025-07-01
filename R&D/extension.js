export function applyExtensions(component) {
  const interactions = component.props?.interactions;
  if (!interactions) return;
  const el = component.element;

  if (interactions.drag && interactions.drag.enabled) {
    setupDrag(el, interactions.drag, component);
  }
  if (interactions.touch) {
    setupTouch(el, interactions.touch, component);
  }
  if (interactions.hover) {
    setupHover(el, interactions.hover, component);
  }
  if (interactions.click) {
    setupClick(el, interactions.click, component);
  }
}

function runActions(actions, event, data, el, component) {
  if (!Array.isArray(actions)) return;
  actions.forEach(code => {
    const fn = new Function('el', 'event', 'data', 'component', code);
    try {
      fn(el, event, data, component);
    } catch (e) {
      console.error('extension action error', e);
    }
  });
}

function setupDrag(el, config, component) {
  let data = {};

  const start = (e) => {
    e.preventDefault();
    data.dragging = true;
    runActions(config.onDragStart, e, data, el, component);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
  };

  const move = (e) => {
    if (!data.dragging) return;
    runActions(config.onDragMove, e, data, el, component);
  };

  const end = (e) => {
    if (!data.dragging) return;
    runActions(config.onDragEnd, e, data, el, component);
    data = {};
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', end);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
  };

  el.addEventListener('mousedown', start);
  el.addEventListener('touchstart', start, { passive: false });
}

function setupTouch(el, cfg, component) {
  let longPressTimer;
  if (cfg.down) {
    el.addEventListener('touchstart', e => {
      longPressTimer = setTimeout(() => {
        if (cfg.longpress && typeof component[cfg.longpress] === 'function') {
          component[cfg.longpress](e);
        }
      }, 600);
      if (typeof component[cfg.down] === 'function') {
        component[cfg.down](e);
      }
    }, { passive: false });
  }
  if (cfg.up) {
    el.addEventListener('touchend', e => {
      clearTimeout(longPressTimer);
      if (typeof component[cfg.up] === 'function') {
        component[cfg.up](e);
      }
    });
  }
}

function setupHover(el, cfg, component) {
  if (cfg.enter) {
    el.addEventListener('mouseenter', e => component[cfg.enter]?.(e));
  }
  if (cfg.leave) {
    el.addEventListener('mouseleave', e => component[cfg.leave]?.(e));
  }
  if (cfg.move) {
    el.addEventListener('mousemove', e => component[cfg.move]?.(e));
  }
}

function setupClick(el, cfg, component) {
  if (cfg.tap) {
    el.addEventListener('click', e => component[cfg.tap]?.(e));
  }
}
