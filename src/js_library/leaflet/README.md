# Leaflet Integration

This directory contains the complete Leaflet integration for the project, including the wrapper module, comprehensive test suites, and detailed documentation.

## Directory Structure

```
leaflet/
├── leaflet-wrapper.js              # Main Leaflet wrapper module
├── leaflet-comprehensive-test.html # Full feature and integration test
├── leaflet-wrapper-test.html       # Wrapper-specific and advanced test
├── LEAFLET-INTEGRATION-REPORT.md   # Detailed integration report
├── README.md                       # This file
└── index.html                      # Directory navigation page
```

## Quick Start

### Basic Usage

```javascript
// Import the Leaflet wrapper
import LeafletWrapper from './leaflet-wrapper.js';

// Create a map instance
const mapWrapper = new LeafletWrapper('map-container', {
    center: [51.505, -0.09],
    zoom: 13
});

// Add a marker
mapWrapper.addMarker([51.5, -0.09], 'Hello World!');

// Add a circle
mapWrapper.addCircle([51.508, -0.11], 500, {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5
});
```

### Squirrel Integration

The Leaflet wrapper integrates seamlessly with the Squirrel framework:

```javascript
// Create an atome with Leaflet integration
const mapAtome = atome({ tag: 'div', id: 'my-map' });

// Initialize Leaflet on the atome
const leafletMap = mapAtome.leaflet({
    center: [40.7128, -74.0060], // New York
    zoom: 10
});

// Add interactive elements
leafletMap.addMarker([40.7128, -74.0060], 'New York City');
```

## Features

### Core Mapping Features
- **Map Creation**: Easy map initialization with customizable options
- **Markers**: Add, remove, and customize map markers
- **Shapes**: Support for circles, polygons, polylines, and rectangles
- **Popups**: Interactive popup windows with custom content
- **Layer Management**: Add and manage different map layers
- **Event Handling**: Comprehensive click and interaction events

### Advanced Features
- **Custom Styling**: Full control over marker icons and shape styling
- **Geolocation**: Built-in geolocation support
- **Batch Operations**: Efficient handling of multiple markers and shapes
- **Real-time Updates**: Dynamic map updates and data binding
- **Mobile Support**: Touch-friendly interactions and responsive design

### Squirrel Framework Integration
- **Atome Extension**: Native integration with Squirrel's atome system
- **Event Binding**: Seamless event handling within the Squirrel ecosystem
- **State Management**: Integrated with Squirrel's reactive state system

## Testing

### Comprehensive Test Suite
- **File**: `leaflet-comprehensive-test.html`
- **Coverage**: All core features, Squirrel integration, and real-world scenarios
- **Interactive**: Visual verification of all mapping functionality

### Wrapper-Specific Tests
- **File**: `leaflet-wrapper-test.html`
- **Focus**: Wrapper methods, advanced features, and edge cases
- **Automated**: Programmatic testing with visual feedback

### Running Tests

1. **Open Test Files**: Navigate to the test HTML files in your browser
2. **Interactive Testing**: Follow the on-screen instructions for manual verification
3. **Automated Checks**: Watch for console output and visual confirmations
4. **Feature Verification**: Each test section validates specific functionality

## API Reference

### LeafletWrapper Class

#### Constructor
```javascript
new LeafletWrapper(containerId, options)
```

#### Core Methods
- `addMarker(latlng, content, options)` - Add a marker to the map
- `addCircle(latlng, radius, options)` - Add a circle shape
- `addPolygon(latlngs, options)` - Add a polygon shape
- `addPolyline(latlngs, options)` - Add a polyline
- `addRectangle(bounds, options)` - Add a rectangle
- `removeLayer(layer)` - Remove a layer from the map
- `clearAll()` - Clear all added layers
- `setView(latlng, zoom)` - Set map center and zoom
- `getCenter()` - Get current map center
- `getZoom()` - Get current zoom level

#### Squirrel Methods
- `initializeSquirrelIntegration()` - Set up Squirrel framework integration
- `bindSquirrelEvents()` - Bind Squirrel-specific event handlers

## Dependencies

### External Libraries
- **Leaflet**: Core mapping library (loaded via CDN)
- **Leaflet CSS**: Required styling (loaded via CDN)

### Internal Dependencies
- **Squirrel Framework**: For atome integration and event handling
- **Project Structure**: Follows the established js_library pattern

## Browser Support

- **Modern Browsers**: Full support for Chrome, Firefox, Safari, Edge
- **Mobile**: Touch-friendly interactions on iOS and Android
- **Performance**: Optimized for smooth rendering and interaction

## Troubleshooting

### Common Issues
1. **Map not displaying**: Check that the container element exists and has dimensions
2. **Markers not showing**: Verify coordinates are valid [latitude, longitude] format
3. **Styling issues**: Ensure Leaflet CSS is properly loaded
4. **Console errors**: Check browser console for detailed error messages

### Debug Mode
Enable debug logging by setting `window.leafletDebug = true` before initialization.

## Performance Notes

- **Efficient rendering**: Optimized for handling large numbers of markers and shapes
- **Memory management**: Proper cleanup of layers and event listeners
- **Responsive design**: Adapts to different screen sizes and orientations
- **Lazy loading**: Map tiles are loaded on demand for better performance

## Links

- [Comprehensive Test Page](./leaflet-comprehensive-test.html)
- [Wrapper Test Page](./leaflet-wrapper-test.html)
- [Integration Report](./LEAFLET-INTEGRATION-REPORT.md)
- [Directory Index](./index.html)
- [Main js_library Documentation](../README.md)
