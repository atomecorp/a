import { runSuite } from './phase9_suite_lib.mjs';

runSuite({
    suite_name: 'phase9_mcp_runtime_alignment',
    output_file: 'phase9_mcp_runtime_alignment.json',
    tests: [
        'src/squirrel/atome/mcp.runtime_bridge.test.mjs',
        'src/squirrel/atome/mcp.platform_surface.test.mjs',
        'src/squirrel/atome/mcp.security_surface.test.mjs',
        'src/squirrel/ai/default_tools.runtime_bridge.test.mjs'
    ]
});
