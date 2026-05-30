# Prompt Codex — Debug Playwright / Chrome pour tools Atome / eVe

Copie-colle ce prompt dans Codex. Objectif : isoler pourquoi les tools Atome/eVe ne répondent pas quand l'IA pilote Chrome via Playwright, alors que l'interface marche en navigateur standard et dans Tauri.

Ce prompt est volontairement diagnostic. Il ne doit pas servir à introduire un correctif produit, un proxy DOM, un fallback renderer, un shim, une API de contournement ou une deuxième voie d'activation des tools.

---

## Prompt à donner à Codex

Tu es chargé de diagnostiquer un problème d'interaction Playwright sur une application Atome/eVe.

Avant toute action :

1. Lis et applique `.codex/AGENTS.md`.
2. Classe la tâche comme diagnostic Playwright, test/probe, interaction UI, et éventuellement accessibilité uniquement si le diagnostic le prouve.
3. Identifie le propriétaire canonique : le test/probe Playwright appartient à `tests/probes`, les tools produit restent dans les propriétaires eVe/Squirrel existants, et le rendu Atome reste dans la route WebGPU/canvas partagée.
4. N'écris aucun fichier temporaire hors `./temp`.
5. N'écris aucun test persistant hors `./tests`.
6. N'utilise pas TypeScript.
7. N'ajoute aucune mutation Git.
8. Ne modifie pas la logique produit tant que le diagnostic n'a pas prouvé la catégorie exacte du problème.

### Contexte

- L'application fonctionne normalement à la main dans un navigateur standard.
- L'application fonctionne normalement dans Tauri.
- En mode IA/Codex avec Chrome piloté par Playwright, les tools Atome/eVe ne répondent pas aux clics.
- On veut d'abord vérifier que Playwright envoie bien des events au navigateur avec un bouton HTML de test indépendant d'Atome.
- Ce bouton doit être injecté exclusivement depuis Playwright (`page.addInitScript()` ou `page.evaluate()`), dans le contexte de page du test, et ne doit pas devenir du code produit.
- Ensuite, si le bouton de test marche, il faut comprendre pourquoi les tools Atome/eVe ne reçoivent pas ou n'interprètent pas les events.

### Sources techniques à prendre en compte

Playwright ne clique pas “bêtement”. Pour `locator.click()`, il vérifie notamment que l'élément est visible, stable, enabled, et qu'il reçoit bien les events pointer, donc qu'il n'est pas couvert par un overlay ou un autre élément. Playwright MCP clique aussi souvent via des refs issues de l'accessibility snapshot : si les tools Atome/eVe ne sont pas exposés comme éléments accessibles (`role`, `aria-label`, nom visible, etc.), l'agent peut viser le mauvais élément ou ne pas trouver de cible robuste.

Références utiles :

- https://playwright.dev/docs/actionability
- https://playwright.dev/docs/input
- https://playwright.dev/docs/debug
- https://playwright.dev/docs/trace-viewer
- https://playwright.dev/mcp/tools/interaction

---

## Mission

Créer une procédure de debug reproductible, sans modifier la logique métier Atome/eVe, pour déterminer dans quelle catégorie tombe le problème :

1. Playwright n'envoie pas d'events.
2. Un overlay ou une couche Atome intercepte les events.
3. L'élément cliqué n'est pas celui qui possède le handler.
4. Les tools Atome/eVe ne sont pas accessibles via l'accessibility tree utilisé par Playwright/Codex.
5. Les handlers attendent autre chose qu'un `click` : `pointerdown`, `mousedown`, `touchstart`, drag, long press, etc.
6. Le code filtre ou ignore certains events : `event.isTrusted`, `pointerType`, bouton souris, coordonnées, focus, etc.
7. Le rendu est dans un canvas/SVG/custom layer et Playwright clique sur une zone non mappée.
8. Il y a un écart de viewport, zoom, transform CSS, devicePixelRatio, iframe, Shadow DOM, ou z-index.

---

## Contraintes

