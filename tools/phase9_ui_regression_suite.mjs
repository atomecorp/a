import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_ui_regression',
    output_file: 'phase9_ui_regression.json',
    tests: [
        'src/application/eVe/tests/strangler_v2/runtime_selection_transform_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_creative_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_transport_capture_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_transport_record_reveal_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_comm_calendar_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_calendar_api_headless.test.mjs',
        'src/application/eVe/tests/strangler_v2/runtime_registered_handler_audit_headless.test.mjs'
    ]
});
