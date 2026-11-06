// Registry projection of what the MCP door reaches (cahier V1.2 §5.3), the facts behind each tool's `exposure`
// (registry_annotate.mjs#annotateExposure):
// - loads: for each module that registers a runtime tool, whether the page has imported it when an MCP caller arrives:
//   at boot (`boot`: the static imports of eVe/eve_boot_modules.js, the lists eVe.js#startEve loads), on the first MCP
//   discovery or call (`mcp_loader`: the static imports of the modules the loaders handed to
//   mcp_bridges.js#registerMcpToolModules import, MCP_LOADER_FILES), only on a lazy path of the interface
//   (`lazy`: a dynamic import nothing above takes) or never (`unreached`). Read from the import graph (esbuild metafile,
//   no bundle written): an import statement runs with its importer, a dynamic import is a lazy path.
// - surfaces: for each door × name (`method:`, `runtime:`, `ai:`), the surfaces the access policy opens, by the checks
//   discovery applies (mcp_discovery.js#listUnifiedMcpTools): policy allowed, capabilities, sandbox profile. The person
//   is the `ui` transport, the assistant the `ai` one, a program the actor of a program granted every family.
import path from 'node:path';
import * as esbuild from 'esbuild';
import { ROOT } from './registry_paths.mjs';

const at = file => import(`${ROOT}/${file}`);
const BOOT_FILE = 'eVe/eve_boot_modules.js';
// The files of the loaders registered with mcp_bridges.js#registerMcpToolModules; each loads the dynamic imports of its file:
// panel_definitions.js#ensureAllToolModules (registered by eVeIntuition.js), bootstrap.js#loadDeferredIntuitionRuntime.
const MCP_LOADER_FILES = Object.freeze(['eVe/intuition/panel_definitions.js', 'eVe/intuition/bootstrap.js']);
const SECURITY_DIR = 'atome/src/squirrel/atome';
export const EXPOSURE_SURFACES = Object.freeze(['ai', 'person', 'program']);
// Imports the graph does not follow: URLs served by the app (but /eVe/, resolved first), platform builtins.
const EXTERNAL = /^(https?:|node:|\/)/;
const ASSET_LOADERS = Object.fromEntries(['.wasm', '.png', '.jpg', '.svg', '.css', '.mp3', '.wav', '.ttf', '.woff2'].map(ext => [ext, 'empty']));

async function importGraph(entryPoints) {
    const result = await esbuild.build({ absWorkingDir: ROOT, entryPoints, bundle: true, splitting: true, format: 'esm', platform: 'browser',
        outdir: 'temp/registry_graph', write: false, metafile: true, logLevel: 'silent', loader: ASSET_LOADERS,
        plugins: [{ name: 'registry-graph', setup(build) {
            build.onResolve({ filter: /^\/eVe\// }, args => ({ path: path.join(ROOT, args.path) }));
            build.onResolve({ filter: EXTERNAL }, args => ({ path: args.path, external: true }));
        } }] });
    return result.metafile.inputs;
}

const staticClosure = (inputs, roots) => {
    const seen = new Set(), queue = [...roots];
    while (queue.length) {
        const file = queue.pop();
        if (seen.has(file) || !inputs[file]) continue;
        seen.add(file);
        inputs[file].imports.filter(edge => edge.kind === 'import-statement' && !edge.external).forEach(edge => queue.push(edge.path));
    }
    return seen;
};

async function projectLoads(ownerFiles) {
    const boot = await at(BOOT_FILE);
    const roots = [...boot.EVE_CONCURRENT_MODULES, ...boot.EVE_SEQUENTIAL_MODULES].map(module => path.posix.join('eVe', module.path));
    const inputs = await importGraph(roots);
    const booted = staticClosure(inputs, roots);
    const lazyModules = MCP_LOADER_FILES.flatMap((file) => {
        if (!booted.has(file)) throw new Error(`registry_mcp_loader_not_booted:${file}`);
        const loaded = inputs[file].imports.filter(edge => edge.kind === 'dynamic-import').map(edge => edge.path);
        if (!loaded.length) throw new Error(`registry_mcp_loader_loads_nothing:${file}`);
        return loaded;
    });
    const mcpLoaded = staticClosure(inputs, lazyModules);
    const loadOf = file => (booted.has(file) ? 'boot' : mcpLoaded.has(file) ? 'mcp_loader' : inputs[file] ? 'lazy' : 'unreached');
    return Object.fromEntries([...ownerFiles].sort().map(file => [file, loadOf(file)]));
}

async function projectSurfaces({ methods, runtimeTools }) {
    const { resolveAccessPolicy } = await at(`${SECURITY_DIR}/mcp_security_policy.js`);
    const { resolveTransportActor } = await at(`${SECURITY_DIR}/mcp_transport.js`);
    const { programGrantActor, listMcpGrantFamilies } = await at(`${SECURITY_DIR}/mcp_surface_grants.js`);
    const { hasActorCapability, hasSandboxProfile } = await at(`${SECURITY_DIR}/mcp_security.js`);
    const { AgentGateway } = await at('atome/src/squirrel/ai/agent_gateway.js');
    const actors = {
        ai: resolveTransportActor({ source: { type: 'ai', layer: 'registry' } }),
        person: resolveTransportActor({ source: { type: 'ui', layer: 'registry' } }),
        program: programGrantActor('remote_program:registry', listMcpGrantFamilies())
    };
    const open = policy => EXPOSURE_SURFACES.filter(surface => policy.allowed === true
        && hasActorCapability(actors[surface], policy.required_capabilities) && hasSandboxProfile(actors[surface], policy.sandbox_profile));
    return Object.fromEntries([
        ...[...methods].map(name => [`method:${name}`, open(resolveAccessPolicy(name, {}))]),
        ...[...runtimeTools].map(toolId => [`runtime:${toolId}`, open(resolveAccessPolicy('runtime.tools.call', { tool_id: toolId }))]),
        ...AgentGateway.listTools().map(tool => [`ai:${tool.name}`, open(resolveAccessPolicy('ai.tools.call', { tool_name: tool.name }, { aiTool: tool }))])
    ].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** `tools`: every tool_definition candidate (projected, bound, declared); `methods`: every method of the MCP entry. */
export async function projectToolExposure({ tools, methods }) {
    const runtime = tools.filter(entry => entry.registry !== 'agent_gateway');
    const exposure = {
        loads: await projectLoads(new Set(runtime.map(entry => entry.owner))),
        surfaces: await projectSurfaces({ methods, runtimeTools: new Set(runtime.map(entry => entry.native_id)) })
    };
    return { owner: [BOOT_FILE, ...MCP_LOADER_FILES, `${SECURITY_DIR}/mcp_security_policy.js`].join(' + '), entries: [], relations: [], findings: [], exposure };
}
