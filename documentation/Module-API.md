# Module Component API Documentation

## Overview

The Module component is a comprehensive solution for creating draggable modules with input/output connectors that can be connected together to build visual programming interfaces. It provides a flexible and extensible framework for node-based editors, audio mixers, synthesizers, and other visual programming tools.

## Table of Contents

1. [Constructor & Configuration](#constructor--configuration)
2. [Instance Methods](#instance-methods)
3. [Static Methods](#static-methods)
4. [Event System](#event-system)
5. [Connector Management](#connector-management)
6. [Connection System](#connection-system)
7. [Styling & Theming](#styling--theming)
8. [Examples](#examples)

---

## Constructor & Configuration

### `new Module(config)`

Creates a new module instance with the specified configuration.

#### Parameters

- **config** `Object` - Configuration object with the following properties:

##### Basic Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | `module_${Date.now()}` | Unique identifier for the module |
| `name` | `string` | `'Untitled Module'` | Display name for the module |
| `attach` | `string|Element` | `'body'` | CSS selector or DOM element to attach to |
| `x` | `number` | `100` | Initial X position in pixels |
| `y` | `number` | `100` | Initial Y position in pixels |
| `width` | `number` | `200` | Module width in pixels |
| `height` | `number` | `120` | Module height in pixels |

##### Connectors

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `inputs` | `Array<ConnectorConfig>` | `[]` | Array of input connector configurations |
| `outputs` | `Array<ConnectorConfig>` | `[]` | Array of output connector configurations |

**ConnectorConfig Object:**
```javascript
{
  id: 'unique_id',        // Unique identifier
  name: 'Connector Name', // Display name
  type: 'audio'           // Type: 'audio', 'control', 'data'
}
```

##### Styling

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `style` | `Object` | See below | CSS styles for the module |
| `connectors` | `Object` | See below | Connector-specific styling |
| `connectorTypes` | `Object` | See below | Type-based connector styling |

**Default Style Object:**
```javascript
{
  backgroundColor: '#2c3e50',
  borderRadius: '8px',
  border: '2px solid #34495e',
  color: 'white',
  fontSize: '14px',
  fontFamily: 'Roboto, sans-serif',
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
}
```

**Connector Configuration:**
```javascript
connectors: {
  input: {
    backgroundColor: '#e74c3c',
    size: 12,
    position: 'left'
  },
  output: {
    backgroundColor: '#27ae60',
    size: 12,
    position: 'right'
  }
}
```

**Connector Types:**
```javascript
connectorTypes: {
  audio: { color: '#e74c3c', shape: 'circle' },
  control: { color: '#3498db', shape: 'square' },
  data: { color: '#f39c12', shape: 'triangle' }
}
```

##### Behavior

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `draggable` | `boolean` | `true` | Whether the module can be dragged |
| `grid` | `Object` | `{ enabled: false, size: 20 }` | Grid snapping configuration |

##### Callbacks

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `callbacks.onMove` | `Function` | `() => {}` | Called when module is moved |
| `callbacks.onConnect` | `Function` | `() => {}` | Called when connection is made |
| `callbacks.onDisconnect` | `Function` | `() => {}` | Called when connection is removed |
| `callbacks.onClick` | `Function` | `() => {}` | Called when module is clicked |
| `callbacks.onSelect` | `Function` | `() => {}` | Called when module selection changes |

#### Example

```javascript
const module = new Module({
  name: 'Audio Mixer',
  x: 150,
  y: 200,
  width: 250,
  height: 180,
  inputs: [
    { id: 'audioIn1', name: 'Audio In 1', type: 'audio' },
    { id: 'audioIn2', name: 'Audio In 2', type: 'audio' },
    { id: 'volume', name: 'Volume', type: 'control' }
  ],
  outputs: [
    { id: 'mixedOut', name: 'Mixed Output', type: 'audio' }
  ],
  style: {
    backgroundColor: '#34495e'
  },
  callbacks: {
    onConnect: (fromModule, fromConnector, toModule, toConnector) => {
      console.log(`Connected: ${fromModule.name} → ${toModule.name}`);
    }
  }
});
```

---

## Instance Methods

### Movement & Positioning

#### `moveTo(x, y)`

Moves the module to the specified coordinates and updates all connected lines.

- **x** `number` - X coordinate in pixels
- **y** `number` - Y coordinate in pixels

```javascript
module.moveTo(300, 150);
```

#### `setDraggable(draggable)`

Enables or disables module dragging.

- **draggable** `boolean` - Whether the module should be draggable

```javascript
module.setDraggable(false); // Disable dragging
```

### Connector Management

#### `addInput(config)`

Dynamically adds a new input connector to the module.

- **config** `ConnectorConfig` - Input connector configuration

```javascript
module.addInput({
  id: 'newInput',
  name: 'New Input',
  type: 'control'
});
```

#### `addOutput(config)`

Dynamically adds a new output connector to the module.

- **config** `ConnectorConfig` - Output connector configuration

```javascript
module.addOutput({
  id: 'newOutput',
  name: 'New Output',
  type: 'data'
});
```

#### `removeInput(connectorId)`

Removes an input connector and all its connections.

- **connectorId** `string` - ID of the connector to remove

```javascript
module.removeInput('oldInput');
```

#### `removeOutput(connectorId)`

Removes an output connector and all its connections.

- **connectorId** `string` - ID of the connector to remove

```javascript
module.removeOutput('oldOutput');
```

### Connection Management

#### `connectTo(targetModule, fromConnectorId, toConnectorId)`

Programmatically creates a connection between modules.

- **targetModule** `Module` - Target module to connect to
- **fromConnectorId** `string` - ID of the output connector on this module
- **toConnectorId** `string` - ID of the input connector on target module
- **Returns** `string|null` - Connection ID or null if failed

```javascript
const connectionId = sourceModule.connectTo(targetModule, 'output1', 'input1');
```

#### `disconnect(connectionId)`

Removes a specific connection.

- **connectionId** `string` - ID of the connection to remove

```javascript
module.disconnect('module1.output1_to_module2.input1');
```

#### `disconnectAll()`

Removes all connections from this module.

```javascript
module.disconnectAll();
```

### Selection & State

#### `select()`

Marks the module as selected and applies visual selection styling.

```javascript
module.select();
```

#### `deselect()`

Removes selection from the module.

```javascript
module.deselect();
```

### Information & Queries

#### `getConnections()`

Returns all connections associated with this module.

- **Returns** `Array<Connection>` - Array of connection objects

```javascript
const connections = module.getConnections();
```

#### `getInputs()`

Returns a copy of all input connectors.

- **Returns** `Array<ConnectorConfig>` - Array of input configurations

```javascript
const inputs = module.getInputs();
```

#### `getOutputs()`

Returns a copy of all output connectors.

- **Returns** `Array<ConnectorConfig>` - Array of output configurations

```javascript
const outputs = module.getOutputs();
```

### Lifecycle

#### `destroy()`

Removes the module, all its connections, and cleans up resources.

```javascript
module.destroy();
```

---

## Static Methods

### `Module.getModule(id)`

Retrieves a module by its ID.

- **id** `string` - Module ID
- **Returns** `Module|undefined` - Module instance or undefined

```javascript
const module = Module.getModule('audio_mixer_1');
```

### `Module.getAllModules()`

Returns all active modules.

- **Returns** `Array<Module>` - Array of all module instances

```javascript
const allModules = Module.getAllModules();
```

### `Module.getAllConnections()`

Returns all active connections across all modules.

- **Returns** `Array<Connection>` - Array of all connection objects

```javascript
const allConnections = Module.getAllConnections();
```

### `Module.clearAll()`

Destroys all modules and cleans up the entire system.

```javascript
Module.clearAll(); // Clean slate
```

---

## Event System

### User Interactions

#### Click Interactions

- **Single Click on Connector**: 
  - If connected: Disconnects all connections from that connector
  - If not connected: Starts connection process
  - Second click on valid target: Completes connection

- **Long Press (600ms)**: Opens context menu with options:
  - Disconnect All
  - Rename Module
  - Change Color
  - Delete Module

#### Drag & Drop

- **Module Dragging**: Click and drag the header to move modules
- **Connector Dragging**: Click and drag connectors to create connections
  - Visual feedback with green line following mouse
  - Valid targets highlighted in green
  - Cancel with right-click or Escape key

#### Keyboard Shortcuts

- **Escape**: Cancels connection in progress
- **Escape**: Closes context menu

### Connection Validation

Connections are automatically validated with the following rules:

1. **Different Modules**: Cannot connect module to itself
2. **Compatible Types**: Output → Input only
3. **No Duplicates**: Prevents duplicate connections
4. **Type Compatibility**: Based on connector types (future extensibility)

---

## Connector Management

### Connector Types

The system supports three built-in connector types:

#### Audio Connectors
- **Color**: Red (`#e74c3c`)
- **Shape**: Circle
- **Usage**: Audio signal flow

#### Control Connectors
- **Color**: Blue (`#3498db`)
- **Shape**: Square
- **Usage**: Control parameters, automation

#### Data Connectors
- **Color**: Orange (`#f39c12`)
- **Shape**: Triangle
- **Usage**: Generic data flow

### Custom Connector Types

You can define custom connector types in the configuration:

```javascript
const module = new Module({
  connectorTypes: {
    midi: { color: '#9b59b6', shape: 'circle' },
    video: { color: '#1abc9c', shape: 'square' },
    custom: { color: '#e67e22', shape: 'triangle' }
  }
});
```

### Visual States

Connectors have different visual states:

- **Default**: Standard appearance
- **Hover**: Scale up (1.2x) with transition
- **Connected**: Golden border with glow effect
- **Dragging**: Scale up (1.3x) with green glow
- **Valid Drop Target**: Green glow when dragging over

---

## Connection System

### Connection Object Structure

```javascript
{
  id: 'module1.output1_to_module2.input1',
  from: {
    fromModule: Module,     // Source module instance
    fromConnector: 'output1', // Source connector ID
    fromType: 'output',     // Connector type
    fromElement: Element    // DOM element
  },
  to: {
    toModule: Module,       // Target module instance
    toConnector: 'input1',  // Target connector ID
    toType: 'input',        // Connector type
    toElement: Element      // DOM element
  },
  element: SVGLineElement   // Visual connection line
}
```

### Connection Management

Connections are managed through a global registry (`Module.connections`) that tracks all active connections. Each module maintains a local set of connection IDs for quick lookup.

### Visual Representation

Connections are rendered as SVG lines with:
- **Color**: Blue (`#3498db`)
- **Width**: 2px
- **Style**: Round line caps
- **Updates**: Automatically repositioned when modules move

---

## Styling & Theming

### CSS Classes

The module system uses structured CSS classes for easy styling:

```css
.squirrel-module {
  /* Main module container */
}

.module-header {
  /* Module title header */
}

.module-content {
  /* Content area */
}

.module-connector {
  /* Base connector styling */
}

.module-input {
  /* Input-specific styling */
}

.module-output {
  /* Output-specific styling */
}
```

### Custom Themes

You can create custom themes by providing style overrides:

```javascript
const darkTheme = {
  backgroundColor: '#1a1a1a',
  border: '2px solid #333',
  color: '#fff'
};

const module = new Module({
  style: darkTheme
});
```

### Grid System

Enable grid snapping for precise module positioning:

```javascript
const module = new Module({
  grid: {
    enabled: true,
    size: 25 // 25px grid
  }
});
```

---

## Examples

### Basic Audio Mixer

```javascript
const mixer = new Module({
  name: 'Audio Mixer',
  x: 100,
  y: 100,
  inputs: [
    { id: 'ch1', name: 'Channel 1', type: 'audio' },
    { id: 'ch2', name: 'Channel 2', type: 'audio' },
    { id: 'volume', name: 'Master Volume', type: 'control' }
  ],
  outputs: [
    { id: 'master', name: 'Master Out', type: 'audio' }
  ]
});
```

### Synthesizer Module

```javascript
const synth = new Module({
  name: 'Synthesizer',
  x: 400,
  y: 150,
  width: 300,
  height: 200,
  inputs: [
    { id: 'freq', name: 'Frequency', type: 'control' },
    { id: 'amp', name: 'Amplitude', type: 'control' },
    { id: 'gate', name: 'Gate', type: 'control' }
  ],
  outputs: [
    { id: 'audio', name: 'Audio Out', type: 'audio' },
    { id: 'env', name: 'Envelope', type: 'control' }
  ],
  style: {
    backgroundColor: '#8e44ad'
  }
});
```

### Complex Processing Module

```javascript
const processor = new Module({
  name: 'Signal Processor',
  x: 250,
  y: 300,
  width: 280,
  height: 160,
  inputs: [
    { id: 'audioIn', name: 'Audio In', type: 'audio' },
    { id: 'dry_wet', name: 'Dry/Wet', type: 'control' },
    { id: 'feedback', name: 'Feedback', type: 'control' }
  ],
  outputs: [
    { id: 'audioOut', name: 'Processed Out', type: 'audio' },
    { id: 'sidechain', name: 'Sidechain', type: 'audio' }
  ],
  callbacks: {
    onConnect: (from, fromConn, to, toConn) => {
      console.log(`Audio routed: ${from.name} → ${to.name}`);
    },
    onMove: (module, x, y) => {
      console.log(`${module.name} moved to (${x}, ${y})`);
    }
  }
});
```

### Programmatic Connections

```javascript
// Create connections between modules
const connection1 = synth.connectTo(mixer, 'audio', 'ch1');
const connection2 = processor.connectTo(mixer, 'audioOut', 'ch2');

// Query connections
console.log('Synth connections:', synth.getConnections());
console.log('All connections:', Module.getAllConnections());

// Disconnect specific connection
mixer.disconnect(connection1);

// Clean up everything
Module.clearAll();
```

---

## Browser Compatibility

- **Chrome**: 70+
- **Firefox**: 65+
- **Safari**: 12+
- **Edge**: 79+

## Dependencies

- No external dependencies
- Uses modern ES6+ features
- Requires SVG support for connection lines
- Uses CSS transforms and transitions

## Performance Notes

- Connection lines update only when modules move
- Event delegation used for connector interactions
- Efficient DOM manipulation with minimal reflows
- Memory cleanup on module destruction

## License

Part of the Squirrel Framework - See project license for details.
