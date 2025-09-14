
// ===== Thème =====
const currentTheme = {
  item_size: '39px',
  items_gap: '8px',
  tool_bg: '#484747ff',
  item_shadow: '0 10px 18px rgba(0,0,0,0.35)',
  item_border_radius: '12px',
  direction: 'top_left_horizontal',
  offset_x: '12px',
  offset_y: '10px',
  open_duration: 0.39,
  open_stagger: null,
  bounce: true,
  bounce_strength: 0.75
};

// ===== Utils =====
const pxToNum = (v) => (typeof v === 'string' && v.endsWith('px')) ? parseFloat(v) : (Number(v) || 0);
const numToPx = (n) => Math.round(n) + 'px';
function $(tag, cfg = {}) {
  const e = document.createElement(tag);
  if (cfg.id) e.id = cfg.id;
  if (cfg.class) e.className = cfg.class;
  if (cfg.html) e.innerHTML = cfg.html;
  if (cfg.css) Object.assign(e.style, cfg.css);
  if (cfg.parent) { (typeof cfg.parent === 'string' ? document.querySelector(cfg.parent) : cfg.parent).appendChild(e); }
  return e;
}

function resolveDirection(dir) {
  const vertical = dir.includes('vertical');
  const top = dir.includes('top');
  const left = dir.includes('left');
  return { axis: vertical ? 'column' : 'row', atTop: top, atLeft: left };
}

function setButtonRadii(btn1, btn2, axis, atLeft, atTop, R) {
  btn1.style.borderRadius = R; btn2.style.borderRadius = R;
  if (axis === 'row') {
    if (atLeft) { btn1.style.borderTopRightRadius = '0'; btn1.style.borderBottomRightRadius = '0'; btn2.style.borderTopLeftRadius = '0'; btn2.style.borderBottomLeftRadius = '0'; }
    else { btn1.style.borderTopLeftRadius = '0'; btn1.style.borderBottomLeftRadius = '0'; btn2.style.borderTopRightRadius = '0'; btn2.style.borderBottomRightRadius = '0'; }
  } else {
    if (atTop) { btn1.style.borderBottomLeftRadius = '0'; btn1.style.borderBottomRightRadius = '0'; btn2.style.borderTopLeftRadius = '0'; btn2.style.borderTopRightRadius = '0'; }
    else { btn1.style.borderTopLeftRadius = '0'; btn1.style.borderTopRightRadius = '0'; btn2.style.borderBottomLeftRadius = '0'; btn2.style.borderBottomRightRadius = '0'; }
  }
}