- Ne pas casser la prod.
- Toute instrumentation intégrée au repo doit être activable uniquement en debug, par exemple avec `?pwdebug=1`, `localStorage.PW_DEBUG=1`, ou `process.env.PW_DEBUG`.
- Préférer l'instrumentation externe Playwright (`page.addInitScript()` / `page.evaluate()`) à toute modification de l'app.
- Ne pas remplacer Atome/eVe par un mock.
- Ne pas ajouter de proxy DOM au-dessus du canvas ou des tools.
- Ne pas ajouter de `data-*` sur les Atomes, tools, surfaces rendues ou contrôles produit pour contourner Playwright.
- Ne pas créer d'API test-only qui active directement un tool à la place du vrai chemin d'interaction.
- Ne pas garder `dispatchEvent`, `force: true`, ou un click par coordonnées comme solution finale : ils servent uniquement à classifier le problème.
- Si un correctif produit semble nécessaire, arrêter le diagnostic et produire un rapport avec le propriétaire canonique à modifier.
- Ne pas supposer que le problème vient de Playwright tant qu'on n'a pas comparé :
  - bouton HTML indépendant ;
  - clic réel Playwright ;
  - clic forcé ;
  - clic par coordonnées ;
  - `dispatchEvent` ;
  - events pointer/mouse/touch ;
  - hit-test avec `elementsFromPoint()`.

---

## Étape 1 — Injecter un bouton de test depuis Playwright

Injecte ce script depuis Playwright uniquement. Il doit être exécutable depuis `page.addInitScript()` ou `page.evaluate()`. Ne l'intègre pas dans l'app tant qu'une décision d'architecture n'a pas explicitement autorisé une instrumentation debug produit.

```js
(() => {
  if (window.__ATOME_PW_DEBUG_INSTALLED__) return;
  window.__ATOME_PW_DEBUG_INSTALLED__ = true;
  window.__pwDebugEvents = [];

  const shortNode = (node) => {
    if (!node) return null;
    if (node === window) return 'window';
    if (node === document) return 'document';
    if (node.nodeType !== 1) return String(node.nodeName || node);
    const el = node;
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.')
      : '';
    const role = el.getAttribute?.('role') ? `[role="${el.getAttribute('role')}"]` : '';
    return `${el.tagName?.toLowerCase?.() || el.nodeName}${id}${cls}${role}`;
  };

  const pathOf = (event) => {
    try {
      return event.composedPath().slice(0, 8).map(shortNode);
    } catch (_) {
      return [];
    }
  };

  const logEvent = (phase, event) => {
    const x = event.clientX ?? null;
    const y = event.clientY ?? null;
    const top = Number.isFinite(x) && Number.isFinite(y)
      ? document.elementFromPoint(x, y)
      : null;

    const entry = {
      phase,
      type: event.type,
      time: Math.round(performance.now()),
      isTrusted: event.isTrusted,
      target: shortNode(event.target),
      currentTarget: shortNode(event.currentTarget),
      topAtPoint: shortNode(top),
      clientX: x,
      clientY: y,
      button: event.button,
      buttons: event.buttons,
      pointerType: event.pointerType,
      path: pathOf(event),
      defaultPrevented: event.defaultPrevented,
    };

    window.__pwDebugEvents.push(entry);
    console.log('[PWDBG:event]', entry);
  };

  const eventTypes = [
    'pointerover', 'pointerenter', 'pointermove',
    'pointerdown', 'pointerup', 'pointercancel',
    'mouseover', 'mouseenter', 'mousemove',
    'mousedown', 'mouseup', 'click', 'dblclick',
    'touchstart', 'touchend', 'touchcancel',
    'focus', 'blur', 'keydown', 'keyup'
  ];

  for (const type of eventTypes) {
    window.addEventListener(type, (e) => logEvent('window:capture', e), true);
    window.addEventListener(type, (e) => logEvent('window:bubble', e), false);
    document.addEventListener(type, (e) => logEvent('document:capture', e), true);
    document.addEventListener(type, (e) => logEvent('document:bubble', e), false);
  }

  const btn = document.createElement('button');
  btn.id = 'pw-debug-probe';
  btn.type = 'button';
  btn.textContent = 'PW DEBUG CLICK';
  btn.setAttribute('aria-label', 'Playwright debug probe');
  btn.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'z-index:2147483647',
    'pointer-events:auto',
    'visibility:visible',
    'display:block',
    'opacity:0.97',
    'width:auto',
    'height:auto',
    'min-width:180px',
    'min-height:48px',
    'padding:12px 16px',
    'font:14px/1.2 monospace',
    'background:#111',
    'color:#fff',
    'border:2px solid #fff',
    'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    'cursor:pointer'
  ].join(';');

  let clicked = 0;

  const probeHandler = (event) => {
    logEvent('probe:handler', event);
    if (event.type === 'click') {
      clicked += 1;
      const next = String(clicked);
      btn.setAttribute('aria-pressed', clicked > 0 ? 'true' : 'false');
      btn.textContent = `PW DEBUG CLICK ${next}`;
      console.log('[PWDBG:probe-clicked]', { count: next, isTrusted: event.isTrusted });
    }
  };

  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    btn.addEventListener(type, probeHandler, true);
    btn.addEventListener(type, probeHandler, false);
  }

  document.body.appendChild(btn);

  window.__pwDebugProbeClicked = () => clicked;

  window.__pwDebugDumpPoint = (x, y) => {
    const stack = document.elementsFromPoint(x, y).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        node: shortNode(el),
        rect: {
          x: Math.round(r.x), y: Math.round(r.y),
          width: Math.round(r.width), height: Math.round(r.height)
        },
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        transform: cs.transform,
      };
    });
    console.table(stack);
    return stack;
  };

  window.__pwDebugDumpElement = (selectorOrElement) => {
    const el = typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;
    if (!el) return { error: 'Element not found', selectorOrElement };

    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    const centerY = r.top + r.height / 2;

    const dump = {
      node: shortNode(el),
      text: el.innerText || el.textContent || '',
      rect: {
        x: r.x, y: r.y, width: r.width, height: r.height,
        centerX, centerY
      },
      attrs: {
        id: el.id,
        class: el.className,
        role: el.getAttribute?.('role'),
        ariaLabel: el.getAttribute?.('aria-label'),
        tabindex: el.getAttribute?.('tabindex'),
        disabled: el.getAttribute?.('disabled'),
      },
      style: {
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        transform: cs.transform,
      },
      topAtCenter: shortNode(document.elementFromPoint(centerX, centerY)),
      stackAtCenter: window.__pwDebugDumpPoint(centerX, centerY),
    };

    console.log('[PWDBG:element]', dump);
    return dump;
  };

  console.log('[PWDBG] Installed. Use window.__pwDebugEvents, __pwDebugDumpPoint(x,y), __pwDebugDumpElement(selector).');
})();
```

