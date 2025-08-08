  // Console redefinition
        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);



        console.log("Console redefined for Swift communication");
        console.error(" error redefined for Swift communication");

function msg_1() {
    console.log("Message 1 triggered");
}
function msg_2() {
    console.log("Message 2 triggered");
}

        const toggleGlass = Button({
    template: 'glass_blur',
    onText: '✨ ON',
    offText: '💫 OFF',
    onAction: msg_1,
    offAction: msg_2,
    parent: '#view',
    css: {
        left: '300px',
        top: '120px',
        position: 'absolute'
    }
});