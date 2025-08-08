        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);

/*
 * ios_apis.js
 * High-level JavaScript helpers for iOS & AUv3 bridge.
 * Reuses existing logic from auv3_file_handling.js and audio_swift.js.
 * Each function documents the Swift / iOS API it expects.
 */

(function(global){
    'use strict';

    // ------------------------------------------------------------
    // Environment detection (reuses estDansAUv3 logic idea)
    // ------------------------------------------------------------
    function isAUv3() {
        if (typeof window.webkit !== 'undefined' &&
            typeof window.webkit.messageHandlers !== 'undefined' &&
            typeof window.webkit.messageHandlers.swiftBridge !== 'undefined') {
            return true;
        }
        return false;
    }

    function bridgeAvailable() {
        return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
    }

    function postToSwift(payload) {
        if (bridgeAvailable()) {
            try {
                window.webkit.messageHandlers.swiftBridge.postMessage(payload);
            } catch (e) {
                console.warn('[AUv3API] Failed to post to swiftBridge', e, payload);
            }
        } else {
            console.warn('[AUv3API] swiftBridge not available (probably not in AUv3 extension)', payload);
        }
    }

    // Simple ID generator for callbacks
    let _reqId = 0;
    function nextId(){ return ++_reqId; }

    // Central callback registries for async replies coming from Swift.
    const pendingFileSaves = {};      // id -> {resolve,reject}
    const pendingFileLoads = {};      // id -> {resolve,reject}
    const pendingLists     = {};      // id -> {resolve,reject}
    const tempoCallbacks   = [];      // listeners for tempo updates (pull once)
    const timeCallbacks    = [];      // listeners for timeline updates (stream)
    const hostStateCallbacks = [];    // listeners for host transport state
    const midiCallbacks    = [];      // listeners for midi events

    // Flags to avoid redundant start/stop messages to Swift.
    let timeStreamActive = false;
    let hostStateStreamActive = false;
    let midiStreamActive = false;

    // ------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------
    const API = {};

    // 1. ios_file_saver(file_name, data)
    // Opens a UIDocumentPickerViewController (Swift: iCloudFileManager.saveFileWithDocumentPicker)
    // The Swift side should implement action: 'saveFileWithDocumentPicker' calling:
    //   UIDocumentPickerViewController(forExporting:) to let user choose a location and optionally rename.
    API.ios_file_saver = function ios_file_saver(file_name, data){
        return new Promise((resolve, reject) => {
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();

            // Normalize data to string for transport (Swift expects text / base64 / JSON)
            let serialized;
            if (data instanceof ArrayBuffer) {
                // Convert to base64
                const bytes = new Uint8Array(data);
                let binary = '';
                for (let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                serialized = btoa(binary);
            } else if (typeof data === 'object') {
                serialized = JSON.stringify(data);
            } else {
                serialized = String(data);
            }

            pendingFileSaves[id] = {resolve, reject};

            // Allow user to change name before sending (optional prompt)
            const userName = prompt('Save as (you can change filename):', file_name) || file_name;

            postToSwift({
                action: 'saveFileWithDocumentPicker', // existing Swift method in iCloudFileManager
                requestId: id,
                fileName: userName,
                // Accept any file type: Swift side just exports the temp file; extension decided there
                data: serialized,
                encoding: (data instanceof ArrayBuffer) ? 'base64' : 'utf8'
            });
        });
    };

    // 2. ios_file_loader()
    // Opens UIDocumentPickerViewController(forOpeningContentTypes:) (Swift: iCloudFileManager.loadFileWithDocumentPicker)
    // Can restrict or allow all types (Swift decides mapping). Pass fileTypes array or leave empty for all.
    API.ios_file_loader = function ios_file_loader(fileTypes = ['public.data']){
        return new Promise((resolve, reject) => {
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            pendingFileLoads[id] = {resolve, reject};

            postToSwift({
                action: 'loadFileWithDocumentPicker', // existing Swift method in iCloudFileManager
                requestId: id,
                fileTypes
                // Customization of dialog text/buttons is limited via UIDocumentPicker.
                // Could add extra fields for Swift to display an alert BEFORE the picker if desired.
            });
        });
    };

    // 3. auv3_file_saver(file_name, data)
    // Saves a file in AUv3 sandbox / App Group (Swift FileSystemBridge or iCloudFileManager.saveFile)
    // JS side reuses existing sauvegarderProjetAUv3 if available; else direct message.
    API.auv3_file_saver = function auv3_file_saver(file_name, data){
        return new Promise(async (resolve, reject) => {
            try {
                if (typeof window.sauvegarderProjetAUv3 === 'function') {
                    // Reuse existing higher-level function (it already calls swiftBridge saveFileWithDocumentPicker)
                    await window.sauvegarderProjetAUv3(data, file_name.replace(/\.[^/.]+$/, ''));
                    resolve(true);
                    return;
                }
                if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
                const id = nextId();
                pendingFileSaves[id] = {resolve, reject};
                let serialized = (typeof data === 'object') ? JSON.stringify(data) : String(data);
                postToSwift({
                    action: 'saveProjectInternal', // EXPECTED Swift action (to implement if missing)
                    requestId: id,
                    fileName: file_name,
                    data: serialized
                });
            } catch(e){
                reject(e);
            }
        });
    };

    // 4. auv3_file_list(path?)
    // Lists files from folder via App Group / Documents (Swift: FileSystemBridge.listFiles or AtomeFileSystem.listFiles)
    API.auv3_file_list = function auv3_file_list(path = 'Projects'){
        return new Promise((resolve, reject) => {
            // Prefer existing AtomeFileSystem API if available (main app)
            if (window.AtomeFileSystem && window.AtomeFileSystem.listFiles) {
                window.AtomeFileSystem.listFiles(path, (result) => {
                    if (result.success) resolve(result.data.files);
                    else reject(new Error(result.error || 'List failed'));
                });
                return;
            }
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            pendingLists[id] = {resolve, reject};
            postToSwift({ action: 'listFiles', requestId: id, path }); // EXPECTED Swift action
        });
    };

    // 5. auv3_file_loader(path?, filename?)
    // Loads a file using internal storage (Swift: FileSystemBridge.loadFile or iCloudFileManager.loadFile)
    API.auv3_file_loader = function auv3_file_loader(path = 'Projects', filename){
        return new Promise((resolve, reject) => {
            if (!filename) return reject(new Error('filename required for auv3_file_loader'));
            if (window.AtomeFileSystem && window.AtomeFileSystem.loadProject && path === 'Projects') {
                // Reuse existing bridging (main app context)
                window.AtomeFileSystem.loadProject(filename, (result) => {
                    if (result.success) resolve(result.data);
                    else reject(new Error(result.error || 'Load failed'));
                });
                return;
            }
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            pendingFileLoads[id] = {resolve, reject};
            postToSwift({ action: 'loadFileInternal', requestId: id, path, filename }); // EXPECTED Swift action
        });
    };

    // 6. auv3_tempo()
    // One-shot request for host tempo. Swift should respond with {action:'hostTempo', bpm:Number, requestId}
    // Swift side uses host's AudioUnit hostTempo (e.g., via AUHostMusicalContextBlock).
    API.auv3_tempo = function auv3_tempo(){
        return new Promise((resolve, reject) => {
            if (!bridgeAvailable()) return reject(new Error('swiftBridge not available'));
            const id = nextId();
            tempoCallbacks.push({id, resolve});
            postToSwift({ action: 'requestHostTempo', requestId: id }); // EXPECTED Swift action
        });
    };

    // 7. auv3_current_time(start, format?)
    // start=true  => ask Swift to begin streaming timeline updates
    // start=false => ask Swift to stop streaming
    // format: 'time' (default) or 'samples'. Swift should send periodic messages:
    //   {action:'hostTimeUpdate', positionSeconds, positionSamples, tempo, ppq, playing}
    API.auv3_current_time = function auv3_current_time(start, format='time', callback){
        if (typeof callback === 'function' && timeCallbacks.indexOf(callback) === -1) {
            timeCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !timeStreamActive) {
            timeStreamActive = true;
            postToSwift({ action: 'startHostTimeStream', format }); // EXPECTED Swift action
        } else if (!start && timeStreamActive) {
            timeStreamActive = false;
            postToSwift({ action: 'stopHostTimeStream' }); // EXPECTED Swift action
        }
    };

    // 8. auv3_host_state(start)
    // Toggles reception of host play/stop events. Swift should send messages:
    //   {action:'hostTransport', playing:true/false, positionSeconds}
    API.auv3_host_state = function auv3_host_state(start, callback){
        if (typeof callback === 'function' && hostStateCallbacks.indexOf(callback) === -1) {
            hostStateCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !hostStateStreamActive) {
            hostStateStreamActive = true;
            postToSwift({ action: 'startHostStateStream' }); // EXPECTED Swift action
        } else if (!start && hostStateStreamActive) {
            hostStateStreamActive = false;
            postToSwift({ action: 'stopHostStateStream' }); // EXPECTED Swift action
        }
    };

    // 9. auv3_midi_receive(start)
    // Swift should stream MIDI as either structured or raw packets:
    //   {action:'midiEvent', status, data1, data2, timestamp} OR {action:'midiEventRaw', bytes:[...]}
    API.auv3_midi_receive = function auv3_midi_receive(start, callback){
        if (typeof callback === 'function' && midiCallbacks.indexOf(callback) === -1) {
            midiCallbacks.push(callback);
        }
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        if (start && !midiStreamActive) {
            midiStreamActive = true;
            postToSwift({ action: 'startMidiStream' }); // EXPECTED Swift action
        } else if (!start && midiStreamActive) {
            midiStreamActive = false;
            postToSwift({ action: 'stopMidiStream' }); // EXPECTED Swift action
        }
    };

    // 10. auv3_midi_send(midi_data)
    // Sends MIDI data to Swift (which injects into AU MIDI output). midi_data can be:
    //  - Array of bytes [status, data1, data2]
    //  - Object {status, data1, data2}
    API.auv3_midi_send = function auv3_midi_send(midi_data){
        if (!bridgeAvailable()) return console.warn('swiftBridge not available');
        let bytes;
        if (Array.isArray(midi_data)) bytes = midi_data;
        else if (midi_data && typeof midi_data === 'object') bytes = [midi_data.status, midi_data.data1, midi_data.data2];
        else return console.warn('Invalid midi_data');
        postToSwift({ action: 'sendMidi', bytes }); // EXPECTED Swift action
    };

    // ------------------------------------------------------------
    // Incoming messages entry point (Swift -> JS)
    // Swift should call: window.AUv3API._receiveFromSwift(jsonPayload)
    // ------------------------------------------------------------
    API._receiveFromSwift = function _receiveFromSwift(msg){
        try {
            if (typeof msg === 'string') msg = JSON.parse(msg);
        } catch(e){ console.warn('Invalid JSON from Swift', msg); return; }
        if (!msg || typeof msg !== 'object') return;

        switch(msg.action){
            case 'saveFileWithDocumentPickerResult': {
                const cb = pendingFileSaves[msg.requestId];
                if (cb){
                    delete pendingFileSaves[msg.requestId];
                    msg.success ? cb.resolve(true) : cb.reject(new Error(msg.error||'Save failed'));
                }
                break;
            }
            case 'loadFileWithDocumentPickerResult': {
                const cb = pendingFileLoads[msg.requestId];
                if (cb){
                    delete pendingFileLoads[msg.requestId];
                    if (msg.success){
                        cb.resolve({ fileName: msg.fileName, data: msg.data, encoding: msg.encoding||'utf8' });
                    } else cb.reject(new Error(msg.error||'Load failed'));
                }
                break;
            }
            case 'listFilesResult': {
                const cb = pendingLists[msg.requestId];
                if (cb){
                    delete pendingLists[msg.requestId];
                    msg.success ? cb.resolve(msg.files||[]) : cb.reject(new Error(msg.error||'List failed'));
                }
                break;
            }
            case 'hostTempo': {
                // Resolve all pending tempo promises matching requestId
                for (let i=tempoCallbacks.length-1;i>=0;i--){
                    if (tempoCallbacks[i].id === msg.requestId){
                        tempoCallbacks[i].resolve(msg.bpm);
                        tempoCallbacks.splice(i,1);
                    }
                }
                break;
            }
            case 'hostTimeUpdate': {
                // Broadcast to registered callbacks
                timeCallbacks.forEach(fn => { try { fn(msg); } catch(_){} });
                break;
            }
            case 'hostTransport': {
                hostStateCallbacks.forEach(fn => { try { fn(msg); } catch(_){} });
                break;
            }
            case 'midiEvent': {
                midiCallbacks.forEach(fn => { try { fn({ type:'parsed', status:msg.status, data1:msg.data1, data2:msg.data2, timestamp:msg.timestamp }); } catch(_){} });
                break;
            }
            case 'midiEventRaw': {
                midiCallbacks.forEach(fn => { try { fn({ type:'raw', bytes:msg.bytes, timestamp:msg.timestamp }); } catch(_){} });
                break;
            }
            default:
                console.log('[AUv3API] Unhandled message from Swift:', msg);
        }
    };

    // Expose globally
    global.AUv3API = API;

})(window);

// NOTE: Removed accidental duplicate file at examples/examples/ios_apis.js. Keep only examples/ios_apis.js as canonical.
// ------------------------------------------------------------
// Usage Examples (see separate examples/examples/ios_apis.js if retained)
// ------------------------------------------------------------
// See separate examples file for live usage patterns.