### Critère de réussite

Après injection, Playwright doit pouvoir cliquer sur :

```js
await page.locator('#pw-debug-probe').click();
await expect.poll(() => page.evaluate(() => window.__pwDebugProbeClicked?.() || 0)).toBe(1);
```

Si ce bouton ne marche pas, le problème est global : Playwright, page bloquée, iframe, overlay navigateur, mauvais contexte, ou navigation non terminée.

Si ce bouton marche mais pas les tools Atome/eVe, le problème est dans l'exposition DOM/accessibilité/hit-test/event-model des tools Atome/eVe.

---

## Étape 2 — Créer un test Playwright dédié

Créer un fichier JavaScript, par exemple :

```txt
tests/probes/atome_eve_playwright_click_debug_probe.test.mjs
```

Avec ce squelette :

```js
import { test, expect } from '@playwright/test';

const APP_URL = process.env.ATOME_URL || 'http://localhost:3000';
const TOOL_SELECTOR = process.env.TOOL_SELECTOR || '';

test('debug Playwright clicks on Atome/eVe tools', async ({ page }) => {
  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.error('[browser:pageerror]', err);
  });

  await page.goto(`${APP_URL}${APP_URL.includes('?') ? '&' : '?'}pwdebug=1`, {
    waitUntil: 'domcontentloaded',
  });

  // Injecter ici le script de l'étape 1 avec page.addInitScript() ou page.evaluate().
  // Ne pas modifier le code produit pour installer ce bouton.

  await expect(page.locator('#pw-debug-probe')).toBeVisible();
  await page.locator('#pw-debug-probe').click();
  await expect.poll(() => page.evaluate(() => window.__pwDebugProbeClicked?.() || 0)).toBe(1);

  if (!TOOL_SELECTOR) {
    throw new Error('TOOL_SELECTOR is required and must point to an existing canonical tool/control target.');
  }

  const tool = page.locator(TOOL_SELECTOR).first();
  await expect(tool).toBeAttached();

  const dumpBefore = await tool.evaluate((el) => {
    return window.__pwDebugDumpElement?.(el) || null;
  });
  console.log('[PWDBG:dumpBefore]', JSON.stringify(dumpBefore, null, 2));

  const box = await tool.boundingBox();
  console.log('[PWDBG:boundingBox]', box);

  // Méthode A : click Playwright standard.
  try {
    await tool.click({ timeout: 3000 });
    console.log('[PWDBG] standard locator.click OK');
  } catch (err) {
    console.error('[PWDBG] standard locator.click FAILED', err);
  }

  // Méthode B : click forcé. Sert à tester l'actionability, pas comme solution finale.
  try {
    await tool.click({ force: true, timeout: 3000 });
    console.log('[PWDBG] force locator.click OK');
  } catch (err) {
    console.error('[PWDBG] force locator.click FAILED', err);
  }

  // Méthode C : click par coordonnées au centre.
  if (box) {
    try {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      console.log('[PWDBG] page.mouse center click OK');
    } catch (err) {
      console.error('[PWDBG] page.mouse center click FAILED', err);
    }
  }

  // Méthode D : event programmatique. Attention : ce n'est pas un vrai click utilisateur.
  try {
    await tool.dispatchEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    console.log('[PWDBG] dispatchEvent click OK');
  } catch (err) {
    console.error('[PWDBG] dispatchEvent click FAILED', err);
  }

  // Méthode E : séquence pointer/mouse complète.
  try {
    await tool.dispatchEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'mouse', button: 0, buttons: 1 });
    await tool.dispatchEvent('mousedown', { bubbles: true, composed: true, button: 0, buttons: 1 });
    await tool.dispatchEvent('pointerup', { bubbles: true, composed: true, pointerType: 'mouse', button: 0, buttons: 0 });
    await tool.dispatchEvent('mouseup', { bubbles: true, composed: true, button: 0, buttons: 0 });
    await tool.dispatchEvent('click', { bubbles: true, composed: true, button: 0 });
    console.log('[PWDBG] synthetic pointer/mouse sequence OK');
  } catch (err) {
    console.error('[PWDBG] synthetic pointer/mouse sequence FAILED', err);
  }

  const events = await page.evaluate(() => window.__pwDebugEvents || []);
  console.log('[PWDBG:events]', JSON.stringify(events.slice(-80), null, 2));
});
```

