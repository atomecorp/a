// Exemple minimaliste d'ios_file_reader.js (lecture du fichier my_test.txt après 2 secondes)
setTimeout(() => {
    console.log('📖 Reading iOS file...');
    
    if (typeof window.readFileFromIOS === 'function') {
        window.readFileFromIOS('./my_test.txt')
            .then(content => {
                console.log('✅ File read successfully:');
                console.log('📄 Content:', content);
                console.log('📊 Length:', content.length, 'characters');
            })
            .catch(error => {
                console.error('❌ Error reading file:', error);
            });
    } else {
        console.error('❌ readFileFromIOS not available. Type of function:', typeof window.readFileFromIOS);
    }
}, 2000);