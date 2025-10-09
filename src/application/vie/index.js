function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function create_audio_obejct(f, target) {
  const panel = $('section', {
    parent: target,
    css: {
      id: 'file_audio_' + f.name,
      width: '69px',
      height: '69px',
      padding: '24px',
      backgroundColor: '#333',
      borderRadius: '12px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      marginBottom: '12px',
      marginTop: '12px',
      marginLeft: '12px',
      marginRight: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      color: '#fff'
    }
  });

  // Créer l'élément audio avec Squirrel
  $('audio', {
    parent: panel,
    attrs: {
      controls: 'controls',
      src: URL.createObjectURL(f.file),
      // autoplay: false
    },
    css: {
      width: '100%'
    }
  });
}



function file_drop_analysis(f, target, index) {
  const extension = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : null;

  puts(`Fichier ${index + 1}:`);
  puts(`  - Nom: ${f.name}`);
  puts(`  - Extension: ${extension}`);
  puts(`  - Type: ${f.type || 'inconnu'}`);
  puts(`  - Taille: ${formatBytes(f.size)}`);
  puts(`  - Chemin: ${f.path || f.fullPath || 'non disponible'}`);

  let category = '';

  switch (extension) {
    case 'txt':
    case 'text':
      puts('Texte');
      break;
    case 'json':
      puts('JSON');
      break;
    case 'vie':
      puts('project');
      break;
    case 'md':
      puts('Markdown');
      break;
    case 'wav':
      puts('WAV');
      break;
    case 'aif':
    case 'aiff':
      puts('Audio');
      break;
    case 'mp3':
      puts('Audio');
      break;
    case 'm4v':
    case 'mp4':
      puts('Audio/Vidéo');
      break;
    case 'm4a':
      create_audio_obejct(f, target);
      puts('Audio');
      break;
    case 'flac':
      puts('Audio');
      break;
    case 'mid':
    case 'midi':
      puts('MIDI');
      break;
    case 'jpg':
    case 'jpeg':
      puts('Image');
      break;
    case 'png':
      puts('Image');
      break;
    case 'svg':
      puts('Image');
      break;
    default:
      puts('unknow');
  }
}

function mainfile_drop(files, event) {
  const target = event.target;
  puts('drop on object with id : ' + target.id)

  files.forEach((f, index) => {
    file_drop_analysis(f, target, index)

  });

}

function local_drop(files, event) {

  puts('DropZone local déclenché');
  puts(`Nombre de fichiers: ${files.length}`);

}


$('div', {
  id: 'isolation_test_zone',
  css: {
    backgroundColor: 'rgba(255, 0, 174, 1)',
    marginLeft: '0',
    padding: '10px',
    left: '333px',
    position: 'absolute',
    width: '300px',
    height: '200px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Drop files here'
});



DragDrop.createDropZone('#isolation_test_zone', {
  accept: '*',
  multiple: true,
  event: 'kill', //  event: 'stop', 'kill' //prevent event bubbling
  allowedDropId: 'isolation_test_zone',
  onDrop: (files, event) => {
    local_drop(files, event);
  }
}) || null;


DragDrop.registerGlobalDrop({
  accept: '*',
  multiple: true,
  onDragEnter: (event) => {
    const target = event.target;

  },
  onDragLeave: (event) => {
    const target = event.target;

  },
  onDrop: (files, event) => {
    const target = event.target;
    mainfile_drop(files, event)
  }
});




$('div', {

  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    width: '300px',
    height: '200px',
    left: '50%',
    top: '50%',
    position: 'absolute',
    transform: 'translate(-50%, -50%  )',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je laisse passer des fichiers ici !'
});


const basicDrag = Draggable('draggable-box', {
  content: '🔴 Basic',
  css: {
    left: '100px',
    top: '100px',
    width: '170px',
    height: '170px',
    borderRadius: '12px',
    backgroundColor: '#e74c3c'
  },
  text: 'Je laisse aussi passer des fichiers ici !',
  onDragStart: (el) => {
    console.log('🔴 Début drag basique');
  },
  onDragEnd: (el) => {
    console.log('🔴 Fin drag basique');
  }
});