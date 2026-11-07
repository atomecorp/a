// The page's ground from its first paint. The application's module graph (a thousand files) runs
// only once all of it is fetched, and until then the page stood white for seconds, as if dead.
// This graph is the ground token alone; look/tokens.js#applyEveCssVars sets it again with the rest.
import { DEFAULT_SURFACE_BACKGROUND_CSS_VAR, DEFAULT_SURFACE_BACKGROUND_HEX } from '/eVe/domains/rendering/surface_background_defaults.js';

document.documentElement.style.setProperty(DEFAULT_SURFACE_BACKGROUND_CSS_VAR, DEFAULT_SURFACE_BACKGROUND_HEX);
