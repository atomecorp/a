import { render_svg } from '../../apis/svg_utils.js';
import { apply_svg_settings_and_anim, rescale_all_icons } from './svg_layout.js';

export { apply_svg_settings_and_anim, rescale_all_icons };

function waitNextFrames(count = 2) {
    return new Promise((resolve) => {
        let remaining = Math.max(1, count);
        const tick = () => {
            remaining -= 1;
            if (remaining <= 0) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

export function create_svg(cfg) {
    const parentId = cfg.id;
    const svgId = `${parentId}__icon`;
    const prev = document.getElementById(svgId);
    if (prev) {
        try {
            prev.remove();
        } catch (e) {
            /* ignore */
        }
    }
    const icon = cfg.icon;
    if (icon === null || icon === false || (typeof icon === 'string' && icon.trim() === '')) {
        return Promise.resolve(null);
    }
    let icon_color = (cfg.icon_color || currentTheme.icon_color || '#ffffffff').trim();
    let icon_Left = (cfg.icon_left || currentTheme.icon_left || '10%').trim();
    let icon_Top = (cfg.icon_top || currentTheme.icon_top || '50%').trim();
    // check if icon is base64 encoded svg
    if (typeof icon === 'string' && icon.startsWith('data:image/svg+xml;base64,')) {
        const base64Data = icon.replace('data:image/svg+xml;base64,', '');
        const svgData = atob(base64Data);

        render_svg(svgData, svgId, parentId, '0px', '0px', '100%', '100%', icon_color, icon_color);
        apply_svg_settings_and_anim(cfg, icon_Left, icon_Top, svgId, parentId);
        return waitNextFrames(2).then(() => svgId);
    } else {
        return dataFetcher(`assets/images/icons/${icon}.svg`)
            .then((svgData) => {
                // Injecte le SVG dans le parent
                render_svg(svgData, svgId, parentId, '0px', '0px', '100%', '100%', icon_color, icon_color);
                // Normalisation et centrage + taille basée sur currentTheme.icon_size
                apply_svg_settings_and_anim(cfg, icon_Left, icon_Top, svgId, parentId);
                return waitNextFrames(2).then(() => svgId);
            })
            .catch((err) => {
                console.error(`Erreur (create_svg):${icon}, ${err}`);
                return null;
            });
    }
}

if (typeof window !== 'undefined') {
    window.create_svg = create_svg;
}
