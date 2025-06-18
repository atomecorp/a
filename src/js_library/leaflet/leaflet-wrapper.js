/**
 * 🗺️ LEAFLET WRAPPER
 * Interactive maps integration for Squirrel Framework
 */

class LeafletWrapper {
    constructor() {
        this.maps = new Map();
        this.layers = new Map();
        this.markers = new Map();
        this.initialized = false;
        
        // Don't call init() immediately, let it be called when needed
    }

    async init() {
        if (this.initialized) {
            return; // Already initialized
        }
        
        if (typeof L === 'undefined') {
            console.warn('Leaflet not loaded. Please load Leaflet first.');
            return false;
        }

        this.initialized = true;
        this.setupSquirrelIntegration();
        this.setupDefaultTileLayers();
        
        console.log('🗺️ Leaflet Wrapper initialized');
        return true;
    }

    /**
     * Setup Squirrel framework integration
     */
    setupSquirrelIntegration() {
        // Add Leaflet methods to Squirrel's $ function
        if (typeof $ !== 'undefined') {
            $.map = this.createMap.bind(this);
            $.getMap = this.getMap.bind(this);
        }

        // Add methods to A class instances
        if (typeof A !== 'undefined') {
            A.prototype.makeMap = function(options = {}) {
                return leafletWrapper.createMap(this.html_object, options);
            };
        }
    }

    /**
     * Setup default tile layers
     */
    setupDefaultTileLayers() {
        this.tileLayers = {
            osm: {
                name: 'OpenStreetMap',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors'
            },
            satellite: {
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '© Esri'
            },
            terrain: {
                name: 'Terrain',
                url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
                attribution: '© Stamen Design'
            },
            dark: {
                name: 'Dark',
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                attribution: '© CartoDB'
            }
        };
    }

    /**
     * Create a map
     */
    createMap(element, options = {}) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        if (!element) {
            throw new Error('Element not found for Leaflet map');
        }

        const mapId = options.id || `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Default configuration
        const config = {
            center: [51.505, -0.09], // London by default
            zoom: 13,
            zoomControl: true,
            attributionControl: true,
            tileLayer: 'osm',
            ...options
        };

        // Create Leaflet map
        const map = L.map(element, {
            center: config.center,
            zoom: config.zoom,
            zoomControl: config.zoomControl,
            attributionControl: config.attributionControl
        });

        // Add tile layer
        this.addTileLayer(map, config.tileLayer);

        // Store map reference
        this.maps.set(mapId, {
            instance: map,
            element: element,
            config: config
        });

        return {
            id: mapId,
            map: map,
            setView: (center, zoom) => map.setView(center, zoom),
            addMarker: (lat, lng, options) => this.addMarker(mapId, lat, lng, options),
            addCircle: (lat, lng, radius, options) => this.addCircle(mapId, lat, lng, radius, options),
            addPolygon: (points, options) => this.addPolygon(mapId, points, options),
            addLayer: (layer) => map.addLayer(layer),
            removeLayer: (layer) => map.removeLayer(layer),
            fitBounds: (bounds) => map.fitBounds(bounds),
            getCenter: () => map.getCenter(),
            getZoom: () => map.getZoom(),
            destroy: () => this.destroyMap(mapId)
        };
    }

    /**
     * Add tile layer to map
     */
    addTileLayer(map, layerType = 'osm') {
        const layer = this.tileLayers[layerType];
        if (layer) {
            L.tileLayer(layer.url, {
                attribution: layer.attribution
            }).addTo(map);
        }
    }

    /**
     * Add marker to map
     */
    addMarker(mapId, lat, lng, options = {}) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return null;

        const markerId = `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const marker = L.marker([lat, lng], options).addTo(mapData.instance);
        
        if (options.popup) {
            marker.bindPopup(options.popup);
        }

        if (options.tooltip) {
            marker.bindTooltip(options.tooltip);
        }

        this.markers.set(markerId, {
            instance: marker,
            mapId: mapId,
            lat: lat,
            lng: lng,
            options: options
        });

        return {
            id: markerId,
            marker: marker,
            setPosition: (newLat, newLng) => marker.setLatLng([newLat, newLng]),
            setIcon: (icon) => marker.setIcon(icon),
            openPopup: () => marker.openPopup(),
            closePopup: () => marker.closePopup(),
            remove: () => this.removeMarker(markerId)
        };
    }

    /**
     * Add circle to map
     */
    addCircle(mapId, lat, lng, radius, options = {}) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return null;

        const circle = L.circle([lat, lng], {
            color: options.color || 'red',
            fillColor: options.fillColor || '#f03',
            fillOpacity: options.fillOpacity || 0.5,
            radius: radius,
            ...options
        }).addTo(mapData.instance);

        if (options.popup) {
            circle.bindPopup(options.popup);
        }

        return circle;
    }

    /**
     * Add polygon to map
     */
    addPolygon(mapId, points, options = {}) {
        const mapData = this.maps.get(mapId);
        if (!mapData) return null;

        const polygon = L.polygon(points, {
            color: options.color || 'blue',
            fillColor: options.fillColor || '#30f',
            fillOpacity: options.fillOpacity || 0.5,
            ...options
        }).addTo(mapData.instance);

        if (options.popup) {
            polygon.bindPopup(options.popup);
        }

        return polygon;
    }

    /**
     * Get current location
     */
    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        });
    }

    /**
     * Center map on current location
     */
    async centerOnCurrentLocation(mapId, zoom = 15) {
        try {
            const location = await this.getCurrentLocation();
            const mapData = this.maps.get(mapId);
            if (mapData) {
                mapData.instance.setView([location.lat, location.lng], zoom);
                return location;
            }
        } catch (error) {
            console.error('Failed to get current location:', error);
            throw error;
        }
    }

    /**
     * Get map by ID
     */
    getMap(mapId) {
        return this.maps.get(mapId);
    }

    /**
     * Remove marker
     */
    removeMarker(markerId) {
        const marker = this.markers.get(markerId);
        if (marker) {
            const mapData = this.maps.get(marker.mapId);
            if (mapData) {
                mapData.instance.removeLayer(marker.instance);
            }
            this.markers.delete(markerId);
        }
    }

    /**
     * Destroy map
     */
    destroyMap(mapId) {
        const mapData = this.maps.get(mapId);
        if (mapData) {
            mapData.instance.remove();
            this.maps.delete(mapId);
        }
    }

    /**
     * Get available tile layers
     */
    getTileLayers() {
        return Object.keys(this.tileLayers).map(key => ({
            key,
            name: this.tileLayers[key].name
        }));
    }

    /**
     * Get maps info
     */
    getMapsInfo() {
        return {
            activeMaps: this.maps.size,
            activeMarkers: this.markers.size,
            availableTileLayers: Object.keys(this.tileLayers).length,
            leafletVersion: L.version || 'Unknown'
        };
    }
}

// Create wrapper instance
const leafletWrapper = new LeafletWrapper();

// Initialize when Leaflet is available
function initializeWhenReady() {
    if (typeof L !== 'undefined') {
        leafletWrapper.init();
    } else {
        // Wait for Leaflet to load
        setTimeout(initializeWhenReady, 100);
    }
}

// Start initialization process
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWhenReady);
} else {
    initializeWhenReady();
}

// Export for ES6 modules
export default leafletWrapper;

// Global access for non-module scripts
if (typeof window !== 'undefined') {
    window.leafletWrapper = leafletWrapper;
    window.LeafletWrapper = LeafletWrapper;
}
