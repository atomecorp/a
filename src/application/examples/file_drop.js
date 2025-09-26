
function file_drop_anywhere(files, event) {
    const localDropZone = document.querySelector('#drop_zone');
    if (localDropZone) {
        const path = typeof event?.composedPath === 'function' ? event.composedPath() : null;
        const target = event?.target;
        const isInsideLocal = (path && path.includes(localDropZone)) || (target instanceof Element && localDropZone.contains(target));
        if (isInsideLocal) return;
    }

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
function file_drop_on_drop_zone(files) {

    console.log('Files dropped:', files.map(f => ({ name: f.name, type: f.type, size: f.size, path: f.path || f.fullPath })))

    // Ensure we have a container within the drop zone to list results
    let list = document.querySelector('#drop-list');
    if (!list) {
        list = $('div', {
            id: 'drop-list',
            parent: '#drop_zone',
            css: {
                marginTop: '10px',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }
        });
    }

    // Clear previous entries
    list.innerHTML = '';

    if (!files.length) {
        $('div', {
            parent: list,
            css: {
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(231, 76, 60, 0.35)',
                border: '1px solid rgba(231, 76, 60, 0.45)'
            },
            text: 'Aucun fichier accepté (vérifiez les extensions autorisées)'
        });
        return;
    }

    files.forEach((f, index) => {
        $('div', {
            parent: list,
            id: `drop-item-${index}`,
            css: {
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 255, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
            },
            text: `${f.name} — ${f.type || 'type inconnu'} — ${f.size ?? 'taille ?'} bytes`
        });
    });
}


// === Global drop: create rounded info card at drop location ===
const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'taille inconnue';
    if (bytes === 0) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    const normalized = bytes / Math.pow(1024, index);
    return `${normalized.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};



$('div', {
    // pas besoin de 'tag'
    id: 'drop_zone',
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


const dz = DragDrop?.createDropZone('#drop_zone', {
    // Accept any file type for the demo; adjust to ['image/*', '.wav', '.mp3'] to filter
    accept: '*',
    multiple: true,
    allowedDropId: 'drop_zone',
    onDrop: (files) => {
        file_drop_on_drop_zone(files)
    }
}) || null;



DragDrop.registerGlobalDrop({
    accept: '*',
    multiple: true,
    onDrop: (files, event) => {
        file_drop_anywhere(files, event)
    }
});

