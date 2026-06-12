import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

const status = document.createElement('div');
status.id = 'eve_finder_dialog__results_status';
document.body.appendChild(status);

const searchInput = document.createElement('input');
searchInput.id = 'eve_finder_dialog__search__input';
document.body.appendChild(searchInput);

const resultsList = document.createElement('div');
resultsList.id = 'eve_finder_dialog__results_list';
document.body.appendChild(resultsList);

let mapOptions = null;
let tileOptions = null;

const mapInstance = {
    attributionControl: {
        prefix: 'Leaflet',
        setPrefix(value) {
            this.prefix = value;
        }
    },
    _container: null,
    setView() {
        return this;
    },
    invalidateSize() {},
    remove() {}
};

window.L = {
    map(container, options) {
        mapOptions = options;
        mapInstance._container = container;
        return mapInstance;
    },
    tileLayer(_url, options) {
        tileOptions = options;
        return {
            addTo(map) {
                const attribution = document.createElement('div');
                attribution.className = 'leaflet-control-attribution leaflet-control';
                const link = document.createElement('a');
                link.href = 'https://leafletjs.com';
                link.textContent = 'Leaflet';
                attribution.appendChild(link);
                map._container.appendChild(attribution);
                return this;
            }
        };
    },
    marker() {
        return {
            addTo() { return this; },
            bindPopup() { return this; },
            openPopup() { return this; },
            setLatLng() { return this; }
        };
    }
};

await import('../../eVe/intuition/tools/map.js');

window.__eveMap.activate();

assert.equal(mapOptions.zoomControl, true, 'Finder map must keep the Leaflet zoom control enabled');
assert.equal(mapInstance.attributionControl.prefix, false, 'Finder map must disable the clickable Leaflet attribution prefix');
assert.equal(tileOptions.attribution, '&copy; OpenStreetMap contributors', 'Finder map must keep OSM attribution visible as plain text');
assert.equal(tileOptions.attribution.includes('<a'), false, 'Finder map tile attribution must not inject a clickable link');

const attributionLink = document.querySelector('.leaflet-control-attribution a');
assert.ok(attributionLink, 'test setup must expose a simulated third-party attribution link');

const click = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true
});
attributionLink.dispatchEvent(click);

assert.equal(click.defaultPrevented, true, 'Finder map must prevent attribution links from navigating inside Tauri');
