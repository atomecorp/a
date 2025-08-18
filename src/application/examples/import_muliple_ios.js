// === DEMO: import multiple ===
function copyMultipleToLocalDemo(){
    if(!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem)){
        console.warn('bridge indisponible'); return;
    }
    window.fileSystemCallback = function(res){
        if(res.success){
            console.log('✅ Imports enregistrés paths=', res.data.paths);
        } else {
            console.warn('❌ Imports multiples échoués', res.error);
        }
    };
    window.webkit.messageHandlers.fileSystem.postMessage({
        action:'copyMultipleToIOSLocal',
        requestedDestPath:'./',
        fileTypes:['m4a','mp3','wav','atome','json']
    });
}

const copyMultipleBtn = Button({
    onText:'Multi→Local',
    offText:'Multi→Local',
    parent:'#view',
    onAction: copyMultipleToLocalDemo,
    offAction: copyMultipleToLocalDemo,
    css:{
        width:'130px',height:'30px',left:'200px',top:'240px',borderRadius:'6px',backgroundColor:'#17a2b8',color:'white',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'12px'
    }
});

