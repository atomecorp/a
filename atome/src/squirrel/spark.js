/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version with static imports for CDN bundling compatibility
 */

import {
  emitPerfEvent,
  perfElapsedMs,
  perfLog,
  perfNowMs
} from '../utils/perf_runtime.js';
import { isIOSDevice, waitForIOSLocalServerReady } from '../utils/ios_runtime.js';
import { loadModulesConcurrently, loadModulesSequentially } from '../utils/module_loader_runtime.js';
import { exposeSparkGlobals } from '../utils/spark_exposure_runtime.js';
import { startPerfCollector } from '../utils/perf_collector_runtime.js';

// Enable and buffer perf events only when the operator opts in (?perf=1). Must run
// before the first emitPerfEvent call so boot stages are captured on window.__squirrelPerf.
startPerfCollector();

const loadSparkServerConfig = async (loadServerConfigOnce) => {
  const start = perfNowMs();
  await loadServerConfigOnce();
  return perfElapsedMs(start);
};

const installSparkDragDropGuards = (target = globalThis?.window) => {
  if (!target?.addEventListener) return;
  target.addEventListener('dragover', (event) => { event.preventDefault(); event.stopPropagation(); });
  target.addEventListener('drop', (event) => { event.preventDefault(); event.stopPropagation(); });
};

const startSparkApplicationLoad = ({
  emitSparkPerf,
  importApplication,
  loadServerConfigMs,
  optionalIntegrationMs,
  sparkBootstrapStartMs
}) => {
  installSparkDragDropGuards();

  let appImported = false;
  const importApplicationOnce = () => {
    if (appImported) return;
    appImported = true;
    const appImportStart = perfNowMs();
    importApplication().then(() => {
      emitSparkPerf('application_import', {
        ok: true,
        totalMs: perfElapsedMs(appImportStart),
        loadServerConfigMs,
        optionalIntegrationMs
      });
    }).catch((error) => {
      emitSparkPerf('application_import', {
        ok: false,
        totalMs: perfElapsedMs(appImportStart),
        loadServerConfigMs,
        optionalIntegrationMs,
        error: String(error?.message || error || '')
      });
    });
  };

  if (!isIOSDevice(globalThis?.navigator)) {
    emitSparkPerf('ready_for_application', {
      totalMs: perfElapsedMs(sparkBootstrapStartMs),
      loadServerConfigMs,
      optionalIntegrationMs,
      isIOS: false
    });
    importApplicationOnce();
    return;
  }

  const iosWaitStart = perfNowMs();
  waitForIOSLocalServerReady().then((ready) => {
    emitSparkPerf('ready_for_application', {
      totalMs: perfElapsedMs(sparkBootstrapStartMs),
      loadServerConfigMs,
      optionalIntegrationMs,
      isIOS: true,
      iosWaitMs: perfElapsedMs(iosWaitStart),
      iosReady: !!ready
    });
    importApplicationOnce();
  });
};

const sparkBootstrapStartMs = perfNowMs();

// Boot waves. Everything inside a wave loads concurrently; waves themselves stay
// ordered, because the later ones read globals the earlier ones install on import.
// The previous shape was a single 20-deep serial waterfall justified by "several
// install runtime side effects on import" -- true for the atome/ai prefix, false
// for the independent domain bootstraps, which now share one round-trip.
const SPARK_BOOT_WAVES = [
  // The atome graph installs the globals every later module reads.
  [
    { id: 'atome.atome', path: './atome/atome.js' },
    { id: 'atome.mcp', path: './atome/mcp.js', critical: true }
  ],
  // default_tools registers into the gateway; the catalog refresh reads both.
  [
    { id: 'ai.agent_gateway', path: './ai/agent_gateway.js', critical: true },
    { id: 'ai.default_tools', path: './ai/default_tools.js', critical: true },
    { id: 'ai.model_catalog_refresh', path: './ai/model_catalog_refresh.js', critical: true }
  ],
  // Independent domains: no import-time reads between them.
  [
    { id: 'security.bootstrap', path: './security/bootstrap.js' },
    { id: 'conditions.bootstrap', path: './conditions/bootstrap.js' },
    { id: 'bank.bootstrap', path: './bank/bootstrap.js' },
    { id: 'calendar.bootstrap', path: './calendar/bootstrap.js' },
    { id: 'contacts.bootstrap', path: './contacts/bootstrap.js' },
    { id: 'mail.bootstrap', path: './mail/bootstrap.js' },
    { id: 'voice.bootstrap', path: './voice/bootstrap.js' }
  ],
  // apis.loader reads what essentials/utils put on window.
  [
    { id: 'apis.essentials', path: './apis/essentials.js', critical: true },
    { id: 'apis.utils', path: './apis/utils.js', critical: true }
  ],
  [
    { id: 'apis.loader', path: './apis/loader.js', critical: true },
    { id: 'apis.shortcut', path: './apis/shortcut.js' },
    { id: 'apis.adole_apis', path: './apis/unified/adole_apis.js', critical: true },
    { id: 'apis.sync_engine', path: './apis/unified/sync_engine.js', critical: true },
    { id: 'apis.loadServerConfig', path: './apis/loadServerConfig.js', critical: true },
    { id: 'apis.dragdrop', path: './apis/dragdrop.js', critical: true },
    { id: 'squirrel.core', path: './squirrel.js', critical: true }
  ]
];

