function createBasicConsole() {
  const console1 = Console({
    title: 'Debug Console',
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    template: 'dark_theme'
  });
  
  console1.show();
  return console1;
}

createBasicConsole();

   $('audio', {
      id: 'riffPlayer',
      attrs: {
        src: 'assets/audios/riff.m4a',
        controls: true
      },
      css: {
        margin: '20px',
        width: '300px',
        outline: 'none',
        borderRadius: '6px'
      }
    });

    // Code minimaliste pour lister les fichiers locaux
    console.log('🔍 Listing local files...');
    
    if (typeof get_auv3_folder_content === 'function') {
        get_auv3_folder_content('.')
            .then(files => {
                console.log('📂 Local files found:', files);
                console.log('📋 Files list:');
                files.forEach((file, index) => {
                    console.log(`${index + 1}. ${file.name} (${file.isDirectory ? 'DIR' : 'FILE'})`);
                });
            })
            .catch(error => {
                console.error('❌ Error listing files:', error);
            });
    } else {
        console.error('❌ auv3_file_lister.js not loaded');
    }