import { defineConfig } from 'vite'

export default defineConfig({
  // Build configuration for testing
  build: {
    target: 'node14',
    lib: {
      entry: 'src/index.js',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['objection', 'knex', 'sqlite3']
    }
  },
  
  // Development server (not used in testing but good to have)
  server: {
    port: 3000
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
      '@database': '/src/database',
      '@tests': '/tests'
    }
  },
  
  // Plugins for testing environment
  plugins: [],
  
  // Environment variables
  define: {
    __TEST__: true
  },
  
  // ESBuild configuration for faster builds
  esbuild: {
    target: 'node14'
  }
})
