import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_voice_interrupt',
    output_file: 'phase9_voice_interrupt.json',
    tests: [
        'src/squirrel/voice/session_runtime.test.mjs',
        'src/squirrel/voice/service.test.mjs',
        'src/squirrel/voice/interrupt_integration.test.mjs',
        'src/squirrel/voice/panel_interrupt_real_path.test.mjs',
        'src/squirrel/voice/priority_flows.test.mjs'
    ]
});
