import './apis/essentials.js';
import './apis/utils.js';
import './apis/shortcut.js';

import { wait } from './apis/essentials.js';
import { current_platform } from './apis/utils.js';
import {
    dataFetcher,
    render_svg,
    fetch_and_render_svg,
    resize,
    strokeColor,
    fillColor,
    sanitizeSVG,
} from './apis/loader.js';

export {
    wait,
    current_platform,
    dataFetcher,
    render_svg,
    fetch_and_render_svg,
    resize,
    strokeColor,
    fillColor,
    sanitizeSVG,
};

const Apis = {
    wait,
    current_platform,
    dataFetcher,
    render_svg,
    fetch_and_render_svg,
    resize,
    strokeColor,
    fillColor,
    sanitizeSVG,
};

export default Apis;
