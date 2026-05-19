const checker1 = (() => {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let active = null;

    const onPointerMove = (e) => {
        if (!active) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        active.style.left = `${originLeft + dx}px`;
        active.style.top = `${originTop + dy}px`;
        active.style.transform = 'translate(0, 0)';
        console.log(`1 dragging at ${e.clientX}, ${e.clientY}`);
    };

    const onPointerEnd = (e) => {
        if (!active) return;
        active.releasePointerCapture(e.pointerId);
        active.style.cursor = 'grab';
        active.removeEventListener('pointermove', onPointerMove);
        active.removeEventListener('pointerup', onPointerEnd);
        active.removeEventListener('pointercancel', onPointerEnd);
        console.log('1 🔴 Fin drag basique');
        active = null;
    };

    return $('span', {
        id: 'checker',
        css: {
            backgroundColor: '#00f',
            padding: '10px',
            color: 'white',
            margin: '10px',
            display: 'inline-block',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            cursor: 'grab'
        },
        text: 'intuition content',
        onclick: () => {
            console.log('1rst events binded inline');
        },
        onPointerDown: (e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget;
            startX = e.clientX;
            startY = e.clientY;
            originLeft = el.offsetLeft;
            originTop = el.offsetTop;
            active = el;
            active.setPointerCapture(e.pointerId);
            active.style.cursor = 'grabbing';
            active.addEventListener('pointermove', onPointerMove);
            active.addEventListener('pointerup', onPointerEnd);
            active.addEventListener('pointercancel', onPointerEnd);
            console.log('🔴 Début drag basique');
        }
    });
})();

const checker = grab('checker');

checker.addEventListener('click', () => {
    console.log('second events binded inline');
});

checker.addEventListener('click', () => {
    console.log('third events binded inline');
});

function makeDraggable(el) {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onPointerMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = `${originLeft + dx}px`;
        el.style.top = `${originTop + dy}px`;
        el.style.transform = 'translate(0, 0)';
        console.log(`dragging at ${e.clientX}, ${e.clientY}`);
    };

    const onPointerUp = (e) => {
        el.releasePointerCapture(e.pointerId);
        el.style.cursor = 'grab';
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        console.log('🔴 Fin drag basique');
    };

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        originLeft = el.offsetLeft;
        originTop = el.offsetTop;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        console.log('🔴 Début drag basique');
    });
}

makeDraggable(checker);