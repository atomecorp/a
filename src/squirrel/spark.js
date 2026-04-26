/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version with static imports for CDN bundling compatibility
 */

import '../utils/console_silencer.js';
import {
  emitPerfEvent,
  perfElapsedMs,
  perfLog,
  perfNowMs
} from '../utils/perf_runtime.js';
import { clearStaleSessionUI } from '../utils/session_ui_cleaner.js';
import {
  initializeSparkOptionalIntegrations,
  loadSparkServerConfig,
  migrateLegacyCloudAuthToken,
  startSparkApplicationLoad
} from '../utils/spark_bootstrap_runtime.js';
import { loadModulesSequentially } from '../utils/module_loader_runtime.js';
import { exposeSparkGlobals } from '../utils/spark_exposure_runtime.js';
import { installWebViewErrorGuards } from '../utils/webview_guards.js';

const sparkBootstrapStartMs = perfNowMs();

const sparkBootModules = [
  { id: 'atome.atome', path: './atome/atome.js' },
  { id: 'atome.mcp', path: './atome/mcp.js' },
  { id: 'ai.agent_gateway', path: './ai/agent_gateway.js' },
  { id: 'ai.default_tools', path: './ai/default_tools.js' },
  { id: 'ai.model_catalog_refresh', path: './ai/model_catalog_refresh.js' },
  { id: 'dev.dev_console', path: './dev/dev_console.js' },
  { id: 'security.bootstrap', path: './security/bootstrap.js' },
  { id: 'observability.bootstrap', path: './observability/bootstrap.js' },
  { id: 'bank.bootstrap', path: './bank/bootstrap.js' },
  { id: 'calendar.bootstrap', path: './calendar/bootstrap.js' },
  { id: 'contacts.bootstrap', path: './contacts/bootstrap.js' },
  { id: 'mail.bootstrap', path: './mail/bootstrap.js' },
  { id: 'voice.bootstrap', path: './voice/bootstrap.js' },
  { id: 'apis.essentials', path: './apis/essentials.js' },
  { id: 'apis.utils', path: './apis/utils.js' },
  { id: 'apis.loader', path: './apis/loader.js' },
  { id: 'apis.shortcut', path: './apis/shortcut.js' },
  { id: 'apis.adole_apis', path: './apis/unified/adole_apis.js' },
  { id: 'apis.loadServerConfig', path: './apis/loadServerConfig.js' },
  { id: 'apis.dragdrop', path: './apis/dragdrop.js' },
  { id: 'squirrel.core', path: './squirrel.js' },
  { id: 'components.button', path: './components/button_builder.js' },
  { id: 'components.slider', path: './components/slider_builder.js' },
  { id: 'components.table', path: './components/table_builder.js' },
  { id: 'components.matrix', path: './components/matrix_builder.js' },
  { id: 'components.list', path: './components/List_builder.js' },
  { id: 'components.menu', path: './components/menu_builder.js' },
  { id: 'components.console', path: './components/console_builder.js' },
  { id: 'components.unit', path: './components/unit_builder.js' },
  { id: 'components.draggable', path: './components/draggable_builder.js' },
  { id: 'components.badge', path: './components/badge_builder.js' },
  { id: 'components.dropdown', path: './components/dropDown_builder.js' },
  { id: 'components.tooltip', path: './components/tooltip_builder.js' },
  { id: 'components.template', path: './components/template_builder.js' },
  { id: 'components.minimal', path: './components/minimal_builder.js' },
  { id: 'components.slice', path: './components/slice_builder.js' },
  { id: 'default.shortcuts', path: './default/shortcuts.js' },
  { id: 'integrations.iplug_web', path: './integrations/iplug_web.js' },
  { id: 'apis.unified_sync', path: './apis/unified/UnifiedSync.js' }
];

const kickstartModule = [{ id: 'kickstart', path: './kickstart.js' }];
const applicationEntryModule = [{ id: 'application.index', path: '../application/index.js' }];

const squirrelComponentRegistry = {
};

const emitSparkPerf = (stage, data = {}) => {
  perfLog(`[Perf] spark.${String(stage || 'stage')}`, data);
  emitPerfEvent(`spark.${String(stage || 'stage')}`, data);
};