// One table instead of three. Adding a component used to mean editing the module
// list, a destructuring line and a registry assignment; forgetting one produced no
// error, just a component missing from the registry at runtime.
const SPARK_COMPONENT_MODULES = [
  { id: 'components.button', path: './components/button_builder.js', registry: { Button: 'default' } },
  { id: 'components.slider', path: './components/slider_builder.js', registry: { Slider: 'default' } },
  { id: 'components.toolSlider', path: './components/tool_slider_builder.js', registry: { ToolSlider: 'default' } },
  { id: 'components.input', path: './components/input_builder.js', registry: { Input: 'default' } },
  { id: 'components.table', path: './components/table_builder.js', registry: { Table: 'default' } },
  { id: 'components.matrix', path: './components/matrix_builder.js', registry: { Matrix: 'default' } },
  { id: 'components.list', path: './components/list_builder.js', registry: { List: 'default' } },
  { id: 'components.menu', path: './components/menu_builder.js', registry: { Menu: 'default' } },
  {
    id: 'components.unit',
    path: './components/unit_builder.js',
    registry: { Unit: 'default' },
    statics: ['selectUnits', 'getSelectedUnits', 'deleteUnit', 'connectUnits',
      'disconnectUnits', 'getAllConnections', 'getUnit', 'getAllUnits']
  },
  {
    id: 'components.draggable',
    path: './components/draggable_builder.js',
    registry: {
      Draggable: 'default',
      makeDraggable: 'makeDraggable',
      makeDraggableWithDrop: 'makeDraggableWithDrop',
      makeDropZone: 'makeDropZone'
    }
  },
  { id: 'components.badge', path: './components/badge_builder.js', registry: { Badge: 'default' } },
  { id: 'components.dropdown', path: './components/dropdown_builder.js', registry: { dropDown: 'default' } },
  { id: 'components.tooltip', path: './components/tooltip_builder.js', registry: { Tooltip: 'default' } },
  { id: 'components.template', path: './components/template_builder.js', registry: { Template: 'default' } },
  { id: 'components.minimal', path: './components/minimal_builder.js', registry: { Minimal: 'default' } },
  { id: 'components.slice', path: './components/slice_builder.js', registry: { Slice: 'default', createSlice: 'createSlice' } }
];

const kickstartModule = [{ id: 'kickstart', path: './kickstart.js' }];
const applicationEntryModule = [{ id: 'application.index', path: '../application/index.js' }];

const emitSparkPerf = (stage, data = {}) => {
  perfLog(`[Perf] spark.${String(stage || 'stage')}`, data);
  emitPerfEvent(`spark.${String(stage || 'stage')}`, data);
};

const trackModuleLoad = (stage) => ({ moduleId, modulePath, totalMs }) => {
  emitSparkPerf(stage, { ok: true, moduleId, path: modulePath, totalMs });
};

const trackModuleError = (stage) => ({ moduleId, modulePath, totalMs, error }) => {
  emitSparkPerf(stage, {
    ok: false,
    moduleId,
    path: modulePath,
    totalMs,
    error: String(error?.message || error || '')
  });
};

