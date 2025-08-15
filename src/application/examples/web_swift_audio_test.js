// Test minimaliste ios_web_view_filereader.js (après 2 secondes)
setTimeout(() => {
    console.log('🌐 Testing iOS WebView FileReader...');
    
    // Test 1: Lister les fichiers
    if (typeof window.get_ios_webview_folder_content === 'function') {
        window.get_ios_webview_folder_content('./assets/audios')
            .then(files => {
                console.log('📂 WebView files found:', files);
            })
            .catch(error => {
                console.error('❌ Error listing WebView files:', error);
            });
    } else {
        console.error('❌ get_ios_webview_folder_content not available');
    }
    
    // Test 2: Lire un fichier
    if (typeof window.readWebViewFile === 'function') {
        window.readWebViewFile('assets/audios/riff.m4a')
            .then(content => {
                console.log('📖 WebView file read, size:', content.length, 'characters');
            })
            .catch(error => {
                console.error('❌ Error reading WebView file:', error);
            });
    } else {
        console.error('❌ readWebViewFile not available');
    }
}, 2000);