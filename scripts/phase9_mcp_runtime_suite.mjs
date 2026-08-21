import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_mcp_runtime_alignment',
    output_file: 'phase9_mcp_runtime_alignment.json',
    tests: [
        'tests/atome/src/squirrel/atome/mcp.runtime_bridge.probe.mjs',
        'tests/atome/src/squirrel/atome/mcp.platform_surface.probe.mjs',
        'tests/atome/src/squirrel/atome/mcp.security_surface.probe.mjs',
        'tests/atome/src/squirrel/ai/default_tools.runtime_bridge.probe.mjs'
    ]
});
