# The Complete Guide to JavaScript Framework Plugin Distribution via NPM and CDN

Modern JavaScript plugin distribution requires a sophisticated approach that balances developer experience, performance, and compatibility across multiple environments. This comprehensive guide provides everything you need to distribute intelligent JavaScript framework plugins through NPM with automatic CDN support.

## Framework plugin distribution landscape 

The JavaScript framework plugin ecosystem has evolved dramatically, with major libraries like Material-UI removing UMD builds while embracing ESM-first approaches. **ESM-based CDNs like esm.sh are becoming the preferred alternative** to traditional UMD distributions, offering better performance with tree-shaking benefits while maintaining browser compatibility.

Key trends shaping 2025 include NPM provenance attestations for security, OIDC authentication replacing long-lived tokens, and the rise of compiler-first architectures exemplified by Svelte. Modern toolchains now prioritize build speed and developer experience while maintaining backward compatibility through conditional exports.

The optimal distribution strategy combines NPM-first development with strategic CDN alternatives, automated release workflows, and comprehensive TypeScript support. This multi-format approach ensures maximum compatibility while leveraging modern web standards for performance optimization.

## Package.json configuration mastery

### Essential modern package.json structure

The foundation of successful plugin distribution starts with proper package.json configuration using the latest 2025 standards:

```json
{
  "name": "@organization/plugin-name",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "browser": "./dist/index.umd.js",
  "unpkg": "./dist/index.umd.min.js",
  "jsdelivr": "./dist/index.umd.min.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "development": "./dist/index.dev.mjs",
      "production": "./dist/index.prod.mjs",
      "browser": "./dist/index.umd.js",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./dist/index.mjs"
    },
    "./utils": {
      "types": "./dist/utils.d.ts",
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist/",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "sideEffects": false,
  "peerDependencies": {
    "react": ">=16.8.0 <19.0.0",
    "vue": "^3.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "vue": { "optional": true }
  },
  "engines": {
    "node": ">=14.0.0"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/",
    "provenance": true
  }
}
```

**Critical field explanations:**

- **`exports`**: The modern standard that takes precedence over legacy fields, enabling conditional exports for different environments
- **`sideEffects: false`**: Essential for optimal tree-shaking and bundle size reduction
- **`peerDependencies`**: Use loose version ranges to maximize compatibility
- **`provenance: true`**: New 2025 security feature for verifiable build attestations

### CDN-optimized configuration

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "unpkg": "./dist/index.umd.min.js",
      "browser": "./dist/index.umd.js",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
}
```

## Build toolchain configuration

### Rollup configuration for multi-format builds

Create a comprehensive Rollup setup that generates all required distribution formats:

```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import { defineConfig } from 'rollup';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig([
  // Main bundle configuration
  {
    input: 'src/index.ts',
    external: ['react', 'vue', 'svelte'],
    output: [
      // ESM build
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true,
        exports: 'named'
      },
      // UMD build for CDN
      {
        file: 'dist/index.umd.js',
        format: 'umd',
        name: 'MyPlugin',
        sourcemap: true,
        globals: {
          react: 'React',
          vue: 'Vue',
          svelte: 'Svelte'
        }
      },
      // CommonJS build
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      },
      // IIFE build for direct inclusion
      {
        file: 'dist/index.iife.js',
        format: 'iife',
        name: 'MyPlugin',
        sourcemap: true,
        globals: {
          react: 'React',
          vue: 'Vue'
        }
      }
    ],
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false
      }),
      isProduction && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2
        },
        format: { comments: false }
      })
    ].filter(Boolean)
  },
  
  // TypeScript declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es'
    },
    plugins: [dts()],
    external: [/\.css$/]
  }
]);
```

### Vite library mode configuration

For faster development and modern tooling:

```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyPlugin',
      formats: ['es', 'umd', 'cjs', 'iife'],
      fileName: (format) => {
        const formatMap = {
          es: 'mjs',
          cjs: 'cjs',
          umd: 'umd.js',
          iife: 'iife.js'
        };
        return `index.${formatMap[format]}`;
      }
    },
    rollupOptions: {
      external: ['react', 'vue', 'svelte'],
      output: {
        globals: {
          react: 'React',
          vue: 'Vue',
          svelte: 'Svelte'
        }
      }
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2015'
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true
    })
  ]
});
```

### esbuild high-performance setup

For maximum build speed:

```javascript
// build.js
import { build } from 'esbuild';

const baseConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  external: ['react', 'vue', 'svelte'],
  target: 'es2015',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

