# 📦 Checklist Publication NPM - Squirrel Framework

## 🔍 1. Vérification du nom du package

### Tâche : Vérifier que `squirrel-framework` est disponible sur NPM

**Actions à réaliser :**
```bash
# Vérifier si le nom est pris
npm view squirrel-framework

# Si le package existe déjà, essayer des alternatives :
npm view @votre-org/squirrel-framework
npm view squirrel-js
npm view squirrel-ui
npm view squirrel-components
```

**Si le nom est pris :**
- Modifier le `"name"` dans `package.json`
- Considérer un scope : `@votre-username/squirrel-framework`
- Alternatives : `squirrel-web-framework`, `squirrel-ui-kit`, etc.

**Status :** ❌ À faire

---

## 🔗 2. Repository GitHub

### Tâche : Mettre à jour l'URL GitHub dans package.json

**Actions à réaliser :**
1. **Créer le repository GitHub :**
   ```bash
   # Initialiser git si pas fait
   git init
   git add .
   git commit -m "Initial commit"
   
   # Créer repo sur GitHub puis :
   git remote add origin https://github.com/VOTRE-USERNAME/squirrel-framework.git
   git push -u origin main
   ```

2. **Mettre à jour package.json :**
   ```json
   {
     "homepage": "https://github.com/VOTRE-USERNAME/squirrel-framework",
     "repository": {
       "type": "git",
       "url": "https://github.com/VOTRE-USERNAME/squirrel-framework.git"
     },
     "bugs": {
       "url": "https://github.com/VOTRE-USERNAME/squirrel-framework/issues"
     }
   }
   ```

3. **Ajouter badges dans README :**
   ```markdown
   [![npm version](https://badge.fury.io/js/squirrel-framework.svg)](https://www.npmjs.com/package/squirrel-framework)
   [![GitHub issues](https://img.shields.io/github/issues/VOTRE-USERNAME/squirrel-framework.svg)](https://github.com/VOTRE-USERNAME/squirrel-framework/issues)
   ```

**Status :** ❌ À faire

---

## 📄 3. Fichier LICENSE

### Tâche : Créer un fichier LICENSE

**Actions à réaliser :**
```bash
# Créer le fichier LICENSE (MIT recommandé)
touch LICENSE
```

**Contenu LICENSE (MIT) :**
```
MIT License

Copyright (c) 2025 [VOTRE NOM]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Mettre à jour package.json :**
```json
{
  "license": "MIT",
  "author": "Votre Nom <votre.email@example.com>"
}
```

**Status :** ❌ À faire

---

## 🧪 4. Tests avant publication

### Tâche : Ajouter des tests

**Actions à réaliser :**

1. **Installer les dépendances de test :**
   ```bash
   npm install --save-dev vitest jsdom @testing-library/dom
   ```

2. **Créer la configuration de test :**
   ```javascript
   // vitest.config.js
   import { defineConfig } from 'vitest/config';
   
   export default defineConfig({
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: ['./test/setup.js']
     }
   });
   ```

3. **Créer les tests de base :**
   ```bash
   mkdir -p test
   # Créer test/button.test.js, test/slider.test.js, etc.
   ```

4. **Exemple de test (test/button.test.js) :**
   ```javascript
   import { describe, it, expect } from 'vitest';
   import { Button } from '../src/squirrel/components/button.js';
   
   describe('Button Component', () => {
     it('should create a button element', () => {
       const button = Button({ text: 'Test' });
       expect(button.tagName).toBe('BUTTON');
       expect(button.textContent).toBe('Test');
     });
   });
   ```

5. **Ajouter scripts dans package.json :**
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:run": "vitest run",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```

**Status :** ❌ À faire

---

## 📚 5. Documentation utilisateur

### Tâche : Compléter la documentation

**Actions à réaliser :**

1. **README principal détaillé :**
   - Exemples d'usage complets
   - API de chaque composant
   - Guides d'installation
   - Exemples de code

2. **Documentation des composants :**
   ```bash
   # Créer docs/ si pas existant
   mkdir -p docs/components
   
   # Créer une page par composant
   touch docs/components/button.md
   touch docs/components/slider.md
   # etc.
   ```

3. **Guide de contribution :**
   ```bash
   touch CONTRIBUTING.md
   ```

4. **Changelog :**
   ```bash
   touch CHANGELOG.md
   ```

5. **Exemples pratiques :**
   ```bash
   mkdir -p examples
   touch examples/basic-usage.html
   touch examples/advanced-components.html
   ```

**Structure recommandée :**
```
docs/
├── README.md (guide principal)
├── installation.md
├── quick-start.md
├── api/
│   ├── button.md
│   ├── slider.md
│   └── ...
├── guides/
│   ├── styling.md
│   ├── plugins.md
│   └── customization.md
└── examples/
    ├── basic.md
    └── advanced.md
```

**Status :** ❌ À faire

---

## ✅ Checklist finale avant publication

- [ ] Nom du package vérifié/modifié
- [ ] Repository GitHub créé et lié
- [ ] Fichier LICENSE créé
- [ ] Tests écrits et qui passent (`npm test`)
- [ ] Documentation complète
- [ ] Build réussi (`npm run build:all`)
- [ ] Version incrémentée (`npm version patch/minor/major`)
- [ ] Compte NPM configuré (`npm login`)

**Commande finale :**
```bash
./publish-npm.sh
```

---

## 🎯 Priorités

1. **URGENT** : Nom du package + Repository GitHub
2. **IMPORTANT** : LICENSE + Tests de base  
3. **MOYEN** : Documentation complète
4. **OPTIONNEL** : Tests avancés + CI/CD

**Estimation temps :** 1-2 jours de travail
