
fetch("./example.sqr")
    .then((res) => res.text())
    .then((code) => {
        runSquirrel(code)
    })
    .catch((err) => {
        console.error("❌ Erreur :", err);
    });


fetch("./example.sqj")
    .then((res) => res.text())
    .then((code) => {
        runSquirrel(code)
    })
    .catch((err) => {
        console.error("❌ Erreur :", err);
    });