// Build all formats in parallel
await Promise.all([
  // ESM build
  build({
    ...baseConfig,
    format: 'esm',
    outfile: 'dist/index.mjs'
  }),
  
  // CommonJS build  
  build({
    ...baseConfig,
    format: 'cjs',
    outfile: 'dist/index.cjs'
  }),
  
  // IIFE build
  build({
    ...baseConfig,
    format: 'iife',
    outfile: 'dist/index.iife.js',
    globalName: 'MyPlugin'
  })
]);
```

## Installation and usage patterns

### NPM installation methods

Provide comprehensive installation instructions for all major package managers:

```bash
# Primary installation methods
npm install @organization/plugin-name
yarn add @organization/plugin-name  
pnpm add @organization/plugin-name

# Development dependencies
npm install --save-dev @organization/plugin-name

# Specific version pinning
npm install @organization/plugin-name@1.2.3
```

### CDN integration examples

#### Modern ESM approach (recommended)

```html
<!-- ES Modules (modern browsers) -->
<script type="module">
  import { Plugin } from 'https://esm.sh/@organization/plugin-name@1.0.0';
  
  const plugin = new Plugin({
    // configuration
  });
</script>
```

#### Traditional UMD approach

```html
<!-- UMD build -->
<script src="https://unpkg.com/@organization/plugin-name@1.0.0/dist/index.umd.min.js"
        integrity="sha384-..."
        crossorigin="anonymous"></script>

<script>
  const plugin = new MyPlugin({
    // configuration
  });
</script>
```

### Framework-specific usage

#### React integration

```javascript
// NPM usage
import { usePlugin } from '@organization/plugin-name';

function MyComponent() {
  const plugin = usePlugin({
    option1: 'value1',
    option2: 'value2'
  });
  
  return <div>{plugin.render()}</div>;
}
```

#### Vue integration

```javascript
// NPM usage
import { createApp } from 'vue';
import Plugin from '@organization/plugin-name';

const app = createApp({});
app.use(Plugin, {
  option1: 'value1',
  option2: 'value2'
});
```

#### Svelte integration

```javascript
// NPM usage
import { Plugin } from '@organization/plugin-name';

