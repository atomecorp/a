# Cross‑platform Host Layer for Atome (Tauri / NodeGui / NativeScript)

## 1. Hard conclusions

1. A **single codebase with zero platform specificity** that runs *unchanged* on Tauri, NodeGui and NativeScript **n’est pas possible** si l’app fait de la vraie GUI et des I/O système.
2. Les trois stacks n’ont **pas le même modèle d’UI** ni le même accès système :

   * **Tauri**: WebView + DOM + CSS + bridge Rust.
   * **NodeGui**: widgets **Qt natifs**, pas de DOM.
   * **NativeScript**: vues **natives iOS/Android**, pas de DOM ni Qt.
3. Vouloir éviter totalement les APIs spécifiques revient à **interdire l’accès** au DOM, à Qt et aux vues natives → donc plus de GUI réelle.

Conclusion dure : tu peux avoir **un noyau unique**, mais pas une app entière 100 % identique sans aucune couche spécifique.

---

## 2. Objectif réaliste

Objectif atteignable :

* Un **noyau Atome/Squirrel unique** (logique, modèle de données, DSL) commun à toutes les plateformes.
* Une **API d’abstraction d’OS virtuel** (AtomeHost) définie une fois.
* **Plusieurs backends** (Tauri / NodeGui / NativeScript) qui implémentent cette API.

Tu gardes :

* La **même logique métier**,
* Les mêmes objets, scènes, timelines,
* La même grammaire DSL,

…et tu changes seulement le **module host** pour cibler un autre runtime.

---

## 3. Architecture proposée (3 couches)

### Couche 1 – Noyau commun (core)

* Langage : TypeScript/JS (et/ou Rust côté bas niveau si besoin).
* Contenu :

  * Modèle d’objets (ADOLE / Squirrel).
  * Timelines, permissions, history, synchronisation.
  * Toute la logique métier pure.
* Interdiction de :

  * DOM, Web APIs directes.
  * Qt direct.
  * APIs natives iOS/Android directes.

Le noyau ne parle qu’à l’API AtomeHost.

### Couche 2 – API d’abstraction : `AtomeHost`

Interfaces génériques, par exemple :

```ts
interface UIHost {
  createView(type: 'box' | 'text' | 'button', props: Record<string, any>): ViewHandle;
  updateView(handle: ViewHandle, props: Record<string, any>): void;
  removeView(handle: ViewHandle): void;
}

interface FileHost {
  read(path: string): Promise<ArrayBuffer>;
  write(path: string, data: ArrayBuffer): Promise<void>;
}

interface AudioHost {
  startInput(config: AudioConfig): AudioStreamHandle;
  stopInput(handle: AudioStreamHandle): void;
}

interface HostCapabilities {
  hasSystemTray: boolean;
  hasMultiWindow: boolean;
  supportsBackgroundAudio: boolean;
}
```

Le code Atome/Squirrel utilise uniquement ces interfaces.

### Couche 3 – Backends spécifiques

* **Backend Tauri**

  * `UIHost` → DOM + CSS + Canvas/WebGL dans WebView.
  * `FileHost` / `AudioHost` → commands Tauri (Rust).

* **Backend NodeGui**

  * `UIHost` → widgets Qt (`QWidget`, `QLabel`, etc.).
  * `FileHost` / `AudioHost` → Node.js + modules natifs.

* **Backend NativeScript**

  * `UIHost` → vues natives (`View`, `StackLayout`, `Label`, etc.).
  * `FileHost` / `AudioHost` → APIs natives exposées par NativeScript.

Le **contrat** est commun, seules les implémentations changent.

---

## 4. Compromis inévitables

1. **Plus petit dénominateur commun**

   * L’API AtomeHost ne peut exposer que ce qui est raisonnablement mappé sur Tauri, NodeGui et NativeScript.
   * Les features très spécifiques (par ex. Dynamic Island, features Qt exotiques…) doivent être soit ignorées, soit gérées comme extensions optionnelles.

2. **Branches de comportement basées sur les capacités**

   * Le code app ne doit pas tester `if (backend === 'tauri')`, mais `if (capabilities.hasSystemTray)`.
   * Tu gardes un **code central commun**, avec des branches contrôlées par les capacités exposées par le backend.

3. **UX différente desktop vs mobile**

   * Tu ne peux pas avoir une UX parfaite sur desktop et mobile avec *exactement* le même layout sans aucun ajustement.
   * Tu accepteras quelques conditions (via capabilities ou profils d’UI) pour adapter les comportements.

---

## 5. Roadmap minimale pour Atome

1. **Stabiliser le noyau Atome/Squirrel**

   * Extraire / isoler tout ce qui est pur modèle + logique.
   * Interdire les appels direct au DOM / Web / Node / natif dans ce périmètre.

2. **Designer la spec****AtomeHost**

   * Lister les besoins réels : UI, audio, fichiers, réseau, notifications, etc.
   * Définir les interfaces TypeScript et le système de `HostCapabilities`.

3. **Implémenter le backend Tauri en premier**

   * C’est le plus aligné avec ton stack actuel (web + Rust).
   * Servira de référence pour la sémantique de l’API.

4. **Porter ensuite vers NodeGui et NativeScript**

   * Reprendre la même spec `AtomeHost`.
   * Créer `nodegui-host` et `nativescript-host` qui implémentent l’API.

5. **Standardiser le build / switch de backend**

   * Un flag ou une config (`ATOME_HOST=tauri|nodegui|nativescript`).
   * Le noyau reste identique, seul le module host lié / importé change.

---

## 6. Résumé

* Tu ne peux pas avoir **zéro** code spécifique par plateforme si tu veux une vraie GUI + accès système.
* Tu peux en revanche avoir un **noyau unique**, un **DSL unique** et une **API d’hôte unique**, avec trois implémentations clean (Tauri, NodeGui, NativeScript).
* Le “switch” entre les trois devient alors un choix de backend au build, sans toucher au code du noyau ni aux scènes/atomes définies en Squirrel/ADOLE.
