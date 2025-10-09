function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


function mainfile_drop(files, event) {
  const target = event.target;
  puts('drop on object with id : ' + target.id)

}

function local_drop(files, event) {

  puts('DropZone local déclenché');
  puts(`Nombre de fichiers: ${files.length}`);
  files.forEach((f, index) => {
    puts(`Fichier ${index + 1}:`);
    puts(`  - Nom: ${f.name}`);
    puts(`  - Type: ${f.type || 'inconnu'}`);
    puts(`  - Taille: ${formatBytes(f.size)}`);
    puts(`  - Chemin: ${f.path || f.fullPath || 'non disponible'}`);
  });
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


