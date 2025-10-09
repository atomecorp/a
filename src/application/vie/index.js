
const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'taille inconnue';
  if (bytes === 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const normalized = bytes / Math.pow(1024, index);
  return `${normalized.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};


function file_drop_anywhere(files, event) {


  if (!files.length) return;
  const dropTarget = document.querySelector('#view') || document.body;
  const baseX = event?.clientX ?? window.innerWidth / 2;
  const baseY = event?.clientY ?? window.innerHeight / 2;

  files.forEach((file, index) => {
    const card = $('div', {
      parent: dropTarget,
      css: {
        position: 'absolute',
        left: `${Math.max(12, baseX + index * 24 - 140)}px`,
        top: `${Math.max(12, baseY + index * 24 - 80)}px`,
        minWidth: '240px',
        maxWidth: '320px',
        padding: '18px 22px',
        backgroundColor: 'rgba(20, 20, 20, 0.92)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: 'white',
        fontSize: '14px',
        lineHeight: '1.45',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        zIndex: 9999
      },
      innerHTML: [
        '<strong>Fichier déposé</strong>',
        `Nom : ${file.name}`,
        `Type : ${file.type || 'inconnu'}`,
        `Taille : ${formatBytes(file.size)}`,
        file.path ? `Chemin : ${file.path}` : file.fullPath ? `Chemin (virtual) : ${file.fullPath}` : ''
      ].filter(Boolean).join('<br>')
    });

    // Auto-fade after 6 seconds
    setTimeout(() => {
      card.style.transition = 'opacity 400ms ease, transform 400ms ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px)';
      setTimeout(() => card.remove(), 420);
    }, 6000);
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



const dz = DragDrop?.createDropZone('#isolation_test_zone', {
  accept: '*',
  multiple: true,
  event: 'kill', //  event: 'stop', 'kill' //prevent event bubbling
  allowedDropId: 'isolation_test_zone',
  onDrop: (files, event) => {
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
    // Restaurer la couleur après le drop
    const target = event.target;
    puts('file drop on ' + target.id)
    file_drop_anywhere(files, event)
  }
});


$('div', {
  // pas besoin de 'tag'
  id: 'check_me',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    width: '120px',
    height: '120px',
    padding: '10px',
    color: 'white',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
});