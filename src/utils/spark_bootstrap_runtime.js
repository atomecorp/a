import { isIOSDevice, waitForIOSLocalServerReady } from './ios_runtime.js';
import { perfElapsedMs, perfNowMs } from './perf_runtime.js';

export const loadSparkServerConfig = async (loadServerConfigOnce) => {
    try {
        const loadServerConfigStart = perfNowMs();
        const config = await loadServerConfigOnce();
        const loadServerConfigMs = perfElapsedMs(loadServerConfigStart);

        return loadServerConfigMs;
    } catch (error) {
        return 0;
    }
};

export const migrateLegacyCloudAuthToken = (storage = globalThis?.localStorage) => {
    if (!storage) return;

    try {
        const cloudToken = storage.getItem('cloud_auth_token');
        const legacyToken = storage.getItem('auth_token');

        if ((!cloudToken || cloudToken.length < 10) && legacyToken && legacyToken.length > 10) {
            storage.setItem('cloud_auth_token', legacyToken);
        }
    } catch (error) {
    }
};

export const initializeSparkOptionalIntegrations = ({ initIPlugWeb, UnifiedSync }) => {
    const optionalIntegrationStart = perfNowMs();

    try {
        initIPlugWeb();
    } catch (error) {
    }

    try {
        UnifiedSync.init({ autoConnect: true });
    } catch (error) {
    }

    return perfElapsedMs(optionalIntegrationStart);
};

export const installSparkDragDropGuards = (target = globalThis?.window) => {
    if (!target?.addEventListener) return;

    target.addEventListener('dragover', function onDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
    });

    target.addEventListener('drop', function onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
    });
};

const createApplicationImporter = ({
    emitSparkPerf,
    importApplication,
    loadServerConfigMs,
    optionalIntegrationMs,
    target = globalThis?.window
}) => {
    let appImported = false;

    return () => {
        if (appImported) return;
        appImported = true;

        const appImportStart = perfNowMs();
        importApplication().catch((error) => {
            emitSparkPerf('application_import', {
                ok: false,
                totalMs: perfElapsedMs(appImportStart),
                loadServerConfigMs,
                optionalIntegrationMs,
                error: String(error?.message || error || '')
            });
        }).then(() => {
            emitSparkPerf('application_import', {
                ok: true,
                totalMs: perfElapsedMs(appImportStart),
                loadServerConfigMs,
                optionalIntegrationMs
            });
        });
    };
};

export const startSparkApplicationLoad = ({
    emitSparkPerf,
    importApplication,
    loadServerConfigMs,
    optionalIntegrationMs,
    sparkBootstrapStartMs,
    target = globalThis?.window
}) => {
    installSparkDragDropGuards(target);

    const importApplicationOnce = createApplicationImporter({
        emitSparkPerf,
        importApplication,
        loadServerConfigMs,
        optionalIntegrationMs,
        target
    });

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
        const iosWaitMs = perfElapsedMs(iosWaitStart);

        emitSparkPerf('ready_for_application', {
            totalMs: perfElapsedMs(sparkBootstrapStartMs),
            loadServerConfigMs,
            optionalIntegrationMs,
            isIOS: true,
            iosWaitMs,
            iosReady: !!ready
        });
        importApplicationOnce();
    });
};