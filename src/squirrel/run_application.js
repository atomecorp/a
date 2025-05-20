
fetch("./application/example.sqr")
    .then((res) => res.text())
    .then((code) => {
        runSquirrel(code)
    })
    .catch((err) => {
        console.error("❌ Erreur :", err);
    });


fetch("./application/example.sqj")
    .then((res) => res.text())
    .then((code) => {
        runSquirrel(code)
    })
    .catch((err) => {
        console.error("❌ Erreur :", err);
    });