const trackModuleLoad = (stage) => ({ moduleId, modulePath, totalMs }) => {
  emitSparkPerf(stage, {
    ok: true,
    moduleId,
    path: modulePath,
    totalMs
  });
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

// Legacy overlay layer removed.

const bootstrapSpark = async () => {
  installWebViewErrorGuards();
  clearStaleSessionUI();

  const loadedModules = await loadModulesSequentially({
    modules: sparkBootModules,
    baseUrl: import.meta.url,
    logPrefix: '[Squirrel]',
    onModuleLoaded: trackModuleLoad('boot_module'),
    onModuleError: trackModuleError('boot_module')
  });

  const { bootstrapAiModelCatalogRefresh } = loadedModules['ai.model_catalog_refresh'];
  const { AdoleAPI } = loadedModules['apis.adole_apis'];
  const { loadServerConfigOnce } = loadedModules['apis.loadServerConfig'];
  const DragDrop = loadedModules['apis.dragdrop'].default;
  const { $, define, observeMutations } = loadedModules['squirrel.core'];
  const Button = loadedModules['components.button'].default;
  const Slider = loadedModules['components.slider'].default;
  const Table = loadedModules['components.table'].default;
  const Matrix = loadedModules['components.matrix'].default;
  const List = loadedModules['components.list'].default;
  const Menu = loadedModules['components.menu'].default;
  const Console = loadedModules['components.console'].default;
  const UnitModule = loadedModules['components.unit'];
  const DraggableModule = loadedModules['components.draggable'];
  const Badge = loadedModules['components.badge'].default;
  const dropDown = loadedModules['components.dropdown'].default;
  const Tooltip = loadedModules['components.tooltip'].default;
  const Template = loadedModules['components.template'].default;
  const Minimal = loadedModules['components.minimal'].default;
  const SliceModule = loadedModules['components.slice'];
  const initIPlugWeb = loadedModules['integrations.iplug_web'].default;
  const UnifiedSync = loadedModules['apis.unified_sync'].default;

  const Unit = UnitModule.default;
  const {
    selectUnits,
    getSelectedUnits,
    deleteUnit,
    connectUnits,
    disconnectUnits,
    getAllConnections,
    getUnit,
    getAllUnits
  } = UnitModule;
  const {
    default: Draggable,
    makeDraggable,
    makeDraggableWithDrop,
    makeDropZone
  } = DraggableModule;
  const {
    default: Slice,
    createSlice
  } = SliceModule;

  bootstrapAiModelCatalogRefresh({ env: globalThis?.window || globalThis });

  squirrelComponentRegistry.Button = Button;
  squirrelComponentRegistry.Slider = Slider;
  squirrelComponentRegistry.Table = Table;
  squirrelComponentRegistry.Matrix = Matrix;
  squirrelComponentRegistry.List = List;
  squirrelComponentRegistry.Menu = Menu;
  squirrelComponentRegistry.Console = Console;
  squirrelComponentRegistry.Unit = Unit;
  squirrelComponentRegistry.Draggable = Draggable;
  squirrelComponentRegistry.makeDraggable = makeDraggable;
  squirrelComponentRegistry.makeDraggableWithDrop = makeDraggableWithDrop;
  squirrelComponentRegistry.makeDropZone = makeDropZone;
  squirrelComponentRegistry.Badge = Badge;
  squirrelComponentRegistry.dropDown = dropDown;
  squirrelComponentRegistry.Tooltip = Tooltip;
  squirrelComponentRegistry.Template = Template;
  squirrelComponentRegistry.Minimal = Minimal;
  squirrelComponentRegistry.Slice = Slice;
  squirrelComponentRegistry.createSlice = createSlice;
  squirrelComponentRegistry.DragDrop = DragDrop;

  const unitStaticMethods = {
    selectUnits,
    getSelectedUnits,
    deleteUnit,
    connectUnits,
    disconnectUnits,
    getAllConnections,
    getUnit,
    getAllUnits
  };

  exposeSparkGlobals({
    AdoleAPI,
    $,
    define,
    observeMutations,
    componentRegistry: squirrelComponentRegistry,
    Unit,
    unitStaticMethods
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

  // Token key migration (legacy -> current)
  // Some older builds stored the Fastify JWT under 'auth_token'. The unified Fastify adapter
  // expects 'cloud_auth_token'. Copy once to avoid breaking current_user(), projects, etc.
  migrateLegacyCloudAuthToken();

  // Toggle optional integrations once core runtime is ready
  const optionalIntegrationMs = initializeSparkOptionalIntegrations({ initIPlugWeb, UnifiedSync });

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
    optionalIntegrationMs,
    sparkBootstrapStartMs
  });
};

bootstrapSpark().catch((error) => {
  console.error('❌ Spark bootstrap error:', error);
});
