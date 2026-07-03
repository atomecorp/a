import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_voice_interrupt',
    output_file: 'phase9_voice_interrupt.json',
    tests: [
        'tests/atome/src/squirrel/voice/session_runtime.test.mjs',
        'tests/atome/src/squirrel/voice/service.test.mjs',
        'tests/atome/src/squirrel/voice/interrupt_integration.test.mjs',
        'tests/atome/src/squirrel/voice/panel_interrupt_real_path.test.mjs',
        'tests/atome/src/squirrel/voice/priority_flows.test.mjs'
    ]
});