Adapter `TOOL_SELECTOR` avec un vrai sélecteur déjà existant du tool eVe/Atome à tester. Ne pas ajouter de `data-testid`, de `data-*`, de classe runtime ou d'attribut métier pour le seul besoin du test.

```html
<button id="existing-canonical-tool-id" aria-label="Existing localized tool name">...</button>
```

ou, si le propriétaire canonique expose déjà un contrôle non natif :

```html
<div id="existing-canonical-tool-id" role="button" tabindex="0" aria-label="Existing localized tool name">...</div>
```

Si aucun sélecteur stable n'existe, le résultat du diagnostic est `locator/accessibility target missing`. Ne pas créer un attribut de test local avant d'avoir identifié le propriétaire canonique du contrôle.

---

## Étape 3 — Ajouter une instrumentation avant chargement de l'app

Si on soupçonne que les listeners Atome/eVe sont attachés très tôt, ajouter temporairement un `addInitScript` avant `goto` pour tracer les registrations d'event listeners.

```js
await page.addInitScript(() => {
  window.__pwListenerRegistrations = [];
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if ([
      'click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
      'touchstart', 'touchend', 'dragstart', 'drag', 'drop'
    ].includes(type)) {
      const node = this instanceof Element
        ? `${this.tagName.toLowerCase()}#${this.id || ''}.${String(this.className || '').replace(/\s+/g, '.')}`
        : String(this);

      window.__pwListenerRegistrations.push({
        type,
        node,
        options,
        time: Math.round(performance.now()),
      });
    }

    return originalAddEventListener.call(this, type, listener, options);
  };
});
```

Après chargement :

```js
const registrations = await page.evaluate(() => window.__pwListenerRegistrations || []);
console.log('[PWDBG:listeners]', JSON.stringify(registrations.slice(-200), null, 2));
```

But : savoir si les tools Atome/eVe écoutent `click`, `pointerdown`, `mousedown`, `touchstart`, etc., et sur quel élément réel.

---

## Étape 4 — Vérifier l'accessibility tree / MCP

Comme Codex en mode Playwright peut cibler les éléments via les refs d'accessibility snapshot, vérifier :

- le tool apparaît-il comme `button`, `link`, `menuitem`, etc. ?
- a-t-il un nom accessible clair ?
- le snapshot montre-t-il plusieurs éléments identiques ?
- le ref utilisé pointe-t-il vers le bon outil ?

Ne corrige pas temporairement les tools. Si le snapshot prouve un défaut d'accessibilité, produire un rapport qui identifie le propriétaire canonique du contrôle à corriger.

Un correctif produit futur devra utiliser le composant Squirrel/Atome canonique ou son propriétaire eVe existant. Il pourra ajouter des attributs d'accessibilité standard uniquement s'ils sont nécessaires au vrai contrôle utilisateur, pas comme contournement Playwright :

```html
role="button"
tabindex="0"
aria-label="Nom unique du tool"
```

Pour un composant non natif, le support clavier doit être ajouté uniquement dans le propriétaire canonique du composant, via son API/factory existante, pas par un listener local posé dans le probe :

```js
el.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    el.click();
  }
});
```

Critère : si Playwright/Codex arrive à cibler le bouton de test mais pas les tools Atome, rendre les tools accessibles est une piste prioritaire.

---

## Étape 5 — Interprétation des résultats

### Cas A — Le bouton `#pw-debug-probe` ne reçoit rien

