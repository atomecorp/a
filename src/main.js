// const d = document;
//
//
// const div = Object.assign(d.body, {
//   append: Object.assign(d.createElement('h1'), {
//     textContent: 'Page générée en JS pur',
//     style: { textAlign: 'center' }
//   })
// }).appendChild(d.createElement('div'));
//
// Object.assign(div.style, {
//   width: '200px', height: '200px', backgroundColor: 'red', color: 'white',
//   display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
//   margin: '50px auto', padding: '20px', textAlign: 'center', borderRadius: '10px',
//   transition: 'background-color 0.3s'
// });
//
// div.textContent = 'Click me to change color';
// div.onclick = () => div.style.backgroundColor = div.style.backgroundColor === 'red' ? 'green' : 'red';



//////

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
  console.log(selectedUser.inspect()); // Affiche: {name: "Jean", ville: "Clermont-Ferrand"}
});




//////////////
// Exemple d'utilisation :
// const exempleJson = {
//   nom: 'Alice',
//   age: 30,
//   profession: 'Ingénieure',
// };
//
// const iterator = new Atome(exempleJson);
//
// // Méthode forEach :
// iterator.forEach((key, value) => {
//   console.log(`${key} : ${value}`);
// });
//
// // Syntaxe for...of :
// for (const key of iterator) {
//   console.log(`${key} => ${iterator.getValue(key)}`);
// }
