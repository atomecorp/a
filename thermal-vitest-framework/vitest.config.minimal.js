import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment configuration
    environment: 'node',
    
    // Test timeout settings
    testTimeout: 15000, // 15 seconds default timeout
    hookTimeout: 30000, // 30 seconds for setup/teardown hooks
    
    // Test execution settings
    pool: 'forks', // Use forks for better isolation
    poolOptions: {
      forks: {
        singleFork: true // Single fork for better SQLite compatibility
      }
    },
    
    // File patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.git'],
    
    // Reporter configuration
    reporter: ['verbose'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/', 'coverage/']
    },
    
    // Global test settings
    globals: true, // Allow global test functions
    clearMocks: true,
    restoreMocks: true,
    
    // SQLite specific settings
    maxConcurrency: 1, // Prevent SQLite locking issues
    
    // Console output
    silent: false,
    verbose: true
  }
})
