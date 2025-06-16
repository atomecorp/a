import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],    // Global setup
    // setupFiles: ['./tests/setup.js'], // Temporarily disabled for direct ORM testing
    
    // Test execution
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        'src/**/*.spec.js',
        'node_modules/**',
        'tests/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Output
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-results.html'
    },
    
    // Watch mode
    watch: {
      ignore: ['node_modules/**', 'dist/**']
    },
    
    // Pool options for faster execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
})
