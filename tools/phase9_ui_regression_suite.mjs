import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_ui_regression',
    output_file: 'phase9_ui_regression.json',
    tests: [
        'src/application/eVe/tests/strangler_v2/runtime.test.mjs',
        'src/application/eVe/tests/strangler_v2/gateway.test.mjs',
        'src/application/eVe/tests/strangler_v2/command_bus_history.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_selection_explicit_target_precedence.test.mjs',
        'src/application/eVe/tests/strangler_v2/panel_actions_undo_consistency.test.mjs'
    ]
});
