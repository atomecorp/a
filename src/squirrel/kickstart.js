// / === 🎉 Démonstrations ===

// 1. Template basique


define('view', {
    tag: 'div',
    class: 'atome',
    id: 'view',

});

// 2. Animation avec CSS
$('view', {
    parent: document.body,
    css: {
        background: '#272727',
        color: 'lightgray',
        left: '0px',
        top: '0px',
        position: 'absolute',
        width: '100%',
        height: '100%',
        overflow: 'auto',
    }

});