export let options = {};
const plugin = new Plugin(options);
```

## Publishing workflow automation

### Complete GitHub Actions workflow

```yaml
name: Release and Publish

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm run test:coverage
      
      - name: Build
        run: npm run build
      
      - name: Security audit
        run: npm audit signatures

  release:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Semantic Release
        uses: cycjimmy/semantic-release-action@v4
        with:
          semantic_version: 24
        env:
          GITHUB_TOKEN: ${{ secrets.ADMIN_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Semantic release configuration

Create `.releaserc.json` for automated versioning:

```json
{
  "branches": [
    "main",
    {"name": "beta", "prerelease": true},
    {"name": "alpha", "prerelease": true}
  ],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {"changelogFile": "CHANGELOG.md"}
    ],
    [
      "@semantic-release/npm",
      {
        "npmPublish": true,
        "tarballDir": "dist"
      }
    ],
    [
      "@semantic-release/github",
      {
        "assets": [
          {"path": "dist/*.tgz", "label": "Distribution"}
        ]
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": [
          "CHANGELOG.md",
          "package.json",
          "package-lock.json"
        ],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ]
  ]
}
```

## Plugin development guide

### Plugin architecture template

Create a robust plugin foundation:

```typescript
// src/index.ts
export interface PluginOptions {
  enabled?: boolean;
  debug?: boolean;
  framework?: 'react' | 'vue' | 'svelte';
  customOptions?: Record<string, any>;
}

export class FrameworkPlugin {
  private options: Required<PluginOptions>;
  
  constructor(options: PluginOptions = {}) {
    this.options = {
      enabled: true,
      debug: false,
      framework: 'react',
      customOptions: {},
      ...options
    };
  }
  
  // Plugin lifecycle methods
  init(): void {
    if (this.options.debug) {
      console.log('Plugin initialized with options:', this.options);
    }
  }
  
  // Framework detection
  detectFramework(): string {
    if (typeof window !== 'undefined') {
      if (window.React) return 'react';
      if (window.Vue) return 'vue';
    }
    return this.options.framework;
  }
  
  // Plugin API methods
  render(): string {
    return `<div>Plugin content for ${this.detectFramework()}</div>`;
  }
  
  destroy(): void {
    // Cleanup logic
  }
}

// Export default and named exports
export default FrameworkPlugin;
export { FrameworkPlugin as Plugin };
```

### TypeScript support configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2015", "DOM", "DOM.Iterable"],
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Development workflow setup

```javascript
// vite.config.dev.js - Development server
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'playground',
  server: {
    port: 3000,
    hot: true,
    open: true
  },
  resolve: {
    alias: {
      '@plugin': resolve(__dirname, 'src/index.ts')
    }
  },
  optimizeDeps: {
    exclude: ['@plugin']
  }
});
```

## Performance optimization strategies

### Bundle size optimization

```javascript
// Advanced Rollup configuration for size optimization
export default defineConfig({
  treeshake: {
    preset: 'smallest',
    manualPureFunctions: ['console.log', 'Object.freeze'],
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    annotations: true
  },
  plugins: [
    // Bundle analysis
    visualizer({
      filename: 'dist/bundle-analysis.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    }),
    
    // Advanced compression
    terser({
      compress: {
        arguments: true,
        booleans_as_integers: true,
        drop_console: true,
        drop_debugger: true,
        passes: 3,
        pure_funcs: ['console.log', 'console.info'],
        reduce_vars: true,
        unsafe: true,
        unsafe_arrows: true,
        unsafe_methods: true
      },
      mangle: {
        safari10: true,
        properties: { regex: /^_/ }
      },
      format: {
        comments: false,
        ascii_only: true
      }
    })
  ]
});
```

### CDN delivery optimization

Create CDN-specific builds with maximum compression:

```javascript
// rollup.config.cdn.js
export default defineConfig({
  input: 'src/index.ts',
  external: ['react', 'vue', 'svelte'],
  output: {
    file: 'dist/index.cdn.min.js',
    format: 'umd',
    name: 'MyPlugin',
    sourcemap: 'hidden',
    compact: true,
    generatedCode: {
      preset: 'es2015',
      arrowFunctions: true,
      constBindings: true,
      objectShorthand: true
    }
  }
});
```

### Performance monitoring

```json
{
  "scripts": {
    "size-check": "size-limit",
    "analyze": "npm run build && npx bundlesize"
  },
  "size-limit": [
    {
      "path": "dist/index.mjs",
      "limit": "50 KB"
    },
    {
      "path": "dist/index.umd.min.js",
      "limit": "75 KB"
    }
  ]
}
```

## Troubleshooting guide

### Common distribution issues

#### Version synchronization problems

**Issue**: Different versions between NPM and CDN
**Solution**: 
```javascript
// Automated version sync check
const packageVersion = require('./package.json').version;
const cdnUrl = `https://unpkg.com/my-plugin@${packageVersion}/dist/index.umd.js`;

// Validate CDN availability
fetch(cdnUrl)
  .then(response => response.ok ? 'CDN sync OK' : 'CDN sync failed')
  .catch(() => 'CDN unavailable');
```

#### Build target conflicts

**Issue**: ES5 vs ES6+ compatibility
**Solution**: Multiple build targets with feature detection

```javascript
// Feature detection fallback
if (typeof Promise === 'undefined') {
  // Load polyfill for older browsers
  require('es6-promise/auto');
}
```

#### Dependency resolution errors

**Issue**: Missing peer dependencies
**Solution**: Clear peer dependency warnings

```json
{
  "peerDependencies": {
    "react": ">=16.8.0 <19.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  }
}
```

### Debugging strategies

#### Development mode features

```javascript
// Debug mode implementation
export class Plugin {
  constructor(options = {}) {
    this.debug = options.debug || process.env.NODE_ENV === 'development';
    
    if (this.debug) {
      console.group('Plugin Debug Information');
      console.log('Options:', options);
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Framework detected:', this.detectFramework());
      console.groupEnd();
    }
  }
}
```

#### Health check utilities

```javascript
// Plugin health check
export function checkPluginHealth() {
  const checks = {
    nodeVersion: process.version,
    hasRequiredDeps: checkDependencies(),
    configValid: validateConfiguration(),
    frameworkDetected: detectFramework()
  };
  
  return {
    healthy: Object.values(checks).every(Boolean),
    details: checks
  };
}
```

## Version management and backward compatibility

### Migration strategies

```javascript
// Version migration utilities
export function migrateConfig(oldConfig, fromVersion) {
  if (semver.lt(fromVersion, '2.0.0')) {
    // Migrate v1 to v2
    return {
      ...oldConfig,
      newOption: oldConfig.deprecatedOption,
      // Remove deprecated options
    };
  }
  return oldConfig;
}
```

### Deprecation warnings

```javascript
// Graceful deprecation handling
function deprecatedMethod() {
  console.warn(
    'DEPRECATED: This method will be removed in v3.0.0. ' +
    'Use newMethod() instead. See migration guide: https://...'
  );
  return newMethod.apply(this, arguments);
}
```

This comprehensive guide provides everything needed to build, distribute, and maintain professional JavaScript framework plugins with modern NPM and CDN distribution. The combination of automated workflows, optimized builds, and comprehensive documentation ensures your plugins can reach maximum adoption while maintaining excellent developer experience across all deployment scenarios.