// Exemple minimaliste d'ios_file_writer.js (comme writeFileToAUv3 mais pour iOS)
console.log('💾 Writing iOS file...');

if (typeof window.writeFileToIOS === 'function') {
    window.writeFileToIOS('my_test.txt', 'hello world')
        .then(result => {
            console.log('✅ File written successfully:', result);
            console.log('📄 Message:', result.message);
        })
        .catch(error => {
            console.error('❌ Error writing file:', error);
        });
} else {
    console.error('❌ writeFileToIOS not available. Type of function:', typeof window.writeFileToIOS);
}