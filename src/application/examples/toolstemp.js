
// ===== Thème =====
const currentTheme = {
  item_size: '69px',
  items_gap: '8px',
  toolBox_bg: '#484747ff',
  tool_bg: '#8a2727ff',
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

// Compute a safe padding from a CSS box-shadow string to avoid clipping at scroll edges
function shadowSafePad(shadow) {
  if (typeof shadow !== 'string') return 16;
  // extract px numbers (offset-x, offset-y, blur, spread)
  const m = shadow.match(/-?\d+(?:\.\d+)?px/g);
  if (!m) return 16;
  const nums = m.map(s => Math.abs(parseFloat(s)));
  const blur = nums[2] ?? 12;   // typical order: x, y, blur, spread
  const spread = nums[3] ?? 0;
  // add a tiny safety margin
  return Math.ceil(Math.max(12, blur + spread + 4));
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

function buildCornerMenu({ parent = '#intuition', itemsCount = 8, theme = currentTheme }) {
  const { axis, atTop, atLeft } = resolveDirection(theme.direction);

  const root = $('div', {
    id: 'menuRoot',
    parent,
    css: {
      position: 'fixed',
      display: 'flex',
      flexDirection: axis,
      alignItems: 'stretch',
      gap: '0',
      perspective: '900px',
      zIndex: 10001,
      overflow: 'visible'
    }
  });
  if (atTop) root.style.top = '0'; else root.style.bottom = '0';
  if (atLeft) root.style.left = '0'; else root.style.right = '0';

  const H = pxToNum(theme.item_size);
  const W1 = (2 / 3) * H, W2 = (1 / 3) * H;
  const width1 = (axis === 'row') ? numToPx(W1) : theme.item_size;
  const width2 = (axis === 'row') ? numToPx(W2) : theme.item_size;
  const height1 = (axis === 'row') ? theme.item_size : numToPx(W1);
  const height2 = (axis === 'row') ? theme.item_size : numToPx(W2);

  const wrapLeft = $('div', {
    id: 'wrap-left',
    parent: root,
    css: {
      position: 'relative',
      display: 'flex',
      overflow: 'visible',
      flex: '0 0 auto',
      margin: '0',
      zIndex: 2
    }
  });
  const wrapMid = $('div', {
    id: 'wrap-mid',
    parent: root,
    css: {
      position: 'relative',
      display: 'flex',
      overflow: 'visible',
      flex: '0 1 auto',
      margin: '0',
      zIndex: 1
    }
  });
  const wrapRight = $('div', {
    id: 'wrap-right',
    parent: root,
    css: {
      background: 'transparent',
      position: 'relative',
      display: 'flex',
      overflow: 'visible',
      flex: '0 0 auto',
      margin: '0',
      zIndex: 2
    }
  });

  const btn1 = $('div', {
    id: 'toolboxLeft',
    parent: wrapLeft,
    css: {
      background: theme.toolBox_bg,
      width: width1,
      height: height1,
      boxShadow: theme.item_shadow,
      borderRadius: theme.item_border_radius
    }
  });
  const btn2 = $('div', {
    id: 'toolboxRight',
    parent: wrapRight,
    css: {
      background: theme.toolBox_bg,
      width: width2,
      height: height2,
      boxShadow: theme.item_shadow,
      borderRadius: theme.item_border_radius
    }
  });

  const menu_content_reveal = $('div', {
    id: 'panel',
    parent: wrapMid,
    class: 'no-scrollbar',
    css: {
      overflow: 'hidden',
      display: 'flex',
      flexDirection: axis,
      background: 'transparent',
      gap: theme.items_gap,
      maxWidth: (axis === 'row') ? '0px' : '',
      maxHeight: (axis === 'column') ? '0px' : '',
      flex: '0 1 auto',
      transformStyle: 'preserve-3d'
    }
  });
  const items = [];
  for (let i = 0; i < itemsCount; i++) {
    items.push($('div', {
      parent: menu_content_reveal,
      class: 'flip-revealed',
      css: {
        background: theme.tool_bg,
        width: theme.item_size,
        height: theme.item_size,
        boxShadow: theme.item_shadow,
        borderRadius: theme.item_border_radius,
        position: 'relative',
        zIndex: 100002
      }
    }));
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
  const mask1 = $('div', {
    id: 'mask-left',
    parent: root,
    css: {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: 100000,
      background: theme.toolBox_bg
    }
  });
  const mask2 = $('div', {
    id: 'mask-right',
    parent: root,
    css: {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: 100000,
      background: theme.toolBox_bg,
    }
  });

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

    // Add internal padding based on item shadow to prevent clipping at scroller edges
    const safePad = shadowSafePad(theme.item_shadow);
    const gapPx = pxToNum(theme.items_gap);
    const pad = Math.max(gapPx, safePad) + 'px';

    if (axis === 'row') {
      menu_content_reveal.style.maxWidth = 'calc(100vw - 24px)';
      menu_content_reveal.style.overflowX = 'auto';
      menu_content_reveal.style.overflowY = 'visible';
      menu_content_reveal.style.paddingInline = pad;
      menu_content_reveal.style.paddingBlock = '0';
    } else {
      menu_content_reveal.style.maxHeight = 'calc(100vh - 24px)';
      menu_content_reveal.style.overflowY = 'auto';
      menu_content_reveal.style.overflowX = 'visible';
      menu_content_reveal.style.paddingBlock = pad;
      menu_content_reveal.style.paddingInline = '0';
    }
    menu_content_reveal.style.flex = '1 1 auto';

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
        if (axis === 'row') menu_content_reveal.style.maxWidth = '0px'; else menu_content_reveal.style.maxHeight = '0px';
        menu_content_reveal.style.overflow = 'hidden';
        menu_content_reveal.style.paddingInline = '0';
        menu_content_reveal.style.paddingBlock = '0';

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
      if (axis === 'row') menu_content_reveal.style.maxWidth = '0px'; else menu_content_reveal.style.maxHeight = '0px';
      menu_content_reveal.style.overflow = 'hidden';
      menu_content_reveal.style.paddingInline = '0';
      menu_content_reveal.style.paddingBlock = '0';
      updateMasks();
    }
  }

  wrapLeft.addEventListener('click', () => { open ? closeMenu() : openMenu(); });
  wrapRight.addEventListener('click', () => { open ? closeMenu() : openMenu(); });

  return { root, openMenu, closeMenu, menu_content_reveal, btn1, btn2 };
}

// --- Attach to Intuition by default ---
// Expose the builder for manual usage and add a safe auto-init that attaches the menu
// to the Intuition container if present and not already initialized.
try { window.buildCornerMenu = buildCornerMenu; } catch (_) { }

(function autoAttachCornerMenuToIntuition() {
  const INIT_ID = 'menuRoot';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  function ensure() {
    // Require Squirrel's $ builder and the intuition container
    const hasSquirrel = typeof window.$ === 'function';
    const container = document.getElementById('intuition');
    const already = document.getElementById(INIT_ID);
    if (!hasSquirrel || !container || already) return false;
    try {
      buildCornerMenu({ parent: 'body' });
      return true;
    } catch (e) {
      // If Squirrel isn't fully ready yet, retry shortly
      return false;
    }
  }
  ready(() => {
    if (ensure()) return;
    // Retry a few times in case Squirrel loads just after DOMContentLoaded
    let attempts = 0;
    const max = 10;
    const timer = setInterval(() => {
      attempts += 1;
      if (ensure() || attempts >= max) clearInterval(timer);
    }, 60);
  });
})();

