import {defineConfig} from 'vitest/config';
// Scoped Node tests need no browser globals. The repository-wide setup file is currently absent.
export default defineConfig({test:{maxWorkers:2,include:[
 'tests/eve/wake_preferences.test.mjs','tests/eve/wake_runtime.test.mjs','tests/eve/wake_porcupine.test.mjs','tests/eve/assistant_routing.test.mjs',
 'tests/eve/assistant_session_controller.test.mjs','tests/eve/assistant_voice_runtime.test.mjs'
]}});
