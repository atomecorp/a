// Console -> Swift bridge (multi arguments, objects JSON)
(function(){
    if (!window.console) return;
    const safeString = (v) => {
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
            try { return JSON.stringify(v); } catch(_) { return '[object]'; }
        }
        return String(v);
    };
    const post = (tag, parts) => {
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.console) {
                window.webkit.messageHandlers.console.postMessage(tag + ': ' + parts.join(' '));
            }
        } catch(_){}
    };
    const wrap = (orig, tag) => function(...args){
        try { orig.apply(console, args); } catch(_){}
        post(tag, args.map(safeString));
    };
    ['log','info','warn','error'].forEach(level => {
        const tag = level.toUpperCase();
        const orig = console[level] ? console[level].bind(console) : function(){};
        console[level] = wrap(orig, tag);
    });
    window.addEventListener('error', e => { post('UNCAUGHT', [e.message || 'error']); });
    window.addEventListener('unhandledrejection', e => { post('PROMISE', [safeString(e.reason)]); });
    console.log('Console bridge active');
})();

//tests

        console.log("Console redefined for Swift communication");
        console.error(" error redefined for Swift communication");

// Demo optional (commenté pour éviter dépendances au moment du boot)
// function msg_1(){ console.log('Message 1 triggered'); }
// function msg_2(){ console.log('Message 2 triggered'); }
// Button({ template:'glass_blur', onText:'✨ ON', offText:'💫 OFF', onAction:msg_1, offAction:msg_2, parent:'#view', css:{ left:'300px', top:'120px', position:'absolute' }});