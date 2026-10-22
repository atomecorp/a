import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Firebase Test Lab through its REST APIs, with the same service account as App
// Distribution (roles: Firebase Test Lab Admin, Storage Object Admin). A Robo test
// installs the APK on physical phones, launches it and explores it; each device
// leaves its logcat, screenshots and video in the Test Lab results bucket.
const TESTING = 'https://testing.googleapis.com/v1';
const TOOL_RESULTS = 'https://toolresults.googleapis.com/toolresults/v1beta3';
const STORAGE = 'https://storage.googleapis.com';

export function createTestLabClient({ authorize, projectId, request = fetch }) {
    async function call(method, url, { json, file, raw = false } = {}) {
        const headers = { authorization: `Bearer ${await authorize()}` };
        let body;
        if (file) {
            Object.assign(headers, { 'content-type': 'application/vnd.android.package-archive', 'content-length': String((await stat(file)).size) });
            body = createReadStream(file);
        } else if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
        const response = await request(url, { method, headers, body, redirect: 'error', ...(file ? { duplex: 'half' } : {}) });
        if (!response.ok) {
            const text = await response.text();
            let detail = text.slice(0, 300);
            try { detail = JSON.parse(text).error?.message || detail; } catch { /* plain-text error body */ }
            throw new Error(`Test Lab ${method} ${new URL(url).pathname.split('/').slice(-2).join('/')} failed (${response.status}): ${detail}`);
        }
        return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
    }
    return {
        defaultBucket: async () => (await call('POST', `${TOOL_RESULTS}/projects/${projectId}:initializeSettings`)).defaultBucket,
        upload: (bucket, name, file) => call('POST', `${STORAGE}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`, { file }),
        catalog: () => call('GET', `${TESTING}/testEnvironmentCatalog/ANDROID?projectId=${projectId}`),
        createMatrix: (matrix) => call('POST', `${TESTING}/projects/${projectId}/testMatrices`, { json: matrix }),
        matrix: (id) => call('GET', `${TESTING}/projects/${projectId}/testMatrices/${id}`),
        list: (bucket, prefix) => call('GET', `${STORAGE}/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`),
        download: (bucket, name) => call('GET', `${STORAGE}/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, { raw: true })
    };
}

// Physical phones only, one per GPU family when the catalog offers it: Samsung
// Exynos/Xclipse or Mali, Samsung Snapdragon/Adreno, Google Tensor/Mali.
export function pickDevices(catalog, wanted = ['samsung', 'google', 'xiaomi'], count = 3) {
    const phones = (catalog.androidDeviceCatalog?.models || [])
        .filter(model => model.form === 'PHYSICAL' && model.formFactor === 'PHONE' && model.supportedVersionIds?.length);
    const newest = model => [...model.supportedVersionIds].sort((a, b) => Number(b) - Number(a))[0];
    const picked = [];
    for (const brand of wanted) {
        const candidates = phones.filter(model => model.brand?.toLowerCase() === brand && Number(newest(model)) >= 31)
            .sort((a, b) => Number(newest(b)) - Number(newest(a)));
        for (const model of candidates.slice(0, brand === 'samsung' ? 2 : 1)) {
            if (picked.length < count && !picked.some(entry => entry.androidModelId === model.id)) {
                picked.push({ androidModelId: model.id, androidVersionId: newest(model), locale: 'fr', orientation: 'portrait', name: `${model.manufacturer} ${model.name}` });
            }
        }
    }
    return picked;
}

export async function runTestLab({ client, apk, outputDirectory, log, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), devices }) {
    const bucket = await client.defaultBucket();
    if (!bucket) throw new Error('Test Lab returned no default results bucket');
    const runId = `atome-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    log(`Uploading ${path.basename(apk)} to gs://${bucket}/${runId}/`);
    await client.upload(bucket, `${runId}/application.apk`, apk);
    const chosen = devices || pickDevices(await client.catalog());
    if (!chosen.length) throw new Error('No physical Android phone available in the Test Lab catalog');
    log(`Devices: ${chosen.map(device => `${device.name} (API ${device.androidVersionId})`).join(', ')}`);
    let matrix = await client.createMatrix({
        testSpecification: { androidRoboTest: { appApk: { gcsPath: `gs://${bucket}/${runId}/application.apk` } }, testTimeout: '300s' },
        environmentMatrix: { androidDeviceList: { androidDevices: chosen.map(({ name, ...device }) => device) } },
        resultStorage: { googleCloudStorage: { gcsPath: `gs://${bucket}/${runId}/results` } }
    });
    for (let attempt = 0; !['FINISHED', 'ERROR', 'INVALID'].includes(matrix.state); attempt++) {
        if (attempt >= 180) throw new Error(`Test Lab matrix ${matrix.testMatrixId} still ${matrix.state} after 30 minutes`);
        await sleep(10000);
        matrix = await client.matrix(matrix.testMatrixId);
    }
    if (matrix.state !== 'FINISHED') throw new Error(`Test Lab matrix ${matrix.state}: ${matrix.invalidMatrixDetails || ''}`);
    await mkdir(outputDirectory, { recursive: true });
    const objects = (await client.list(bucket, `${runId}/results/`)).items || [];
    const kept = objects.filter(item => /logcat$|\.png$|\.mp4$/.test(item.name));
    for (const item of kept) {
        const target = path.join(outputDirectory, item.name.slice(`${runId}/results/`.length).replace(/\//g, '__'));
        await writeFile(target, await client.download(bucket, item.name));
    }
    log(`Results: ${kept.length} files in ${outputDirectory}`);
    return { matrix, bucket, runId, devices: chosen, files: kept.map(item => item.name),
        outcomes: matrix.testExecutions?.map(execution => ({ device: execution.environment?.androidDevice?.androidModelId, state: execution.state })) };
}