Conclusion probable : problème global Playwright/contexte navigateur.

À vérifier :

- la page active est-elle la bonne ?
- l'app est-elle dans un iframe ?
- le clic est-il envoyé dans le bon frame ?
- Playwright est-il en mode headless/headed différent ?
- le viewport ou zoom place-t-il le bouton hors écran ?
- la page a-t-elle une modale navigateur, dialog, permission prompt, overlay DevTools ?

### Cas B — Le bouton debug reçoit les events, mais le tool Atome ne reçoit rien

Conclusion probable : overlay, hit-test ou mauvaise cible.

À vérifier avec :

```js
window.__pwDebugDumpElement('#existing-canonical-tool-id')
window.__pwDebugDumpPoint(x, y)
```

Remplacer l'exemple de sélecteur par un id, rôle accessible, ou autre sélecteur déjà existant dans le contrôle canonique inspecté.

Chercher :

- un élément transparent au-dessus ;
- `pointer-events:none` sur le tool ;
- `pointer-events:auto` sur un parent/overlay qui capture ;
- `z-index` inattendu ;
- transform CSS qui décale la zone cliquable ;
- bounding box vide ou trop petite ;
- élément réel différent du wrapper visuel.

### Cas C — Le tool reçoit `pointerdown/mousedown`, mais pas `click`

Conclusion probable : le framework annule la séquence ou attend une interaction spécifique.

À vérifier :

- `preventDefault()` ou `stopPropagation()` ;
- drag threshold ;
- long press ;
- handler attaché à `pointerdown` au lieu de `click` ;
- le tool change de DOM entre down/up ;
- un overlay apparaît au hover ou au pointerdown.

### Cas D — `dispatchEvent('click')` marche mais `locator.click()` ne marche pas

Conclusion probable : actionability/hit-test/overlay. Playwright refuse ou clique ailleurs parce qu'un élément intercepte.

Ne pas garder `dispatchEvent` comme solution finale sauf pour un mode test volontaire. Corriger plutôt la cible, le z-index, `pointer-events`, ou les locators.

### Cas E — `locator.click({ force: true })` marche mais `locator.click()` échoue

Conclusion probable : l'élément est visible mais Playwright estime qu'il ne reçoit pas les events à cause d'un overlay ou d'un hit-target différent.

Inspecter `elementsFromPoint()` au centre du tool.

### Cas F — Le click par coordonnées marche mais pas le locator

Conclusion probable : locator mauvais, élément wrapper non interactif, ou accessibilité insuffisante.

Solution : utiliser un sélecteur canonique existant, corriger l'accessibilité dans le propriétaire canonique si elle est réellement absente, ou cibler l'élément interne qui possède réellement le handler. Ne pas ajouter de `data-*` comme raccourci de test.

### Cas G — Le locator marche dans test Playwright mais pas via Codex/MCP

Conclusion probable : problème d'exposition accessibility snapshot ou de ref MCP.

Solution : rendre les tools explicitement accessibles et nommés dans leur propriétaire canonique, puis utiliser les refs du snapshot.

---

## Étape 6 — Correctifs probables à proposer après diagnostic

Ne proposer un correctif qu'après avoir classé le problème dans un cas ci-dessus.

