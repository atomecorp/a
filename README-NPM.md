# 🐿️ Squirrel.js Framework

Modern Web Component Framework with Vanilla JS

## 📦 Installation

### Via NPM
```bash
npm install squirrel-framework
```

### Via Yarn
```bash
yarn add squirrel-framework
```

### Via PNPM
```bash
pnpm add squirrel-framework
```

## 🚀 Usage

### ES Modules (Recommended)
```javascript
import Squirrel, { Button, Slider, Matrix } from 'squirrel-framework';

// Create components
const button = Button({ text: 'Click me!' });
const slider = Slider({ min: 0, max: 100, value: 50 });

// Add to DOM
document.body.appendChild(button);
document.body.appendChild(slider);
```

### CommonJS
```javascript
const { Button, Slider } = require('squirrel-framework');

const button = Button({ text: 'Hello World' });
document.body.appendChild(button);
```

### Browser (UMD)
```html
<script src="node_modules/squirrel-framework/dist/squirrel.umd.js"></script>
<script>
  const button = Squirrel.Button({ text: 'Click me!' });
  document.body.appendChild(button);
</script>
```

### CDN
```html
<script src="https://unpkg.com/squirrel-framework/dist/squirrel.min.js"></script>
<script>
  const button = Squirrel.Button({ text: 'From CDN' });
  document.body.appendChild(button);
</script>
```

## 🧩 Available Components

- **Button** - Interactive buttons
- **Slider** - Range sliders
- **Matrix** - Data matrices
- **Table** - Sortable tables
- **List** - Dynamic lists
- **Menu** - Navigation menus
- **Draggable** - Drag & drop elements
- **Unit** - Base components
- **WaveSurfer** - Audio visualization

## 📖 Documentation

Full documentation available at: [Documentation](./documentation/README.md)

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build:all

# Build for NPM only
npm run build:npm

# Build for CDN only
npm run build:cdn
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
