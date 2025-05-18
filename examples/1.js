
document.addEventListener('DOMContentLoaded', () => {
// Création d'un hash Ruby-like
    const user = AJS.Hash();
    user['name'] = 'Jean';
    user['age'] = 30;
    user['ville'] = 'Clermont-Ferrand';

    console.log(user.inspect()); // Affiche: {name: "Jean", age: 30, ville: "Clermont-Ferrand"}

// Utilisation de define_method
    const person = {};
    AJS.extend(person);

    person.define_method('sayHello', function() {
        console.log(`Bonjour, je m'appelle ${this.name}!`);
        return this;
    });

    person.name = 'Marie';
    person.sayHello(); // Affiche: Bonjour, je m'appelle Marie!

// Utilisation des méthodes de Hash
    user.each((key, value) => {
        console.log(`${key}: ${value}`);
    });

    const selectedUser = user.select((key, value) => {
        return key === 'name' || key === 'ville';
    });
    console.log('-------------------------------------');
    console.log(selectedUser.inspect()); // Affiche: {name: "Jean", ville: "Clermont-Ferrand"}
    console.log('-------------------------------------');
});

const exempleJson = {
    nom: 'Alice',
    age: 30,
    profession: 'Ingénieure',
};

const iterator = new A(exempleJson);

// Méthode forEach :
iterator.forEach((key, value) => {
    console.log(`${key} : ${value}`);
});

// Syntaxe for...of :
for (const key of iterator) {
    console.log(`${key} => ${iterator.getValue(key)}`);
}