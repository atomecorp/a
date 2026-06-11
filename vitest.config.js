import { defineConfig } from 'vitest/config';

// Without this config, vitest sweeps every *.test.* file in the repository,
// including the full application copies embedded in iOS/Tauri build artifacts,
// which exhausts memory before the real suites finish.
export default defineConfig({
    test: {
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            'platforms/**',
            'temp/**',
            'done/**',
            'todo/**',
            'Failed/**',
            'logs/**',
            'database_storage/**',
            'atome/renderers/**',
            '**/build/**',
            '**/target/**'
        ]
    }
});
