import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_voice_interrupt',
    output_file: 'phase9_voice_interrupt.json',
    tests: [
        'tests/atome/src/squirrel/voice/session_runtime.probe.mjs',
        'tests/atome/src/squirrel/voice/service.probe.mjs',
        'tests/atome/src/squirrel/voice/interrupt_integration.probe.mjs',
        'tests/atome/src/squirrel/voice/panel_interrupt_real_path.probe.mjs',
        'tests/atome/src/squirrel/voice/priority_flows.probe.mjs'
    ]
});
