// The public site's stylesheet (server/site_projection.js), validated as mockups M6 and M9: the page at its own
// layout on a wide screen (scaled down to fit between the phone and its width), its objects restacked in reading
// order under 720 px. Values written into a page are first checked by `cssColor` / `cssNumber`: nothing a project
// holds reaches the stylesheet unchecked.
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[-0-9.%,\s/]+\)|[a-z]{3,20})$/i;
export const cssColor = (value, fallback = 'transparent') => (COLOR.test(String(value ?? '').trim()) ? String(value).trim() : fallback);
export const cssNumber = (value, fallback = 0) => { const number = Number.parseFloat(value); return Number.isFinite(number) ? number : fallback; };
export const PHONE_BREAKPOINT_PX = 720;
const PAGE_BACKGROUND = '#ffffff';
// The page's ink (a page is a group: its `color` is its own, never a text's): dark on a light ground, white on a dark
// one (relative luminance, sRGB), so the credit mark, the form and an uncoloured text always read. A ground given by name keeps the dark ink.
export const inkOn = (background) => {
    const value = cssColor(background, PAGE_BACKGROUND).toLowerCase();
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/)?.[1];
    const rgb = hex ? (hex.length === 3 ? [...hex].map(d => parseInt(d + d, 16)) : [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)))
        : value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)?.slice(1).map(Number);
    if (!rgb) return '#15182c';
    const linear = rgb.map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] > 0.18 ? '#15182c' : '#ffffff';
};

export const siteStylesheet = ({ width, height, background }) => `@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Regular.ttf);font-weight:400;font-display:swap}
@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Medium.ttf);font-weight:500;font-display:swap}
@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Bold.ttf);font-weight:700;font-display:swap}
*{box-sizing:border-box;margin:0}html,body{background:${cssColor(background, PAGE_BACKGROUND)};font-family:Roboto,system-ui,sans-serif}
.page{position:relative;width:${width}px;height:${height}px;margin:0 auto;overflow:hidden}
.r{display:contents}.c{position:absolute}.o{position:absolute;display:block}.t{white-space:normal;overflow:hidden;overflow-wrap:anywhere}
a.o,.o a{color:inherit;text-decoration:none}a.o:focus-visible,.o a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.i{object-fit:cover}.v{object-fit:contain;background:#000}
.f{display:flex;flex-direction:column;gap:14px;padding:28px;border-radius:15px;background:rgba(255,255,255,.06)}
.f label{display:flex;flex-direction:column;gap:6px;color:var(--ink);font-size:15px;font-weight:500}
.f input,.f textarea{font:inherit;font-weight:400;font-size:16px;color:var(--ink);background:rgba(127,127,127,.14);border:0;border-radius:10px;padding:12px 14px;resize:none}
.f .consent,.f .said{color:var(--ink);opacity:.6;font-size:13px}.f .hp{position:absolute;left:-9999px}
.f button{align-self:flex-start;font:inherit;font-weight:700;font-size:17px;color:#15182c;background:var(--accent);border:0;border-radius:15px;padding:14px 28px;cursor:pointer}
.credit{display:block;width:21px;height:21px;margin:21px 21px 21px auto;color:inherit;background:currentColor;opacity:.34;transition:opacity .2s;
 -webkit-mask:url(/_site/logo.svg) center/contain no-repeat;mask:url(/_site/logo.svg) center/contain no-repeat}.credit:hover,.credit:focus-visible{opacity:.8}
@media (max-width:${width}px) and (min-width:${PHONE_BREAKPOINT_PX + 1}px){.page{zoom:calc(100vw / ${width}px)}}
@media (max-width:${PHONE_BREAKPOINT_PX}px){.page{width:auto;height:auto;padding:24px 20px 8px;display:flex;flex-direction:column;gap:20px}
 .r{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center}
 .c{position:relative;left:auto!important;top:auto!important;width:auto!important;height:auto!important}
 .c:has(.i,.v){width:100%!important;aspect-ratio:calc(var(--w) / var(--h))}
 .c:has(.s){width:auto!important;min-width:calc(var(--w) * 1px);height:calc(var(--h) * 1px)!important;aspect-ratio:auto}
 .c:not(:has(.i,.v,.s)) .o{position:static;width:auto!important;height:auto!important}
 .t{font-size:clamp(16px,calc(var(--fs) * .62px),40px)!important}
 .c:has(.f){width:100%!important;height:auto!important}.c:has(.f) .o{position:static;width:100%!important;height:auto!important}
 .c:has(.i,.v) .o{width:100%!important;height:100%!important;left:0!important;top:0!important}}`;
