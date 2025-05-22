
// fetch("./application/example.sqr")
//     .then((res) => res.text())
//     .then((code) => {
//         runSquirrel(code)
//     })
//     .catch((err) => {
//         console.error("❌ Erreur :", err);
//     });
//
//
// fetch("./application/example.sqj")
//     .then((res) => res.text())
//     .then((code) => {
//         runSquirrel(code)
//     })
//     .catch((err) => {
//         console.error("❌ Erreur :", err);
//     });

window.addEventListener('DOMContentLoaded', () => {
    // on attend que la lib soit dispo globalement
    const checkReady = setInterval(() => {
        if (typeof LibRubyParser !== 'undefined' && typeof LibRubyParser.parse === 'function') {
            clearInterval(checkReady);

            fetch('../application/example.sqr')
                .then(res => res.text())
                .then(code => {
                    const result = LibRubyParser.parse(code);  // appel direct à la lib globale
                    console.log(result);
                })
                .catch(console.error);
        }
    }, 50);
});