// A wave used to be a `Promise.all`: one optional module failing killed the whole
// batch, and `bootstrapSpark().catch()` then killed the boot. Only modules marked
// `critical` may do that now.
const loadBootWave = async (wave) => {
  const loaded = await loadModulesConcurrently({
    modules: wave,
    baseUrl: import.meta.url,
    logPrefix: '[Squirrel]',
    onModuleLoaded: trackModuleLoad('boot_module'),
    onModuleError: trackModuleError('boot_module'),
    settle: true
  });
  for (const descriptor of wave) {
    if (descriptor.critical && !loaded[descriptor.id]) {
      throw new Error(`critical boot module failed: ${descriptor.id}`);
    }
  }
  return loaded;
};

const readModuleExport = (moduleNamespace, exportName) => (
  exportName === 'default' ? moduleNamespace.default : moduleNamespace[exportName]
);

const buildComponentRegistry = (loadedModules) => {
  const registry = {};
  for (const descriptor of SPARK_COMPONENT_MODULES) {
    const moduleNamespace = loadedModules[descriptor.id];
    if (!moduleNamespace) continue;
    for (const [registryKey, exportName] of Object.entries(descriptor.registry || {})) {
      registry[registryKey] = readModuleExport(moduleNamespace, exportName);
    }
  }
  return registry;
};

const collectComponentStatics = (loadedModules) => {
  const statics = {};
  for (const descriptor of SPARK_COMPONENT_MODULES) {
    const moduleNamespace = loadedModules[descriptor.id];
    if (!moduleNamespace) continue;
    for (const name of descriptor.statics || []) statics[name] = moduleNamespace[name];
  }
  return statics;
};

const bootstrapSpark = async () => {
  const loadedModules = {};
  for (const wave of SPARK_BOOT_WAVES) {
    Object.assign(loadedModules, await loadBootWave(wave));
  }
  Object.assign(loadedModules, await loadBootWave(SPARK_COMPONENT_MODULES));

  const { bootstrapAiModelCatalogRefresh } = loadedModules['ai.model_catalog_refresh'];
  const { AdoleAPI } = loadedModules['apis.adole_apis'];
  const { loadServerConfigOnce } = loadedModules['apis.loadServerConfig'];
  const { installSyncEngine } = loadedModules['apis.sync_engine'];
  const { $, define, observeMutations } = loadedModules['squirrel.core'];

  bootstrapAiModelCatalogRefresh({ env: globalThis?.window || globalThis });

  const squirrelComponentRegistry = buildComponentRegistry(loadedModules);
  squirrelComponentRegistry.DragDrop = loadedModules['apis.dragdrop'].default;

  exposeSparkGlobals({
    AdoleAPI,
    $,
    define,
    observeMutations,
    componentRegistry: squirrelComponentRegistry,
    Unit: squirrelComponentRegistry.Unit,
    unitStaticMethods: collectComponentStatics(loadedModules)
  });

  await loadModulesSequentially({
    modules: kickstartModule,
    baseUrl: import.meta.url,
    logPrefix: '[Squirrel]',
    onModuleLoaded: trackModuleLoad('kickstart_module'),
    onModuleError: trackModuleError('kickstart_module')
  });

  if (typeof window !== 'undefined' && window.__SQUIRREL_VERSION_PROMISE__) {
    await Promise.resolve(window.__SQUIRREL_VERSION_PROMISE__).catch(() => null);
  }

  const runtimeVersions = typeof window !== 'undefined' && window.__SQUIRREL_VERSIONS__
    ? window.__SQUIRREL_VERSIONS__
    : null;

  emitSparkPerf('kickstart_ready', {
    totalMs: perfElapsedMs(sparkBootstrapStartMs),
    atomeVersion: runtimeVersions?.atome || null,
    eveVersion: runtimeVersions?.eve || null
  });

  const loadServerConfigMs = await loadSparkServerConfig(loadServerConfigOnce);
  installSyncEngine(globalThis?.window || globalThis);

  startSparkApplicationLoad({
    emitSparkPerf,
    importApplication: async () => {
      await loadModulesSequentially({
        modules: applicationEntryModule,
        baseUrl: import.meta.url,
        logPrefix: '[Application]',
        onModuleLoaded: trackModuleLoad('application_module'),
        onModuleError: trackModuleError('application_module')
      });
    },
    loadServerConfigMs,
    optionalIntegrationMs: 0,
    sparkBootstrapStartMs
  });
};

bootstrapSpark().catch((error) => {
  console.error('[Squirrel] bootstrap_failed', error);
});
