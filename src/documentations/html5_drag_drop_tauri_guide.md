# HTML5 Drag & Drop in Tauri: Complete Implementation Guide

## Overview

This guide explains how to implement HTML5 drag & drop functionality that works seamlessly in both browser and Tauri (WebView) environments. By default, Tauri's WebView does not properly handle HTML5 drag & drop events, but with the correct configuration and JavaScript implementation, you can achieve full compatibility.

## The Problem

Tauri applications use a WebView component that, unlike standard browsers, intercepts drag & drop events for its own native file drag & drop functionality. This prevents HTML5 drag & drop from working properly for custom UI components, causing:

- Drag events not firing on draggable elements
- Drop events not being triggered on drop zones
- Silent failures with no error messages

## The Solution

### 1. Tauri Configuration

First, disable Tauri's native drag & drop interception by modifying your `tauri.conf.json`:

```json
{
  "tauri": {
    "windows": [
      {
        "title": "Your App",
        "width": 1200,
        "height": 800,
        "dragDropEnabled": false
      }
    ]
  }
}
```

**Key Point**: Set `"dragDropEnabled": false` to prevent Tauri from intercepting drag events.

### 2. JavaScript Implementation

#### Force Enable HTML5 Drag & Drop

Add this code to ensure HTML5 drag & drop is properly enabled in Tauri:

```javascript
// Force enable HTML5 drag & drop in Tauri
function enableHTML5DragDrop() {
    // Detect if running in Tauri
    if (window.__TAURI__ || window.__TAURI_METADATA__) {
        // Force enable drag & drop on document
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }
}

// Call this early in your application
enableHTML5DragDrop();
```

#### Proper Draggable Element Configuration

For elements that should be draggable:

```javascript
function makeDraggable(element, dragData) {
    // Set draggable attribute
    element.setAttribute('draggable', 'true');
    
    // Force WebKit drag capability (important for Tauri)
    element.style.webkitUserDrag = 'element';
    
    // Add drag event listeners
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
    });
    
    element.addEventListener('dragend', (e) => {
        // Clean up any visual feedback
    });
}
```

#### Proper Drop Zone Configuration

For drop zones:

```javascript
function makeDropZone(element, onDrop) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        // Add visual feedback
        element.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    });
    
    element.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Remove visual feedback
        element.style.backgroundColor = '';
    });
    
    element.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Remove visual feedback
        element.style.backgroundColor = '';
        
        // Get drag data
        const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        
        // Handle the drop
        onDrop(dragData, e);
    });
}
```

## Complete Working Example

Here's a complete example that works in both browser and Tauri:

```javascript
// Initialize drag & drop support
function initializeDragDrop() {
    // Enable HTML5 drag & drop in Tauri
    if (window.__TAURI__ || window.__TAURI_METADATA__) {
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }
}

// Create draggable objects
function createDraggableObject(id, text) {
    const obj = document.createElement('div');
    obj.id = id;
    obj.textContent = text;
    obj.className = 'draggable-object';
    obj.style.cssText = `
        padding: 10px;
        margin: 5px;
        background: #3498db;
        color: white;
        cursor: move;
        border-radius: 4px;
        user-select: none;
    `;
    
    // Make it draggable
    obj.setAttribute('draggable', 'true');
    obj.style.webkitUserDrag = 'element';
    
    obj.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, text }));
        e.dataTransfer.effectAllowed = 'move';
        obj.style.opacity = '0.5';
    });
    
    obj.addEventListener('dragend', (e) => {
        obj.style.opacity = '1';
    });
    
    return obj;
}

// Create drop zone
function createDropZone() {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.style.cssText = `
        width: 300px;
        height: 200px;
        border: 2px dashed #ccc;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 18px;
    `;
    zone.textContent = 'Drop objects here';
    
    // Configure drop zone
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        zone.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        zone.style.borderColor = '#2ecc71';
    });
    
    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.style.backgroundColor = '';
        zone.style.borderColor = '#ccc';
    });
    
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        zone.style.backgroundColor = '';
        zone.style.borderColor = '#ccc';
        
        const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        zone.textContent = `Dropped: ${dragData.text}`;
        
        setTimeout(() => {
            zone.textContent = 'Drop objects here';
        }, 2000);
    });
    
    return zone;
}

// Initialize everything
function setupDragDropDemo() {
    initializeDragDrop();
    
    const container = document.body;
    
    // Create some draggable objects
    container.appendChild(createDraggableObject('obj1', 'Object 1'));
    container.appendChild(createDraggableObject('obj2', 'Object 2'));
    container.appendChild(createDraggableObject('obj3', 'Object 3'));
    
    // Create drop zone
    container.appendChild(createDropZone());
}

// Start the demo
setupDragDropDemo();
```

## Key Requirements Summary

1. **Tauri Configuration**: Set `"dragDropEnabled": false` in `tauri.conf.json`
2. **WebKit Compatibility**: Use `webkitUserDrag: 'element'` for draggable elements
3. **Event Prevention**: Properly prevent default actions on dragover and drop events
4. **Cross-Platform Detection**: Check for Tauri environment and apply specific fixes
5. **Complete Event Handling**: Implement all necessary drag/drop event listeners

## Testing

To verify your implementation works:

1. Test in a regular browser first
2. Build and run in Tauri: `npm run tauri dev`
3. Verify that drag & drop works identically in both environments
4. Check browser console for any error messages

## Troubleshooting

- **Drag events not firing**: Ensure `webkitUserDrag` is set and `dragDropEnabled` is false
- **Drop zone not responding**: Check that `dragover` event calls `preventDefault()`
- **Data transfer issues**: Use `text/plain` format for maximum compatibility
- **Visual feedback problems**: Implement proper dragover/dragleave handlers

## Conclusion

With these configurations and implementations, HTML5 drag & drop will work reliably in both browser and Tauri environments. The key is disabling Tauri's native drag interception and properly configuring WebKit-specific properties.
