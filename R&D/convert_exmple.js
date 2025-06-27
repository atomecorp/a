const converter = new JSONToVanillaConverter();
const result = converter.convert(votre_json);

// Code généré
console.log(result.code);

// Instance directe
const component = result.instance();
document.body.appendChild(component.element);