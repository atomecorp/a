# 📦 NPM Publication Checklist - Squirrel Framework

## 🔍 1. Package Name Verification

### Task: Check that `squirrel-framework` is available on NPM

**Actions to perform:**
```bash
# Check if the name is taken
npm view squirrel-framework

# If the package already exists, try alternatives:
npm view @your-org/squirrel-framework
npm view squirrel-js
npm view squirrel-ui
npm view squirrel-components
```

**If the name is taken:**
- Change the `"name"` in `package.json`
- Consider a scope: `@your-username/squirrel-framework`
- Alternatives: `squirrel-web-framework`, `squirrel-ui-kit`, etc.

**Status:** ❌ To do

---

## 🔗 2. GitHub Repository

### Task: Update the GitHub URL in package.json

**Actions to perform:**
1. **Create the GitHub repository:**
   ```bash
   # Initialize git if not done
   git init
   git add .
   git commit -m "Initial commit"
   
   # Create repo on GitHub then:
   git remote add origin https://github.com/YOUR-USERNAME/squirrel-framework.git
   git push -u origin main
   ```

2. **Update package.json:**
   ```json
   {
     "homepage": "https://github.com/YOUR-USERNAME/squirrel-framework",
     "repository": {
       "type": "git",
       "url": "https://github.com/YOUR-USERNAME/squirrel-framework.git"
     },
     "bugs": {
       "url": "https://github.com/YOUR-USERNAME/squirrel-framework/issues"
     }
   }
   ```

3. **Add badges in README:**
   ```markdown
   [![npm version](https://badge.fury.io/js/squirrel-framework.svg)](https://www.npmjs.com/package/squirrel-framework)
   [![GitHub issues](https://img.shields.io/github/issues/YOUR-USERNAME/squirrel-framework.svg)](https://github.com/YOUR-USERNAME/squirrel-framework/issues)
   ```

**Status:** ❌ To do

---

## 📄 3. LICENSE File

### Task: Create a LICENSE file

**Actions to perform:**
```bash
# Create the LICENSE file (MIT recommended)
touch LICENSE
```

**LICENSE Content (MIT):**
```
MIT License

Copyright (c) 2025 [YOUR NAME]

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

**Update package.json:**
```json
{
  "license": "MIT",
  "author": "Your Name <your.email@example.com>"
}
```

**Status:** ❌ To do

---

## 🧪 4. Tests before publication

### Task: Add tests

**Actions to perform:**

1. **Install test dependencies:**
   ```bash
   npm install --save-dev vitest jsdom @testing-library/dom
   ```

2. **Create test configuration:**
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

3. **Create basic tests:**
   ```bash
   mkdir -p test
   # Create test/button.test.js, test/slider.test.js, etc.
   ```

4. **Test example (test/button.test.js):**
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

5. **Add scripts in package.json:**
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:run": "vitest run",
       "test:coverage": "vitest run --coverage"
     }
   }
   ```

**Status:** ❌ To do

---

## 📚 5. User Documentation

### Task: Complete the documentation

**Actions to perform:**

1. **Detailed main README:**
   - Complete usage examples
   - API for each component
   - Installation guides
   - Code examples

2. **Component documentation:**
   ```bash
   # Create docs/ if not existing
   mkdir -p docs/components
   
   # Create one page per component
   touch docs/components/button.md
   touch docs/components/slider.md
   # etc.
   ```

3. **Contribution guide:**
   ```bash
   touch CONTRIBUTING.md
   ```

4. **Changelog:**
   ```bash
   touch CHANGELOG.md
   ```

5. **Practical examples:**
   ```bash
   mkdir -p examples
   touch examples/basic-usage.html
   touch examples/advanced-components.html
   ```

**Recommended structure:**
```
docs/
├── README.md (main guide)
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

**Status:** ❌ To do

---

## ✅ Final checklist before publication

- [ ] Package name checked/modified
- [ ] GitHub repository created and linked
- [ ] LICENSE file created
- [ ] Tests written and passing (`npm test`)
- [ ] Complete documentation
- [ ] Successful build (`npm run build:all`)
- [ ] Version incremented (`npm version patch/minor/major`)
- [ ] NPM account configured (`npm login`)

**Final command:**
```bash
./publish-npm.sh
```

---

## 🎯 Priorities

1. **URGENT**: Package name + GitHub repository
2. **IMPORTANT**: LICENSE + Basic tests  
3. **MEDIUM**: Complete documentation
4. **OPTIONAL**: Advanced tests + CI/CD

**Estimated time:** 1-2 days of work
