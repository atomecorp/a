import WebKit

extension FileSystemBridge {
    func addFileSystemAPI(to webView: WKWebView) {
        webView.configuration.userContentController.add(self, name: "fileSystem")

        let jsAPI = """
        window.AtomeFileSystem = {
            saveFile: function(path, data, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'saveFile',
                    path: path,
                    data: data
                });
            },

            loadFile: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'loadFile',
                    path: path
                });
            },

            listFiles: function(folder, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'listFiles',
                    folder: folder || ''
                });
            },

            deleteFile: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'deleteFile',
                    path: path
                });
            },
            deleteMultiple: function(paths, callback) {
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'deleteMultiple', paths: Array.isArray(paths)? paths : [] });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            deleteDirectory: function(path, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'deleteDirectory',
                    path: path
                });
            },

            getStorageInfo: function(callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'getStorageInfo'
                });
            },

            showStorageSettings: function() {
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'showStorageSettings'
                });
            },
            loadFilesWithDocumentPicker: function(fileTypes, callback) {
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'loadFilesWithDocumentPicker',
                    fileTypes: fileTypes || []
                });
            },
            copy_to_ios_local: function(requestedDestPath, fileTypes, callback){
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'copyToIOSLocal',
                    requestedDestPath: requestedDestPath || './',
                    fileTypes: fileTypes || ['m4a','mp3','wav','atome','json']
                });
            },
            copy_multiple_to_ios_local: function(requestedDestFolder, fileTypes, callback){
                window.fileSystemCallback = callback;
                webkit.messageHandlers.fileSystem.postMessage({
                    action: 'copyMultipleToIOSLocal',
                    requestedDestPath: requestedDestFolder || './',
                    fileTypes: fileTypes || ['m4a','mp3','wav','atome','json']
                });
            },
            ensureLocal: function(path, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'ensureLocal', path: path || '' });
                } catch(_) {
                    try { callback && callback({ success: true }); } catch(__) {}
                }
            },
            copyFiles: function(destFolder, sources, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'copyFiles', destFolder: destFolder || './', sources: Array.isArray(sources)? sources : [] });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            createDirectory: function(path, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'createDirectory', path: path || '' });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            },
            renameItem: function(oldPath, newPath, callback){
                window.fileSystemCallback = callback;
                try {
                    webkit.messageHandlers.fileSystem.postMessage({ action: 'renameItem', oldPath: oldPath || '', newPath: newPath || '' });
                } catch(_) {
                    try { callback && callback({ success: false, error: 'bridge unavailable' }); } catch(__) {}
                }
            }
        };

        window.saveProject = function(projectData, name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.atome';
                const path = 'Projects/' + fileName;
                AtomeFileSystem.saveFile(path, JSON.stringify(projectData), (result) => {
                    if (result.success) resolve(result.data);
                    else reject(new Error(result.error));
                });
            });
        };

        window.loadProject = function(name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.atome';
                const path = 'Projects/' + fileName;
                AtomeFileSystem.loadFile(path, (result) => {
                    if (result.success) {
                        try { resolve(JSON.parse(result.data.content)); }
                        catch (e) { reject(new Error('Invalid project file format')); }
                    } else reject(new Error(result.error));
                });
            });
        };

        window.exportAudio = function(audioData, name) {
            return new Promise((resolve, reject) => {
                const fileName = name + '.wav';
                const path = 'Exports/' + fileName;
                AtomeFileSystem.saveFile(path, audioData, (result) => {
                    if (result.success) resolve(result.data);
                    else reject(new Error(result.error));
                });
            });
        };
        """

        let script = WKUserScript(source: jsAPI, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(script)
    }
}