function buildCornerMenu({ parent, itemsCount = 8, theme = currentTheme }) {
  const { axis, atTop, atLeft } = resolveDirection(theme.direction);

  const root = $('div', { id: 'corner-menu-root', parent, css: { position: 'fixed', display: 'flex', flexDirection: axis, alignItems: 'stretch', gap: '0', perspective: '900px', zIndex: 10001, overflow: 'visible' } });
  if (atTop) root.style.top = '0'; else root.style.bottom = '0';
  if (atLeft) root.style.left = '0'; else root.style.right = '0';

  const H = pxToNum(theme.item_size);
  const W1 = (2 / 3) * H, W2 = (1 / 3) * H;
  const width1 = (axis === 'row') ? numToPx(W1) : theme.item_size;
  const width2 = (axis === 'row') ? numToPx(W2) : theme.item_size;
  const height1 = (axis === 'row') ? theme.item_size : numToPx(W1);
  const height2 = (axis === 'row') ? theme.item_size : numToPx(W2);

  const wrapLeft = $('div', { id: 'wrap-left', parent: root, css: { position: 'relative', display: 'flex', overflow: 'visible', flex: '0 0 auto', margin: '0', zIndex: 2 } });
  const wrapMid = $('div', { id: 'wrap-mid', parent: root, css: { position: 'relative', display: 'flex', overflow: 'visible', flex: '0 1 auto', margin: '0', zIndex: 1 } });
  const wrapRight = $('div', { id: 'wrap-right', parent: root, css: { position: 'relative', display: 'flex', overflow: 'visible', flex: '0 0 auto', margin: '0', zIndex: 2 } });

  const btn1 = $('div', { id: 'toolboxLeft', parent: wrapLeft, css: { background: theme.tool_bg, width: width1, height: height1, boxShadow: theme.item_shadow, borderRadius: theme.item_border_radius } });
  const btn2 = $('div', { id: 'toolboxRight', parent: wrapRight, css: { background: theme.tool_bg, width: width2, height: height2, boxShadow: theme.item_shadow, borderRadius: theme.item_border_radius } });

  const middle = $('div', { id: 'panel', parent: wrapMid, class: 'no-scrollbar', css: { overflow: 'hidden', display: 'flex', flexDirection: axis, gap: theme.items_gap, maxWidth: (axis === 'row') ? '0px' : '', maxHeight: (axis === 'column') ? '0px' : '', flex: '0 1 auto', transformStyle: 'preserve-3d' } });
  const items = [];
  for (let i = 0; i < itemsCount; i++) {
    items.push($('div', { parent: middle, class: 'flip-revealed', css: { background: theme.tool_bg, width: theme.item_size, height: theme.item_size, boxShadow: theme.item_shadow, borderRadius: theme.item_border_radius } }));
  }

  // ordre DOM selon coin
  root.innerHTML = '';
  if (axis === 'row') {
    if (atLeft) { root.appendChild(wrapLeft); root.appendChild(wrapMid); root.appendChild(wrapRight); }
    else { root.appendChild(wrapRight); root.appendChild(wrapMid); root.appendChild(wrapLeft); }
  } else {
    if (atTop) { root.appendChild(wrapLeft); root.appendChild(wrapMid); root.appendChild(wrapRight); }
    else { root.appendChild(wrapRight); root.appendChild(wrapMid); root.appendChild(wrapLeft); }
  }

  const ox = theme.offset_x || '0px';
  const oy = theme.offset_y || '0px';
  if (axis === 'row') {
    if (atLeft) wrapLeft.style.marginLeft = ox; else wrapLeft.style.marginRight = ox;
    if (atTop) { wrapLeft.style.marginTop = oy; wrapMid.style.marginTop = oy; wrapRight.style.marginTop = oy; }
    else { wrapLeft.style.marginBottom = oy; wrapMid.style.marginBottom = oy; wrapRight.style.marginBottom = oy; }
  } else {
    if (atTop) wrapLeft.style.marginTop = oy; else wrapLeft.style.marginBottom = oy;
    if (atLeft) { wrapLeft.style.marginLeft = ox; wrapMid.style.marginLeft = ox; wrapRight.style.marginLeft = ox; }
    else { wrapLeft.style.marginRight = ox; wrapMid.style.marginRight = ox; wrapRight.style.marginRight = ox; }
  }

  setButtonRadii(btn1, btn2, axis, atLeft, atTop, theme.item_border_radius);

  // caches anti-ombres
  const mask1 = $('div', { id: 'mask-left', parent: root, css: { position: 'absolute', pointerEvents: 'none', zIndex: 100000, background: theme.tool_bg } });
  const mask2 = $('div', { id: 'mask-right', parent: root, css: { position: 'absolute', pointerEvents: 'none', zIndex: 100000, background: theme.tool_bg } });

  function syncMaskRadii() {
    const R = theme.item_border_radius;
    mask1.style.borderRadius = R; mask2.style.borderRadius = R;
    if (axis === 'row') {
      if (atLeft) { mask1.style.borderTopRightRadius = '0'; mask1.style.borderBottomRightRadius = '0'; mask2.style.borderTopLeftRadius = '0'; mask2.style.borderBottomLeftRadius = '0'; }
      else { mask1.style.borderTopLeftRadius = '0'; mask1.style.borderBottomLeftRadius = '0'; mask2.style.borderTopRightRadius = '0'; mask2.style.borderBottomRightRadius = '0'; }
    } else {
      if (atTop) { mask1.style.borderBottomLeftRadius = '0'; mask1.style.borderBottomRightRadius = '0'; mask2.style.borderTopLeftRadius = '0'; mask2.style.borderTopRightRadius = '0'; }
      else { mask1.style.borderTopLeftRadius = '0'; mask1.style.borderTopRightRadius = '0'; mask2.style.borderBottomLeftRadius = '0'; mask2.style.borderBottomRightRadius = '0'; }
    }
  }
  function rectRel(el) {
    const rr = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height };
  }
  function updateMasks() {
    const a = rectRel(btn1);
    const b = rectRel(btn2);
    Object.assign(mask1.style, { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px' });
    Object.assign(mask2.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    syncMaskRadii();
  }
  function positionMaskOver(el, mask) {
    const r = rectRel(el);
    Object.assign(mask.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  }

  updateMasks();
  window.addEventListener('resize', updateMasks);

  let open = false;

  function openMenu() {
    open = true;

    const startBtn2 = btn2.getBoundingClientRect();

    if (axis === 'row') {
      middle.style.maxWidth = 'calc(100vw - 24px)';
      middle.style.overflowX = 'auto';
      middle.style.overflowY = 'visible';
      middle.style.paddingInline = theme.items_gap;
      middle.style.paddingBlock = '0';
    } else {
      middle.style.maxHeight = 'calc(100vh - 24px)';
      middle.style.overflowY = 'auto';
      middle.style.overflowX = 'visible';
      middle.style.paddingBlock = theme.items_gap;
      middle.style.paddingInline = '0';
    }
    middle.style.flex = '1 1 auto';

    const rotateProp = (axis === 'row') ? 'rotationY' : 'rotationX';
    const origin = (axis === 'row') ? (atLeft ? 'left center' : 'right center') : (atTop ? 'top center' : 'bottom center');
    const od = Math.max(0.01, (theme.open_duration ?? 0.45));
    const st = (theme.open_stagger == null) ? Math.max(0.01, Math.min(0.2, od * 0.25)) : Math.max(0.0, theme.open_stagger);
    items.forEach((it, i) => {
      it.style.transformOrigin = origin;
      const fromVal = (axis === 'row') ? (atLeft ? -90 : 90) : (atTop ? -90 : 90);
      if (window.gsap) {
        gsap.fromTo(it, { [rotateProp]: fromVal }, { [rotateProp]: 0, duration: od, delay: i * st, ease: 'power3.out' });
      } else {
        it.style.transform = (rotateProp === 'rotationY') ? 'rotateY(0deg)' : 'rotateX(0deg)';
      }
    });

    const endBtn2 = btn2.getBoundingClientRect();
    const dx = startBtn2.left - endBtn2.left;
    const dy = startBtn2.top - endBtn2.top;

    updateMasks();

    if (window.gsap && theme.bounce) {
      const easeBtn = `elastic.out(${theme.bounce_strength}, 0.3)`;
      gsap.set([btn2, mask2], { x: dx, y: dy, scale: 0.95, transformOrigin: 'center center' });
      gsap.to([btn2, mask2], { x: 0, y: 0, scale: 1, duration: od, ease: easeBtn });
      gsap.fromTo([btn1, mask1], { scale: 0.95, transformOrigin: 'center center' }, { scale: 1, duration: od, ease: easeBtn });
    }

    if (window.gsap) gsap.delayedCall(od, updateMasks); else updateMasks();
  }

  function closeMenu() {
    open = false;
    const rotateProp = (axis === 'row') ? 'rotationY' : 'rotationX';
    const toVal = (axis === 'row') ? (atLeft ? -90 : 90) : (atTop ? -90 : 90);
    const od = Math.max(0.01, (theme.open_duration ?? 0.45));
    const st = (theme.open_stagger == null) ? Math.max(0.01, Math.min(0.2, od * 0.25)) : Math.max(0.0, theme.open_stagger);

    if (window.gsap) {
      gsap.set([btn1, btn2, mask1, mask2], { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 });

      gsap.to(items, { [rotateProp]: toVal, duration: od, ease: 'power2.in', stagger: { each: st, from: 'end' } });

      const total = od + Math.max(0, (items.length - 1)) * st;
      gsap.delayedCall(total, () => {
        const start2 = btn2.getBoundingClientRect();
        if (axis === 'row') middle.style.maxWidth = '0px'; else middle.style.maxHeight = '0px';
        middle.style.overflow = 'hidden';
        middle.style.paddingInline = '0';
        middle.style.paddingBlock = '0';

        const end2 = btn2.getBoundingClientRect();
        const dx = start2.left - end2.left;
        const dy = start2.top - end2.top;

        positionMaskOver(btn2, mask2);
        positionMaskOver(btn1, mask1);
        syncMaskRadii();

        gsap.set([btn2, mask2], { x: dx, y: dy });
        gsap.to([btn2, mask2], {
          x: 0,
          y: 0,
          duration: od,
          ease: 'power2.in',
          onComplete: () => { positionMaskOver(btn2, mask2); }
        });
      });
    } else {
      if (axis === 'row') middle.style.maxWidth = '0px'; else middle.style.maxHeight = '0px';
      middle.style.overflow = 'hidden';
      middle.style.paddingInline = '0';
      middle.style.paddingBlock = '0';
      updateMasks();
    }
  }

  wrapLeft.addEventListener('click', () => { open ? closeMenu() : openMenu(); });
  wrapRight.addEventListener('click', () => { open ? closeMenu() : openMenu(); });

  return { root, openMenu, closeMenu, middle, btn1, btn2 };
}

