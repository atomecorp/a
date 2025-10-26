const dropZoneId = 'aBox_drop_zone';
const dropZoneDefaultBg = '#00f';
const dropZoneHoverBg = '#ff8800';

$('div', {
    id: dropZoneId,
    css: {
        backgroundColor: dropZoneDefaultBg,
        marginLeft: '0',
        width: '120px',
        height: '120px',
        padding: '10px',
        color: 'white',
        margin: '10px',
        display: 'inline-block'
    }
});

function setDropZoneColor(color) {
    const zone = document.getElementById(dropZoneId);
    if (zone) {
        zone.style.backgroundColor = color;
    }
}

function attachDropZoneHighlight() {
    const zone = document.getElementById(dropZoneId);
    if (!zone) return;
    let isDragInside = false;

    const handleEnter = (event) => {
        event.preventDefault();
        if (isDragInside) return;
        isDragInside = true;
        setDropZoneColor(dropZoneHoverBg);
        puts(`Entering ${dropZoneId}`);
    };

    const handleLeave = (event) => {
        if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
        setDropZoneColor(dropZoneDefaultBg);
        puts(`Leaving ${dropZoneId}`);
        isDragInside = false;
    };

    const handleDrop = () => {
        setDropZoneColor(dropZoneDefaultBg);
        isDragInside = false;
    };

    zone.addEventListener('dragenter', handleEnter);
    zone.addEventListener('dragover', handleEnter);
    zone.addEventListener('dragleave', handleLeave);
    zone.addEventListener('drop', handleDrop);
}

attachDropZoneHighlight();

DragDrop.createDropZone(`#${dropZoneId}`, {
    accept: '*',
    multiple: true,
    allowedDropId: dropZoneId,
    event: 'stop',
    onDrop: (files) => {
        setDropZoneColor(dropZoneDefaultBg);
        puts(`file drop on ${dropZoneId}`);
        files.forEach((file) => puts(`- ${file.name}`));
    }
});