Correctifs typiques :

1. **Accessibilité / MCP**
   - Remplacer les `div` cliquables muets par des `button` natifs quand le propriétaire canonique le permet.
   - Sinon ajouter `role="button"`, `tabindex="0"`, `aria-label` dans le propriétaire canonique.
   - Donner un nom unique à chaque tool eVe.

2. **Overlay / z-index**
   - Supprimer les overlays invisibles qui couvrent les tools.
   - Mettre `pointer-events:none` sur les calques décoratifs.
   - Garder `pointer-events:auto` uniquement sur les vraies cibles.

3. **Mauvaise cible DOM**
   - Déplacer le handler sur l'élément visible réellement cliqué.
   - Ou faire remonter le click du child vers le wrapper explicitement.

4. **Event model Atome/eVe**
   - Si Atome utilise `pointerdown`, le test doit cliquer via une séquence pointer complète.
   - Si Atome attend un drag, utiliser `page.mouse.move/down/move/up` avec coordonnées.
   - Si Atome ignore `click`, ne pas tester uniquement `click`.

5. **Canvas/SVG**
   - Si les tools sont dessinés dans canvas, Playwright ne peut pas cibler des sous-éléments DOM inexistants.
   - Ne pas ajouter de proxies DOM accessibles au-dessus du canvas.
   - Ne pas exposer d'API test-only qui contourne le vrai chemin d'interaction.
   - Diagnostiquer par hit-test canvas, coordonnées, accessibility snapshot des contrôles canoniques existants, et logs de routage d'events.

6. **Iframe / Shadow DOM**
   - Utiliser `frameLocator()` si l'app ou le tool est dans un iframe.
   - Vérifier les shadow roots et cibler l'élément réel.

7. **Hydratation / timing**
   - Attendre un signal métier : `window.__ATOME_READY__ === true`.
   - Ne pas se contenter de `domcontentloaded` si Atome hydrate après.

---

## Livrables attendus

Produire :

1. Un test/probe Playwright dédié en JavaScript sous `tests/probes`.
2. Un bouton debug `#pw-debug-probe` injecté uniquement par Playwright au-dessus de l'UI Atome.
3. Un logger d'events consultable via `window.__pwDebugEvents`.
4. Une fonction `window.__pwDebugDumpElement(selectorOrElement)`.
5. Une fonction `window.__pwDebugDumpPoint(x, y)`.
6. Un rapport court avec :
   - est-ce que le bouton debug marche ?
   - est-ce que le tool Atome reçoit des events ?
   - quel élément est au-dessus du tool selon `elementsFromPoint()` ?
   - quelle méthode marche : standard click, force click, coordonnées, dispatchEvent, pointer sequence ?
   - conclusion : overlay, locator, accessibilité, event-model, iframe/shadow, canvas, timing, ou autre.
7. Aucun correctif produit pendant le diagnostic. Si un correctif est nécessaire, livrer seulement le propriétaire canonique, la catégorie du problème, et le plus petit changement conforme à faire ensuite.

---

## Format du rapport attendu

```md
# Rapport debug Playwright Atome/eVe

## Résumé
- Bouton debug HTML : OK / KO
- Tool Atome/eVe : OK / KO
- Clic standard : OK / KO
- Clic force : OK / KO
- Clic coordonnées : OK / KO
- dispatchEvent : OK / KO
- Séquence pointer/mouse : OK / KO

## Observations
- Élément ciblé : ...
- Bounding box : ...
- Top element au centre : ...
- Stack elementsFromPoint : ...
- Events reçus : ...
- Listeners détectés : ...

## Diagnostic
Catégorie : overlay / locator / accessibilité / event-model / iframe / shadow DOM / canvas / timing / autre.

## Correctif proposé
...

## Patch minimal
Non applicable pendant le diagnostic. Toute modification produit exige un nouveau passage par les règles `.codex/AGENTS.md`, les maps, le propriétaire canonique, et les validations adaptées.

## Risque
...
```

---

## Règle finale

Ne pas conclure “Playwright bug” avant d'avoir prouvé que :

- un bouton HTML indépendant reçoit bien les events ;
- le tool Atome/eVe ne les reçoit pas ou les reçoit différemment ;
- le hit-test au point de clic montre la vraie cible ;
- l'accessibility snapshot expose ou n'expose pas correctement le tool ;
- au moins trois méthodes de clic ont été comparées.
