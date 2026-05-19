export function apply_svg_settings_and_anim(cfg, icon_Left, icon_Top, svgId, parentId) {
    requestAnimationFrame(() => {
        const svgEl = document.getElementById(svgId);
        const parentEl = document.getElementById(parentId);

        if (!svgEl || !parentEl) return;
        svgEl.dataset.iconSize = cfg.icon_size || currentTheme.icon_size || '';
        svgEl.dataset.iconTop = icon_Top || '';
        svgEl.dataset.iconLeft = icon_Left || '';
        // Responsif via CSS (pas d'attributs width/height)
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.style.position = 'absolute';
        svgEl.style.left = icon_Left;
        svgEl.style.top = icon_Top;
        svgEl.style.transform = 'translate(-50%, -50%)';
        svgEl.style.display = 'block';
        svgEl.style.pointerEvents = 'none';
        const baseSize = Math.max(
            1,
            Math.min(parentEl.clientWidth || 0, parentEl.clientHeight || 0) ||
                (parseFloat(currentTheme.item_size) || 54)
        );

        const cs = window.getComputedStyle(parentEl);
        if (!cs.position || cs.position === 'static') {
            parentEl.style.position = 'relative';
        }

        // const szDefRaw = currentTheme.icon_size != null ? String(currentTheme.icon_size).trim() : '16%';
        const szDefRaw = (cfg.icon_size || currentTheme.icon_size || '16%').trim();

        let iconSize = NaN;
        if (szDefRaw.endsWith('%')) {
            const pct = parseFloat(szDefRaw);
            if (!isNaN(pct)) iconSize = Math.round((pct / 100) * baseSize);
        } else if (szDefRaw.endsWith('px')) {
            const px = parseFloat(szDefRaw);
            if (!isNaN(px)) iconSize = Math.round(px);
        } else {
            const num = parseFloat(szDefRaw);
            if (!isNaN(num)) {
                // num < 1 => ratio, sinon px
                iconSize = num <= 1 ? Math.round(num * baseSize) : Math.round(num);
            }
        }
        if (!isFinite(iconSize) || isNaN(iconSize)) {
            iconSize = Math.round(0.16 * baseSize); // fallback 16%
        }
        iconSize = Math.max(8, iconSize);
        svgEl.style.width = iconSize + 'px';
        svgEl.style.height = iconSize + 'px';

        if (!svgEl.getAttribute('viewBox')) {
            svgEl.setAttribute('viewBox', `0 0 ${iconSize} ${iconSize}`);
        }
        if (!svgEl.getAttribute('preserveAspectRatio')) {
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
    });
}

export function rescale_all_icons() {
    if (typeof document === 'undefined') return;
    const icons = document.querySelectorAll('[id$="__icon"]');
    icons.forEach((svgEl) => {
        if (!svgEl || !(svgEl instanceof SVGElement)) return;
        const svgId = svgEl.id;
        const parentId = svgId.replace(/__icon$/, '');
        const parentEl = document.getElementById(parentId);
        if (!parentEl) return;

        const iconSizeRaw = svgEl.dataset?.iconSize || currentTheme.icon_size || '16%';
        const iconTop = svgEl.dataset?.iconTop || currentTheme.icon_top || '50%';
        const iconLeft = svgEl.dataset?.iconLeft || currentTheme.icon_left || '50%';

        const fakeCfg = { icon_size: iconSizeRaw };
        apply_svg_settings_and_anim(fakeCfg, iconLeft, iconTop, svgId, parentId);
    });
}
