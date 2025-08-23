# Lyrix AUv3 Launcher & Document Picker — Copilot Prompt

Le concept est **totalement faisable** et conforme iOS/App Store. Ce document réunit **tout ce qu’on a évoqué** : objectifs, contraintes, UI stricte (3 éléments), IDs obligatoires, étapes Swift & JS, signatures, contrats de bridge, logging, et checklists.

---

## Objectifs & contraintes (rappel)

- Ouvrir **applications** (URL schemes / Universal Links) et **documents** **uniquement** sur **action utilisateur**.
- Récupérer **seulement l’adresse** via Document Picker (pas d’import de contenu par défaut).
- Persister les adresses dans **App Group**.
- **Aucune énumération** globale des apps installées; côté App on teste une **liste finie**.
- **Réutiliser** le serveur local existant (pas de doublon technologique).
- UI réduite à **3 éléments** avec **IDs obligatoires**.

---

## UI (AUv3) — Spécification stricte

1. **Bouton** `btn_document_picker`\
   Action : ouvre un Document Picker, récupère l’**URL** (adresse) du document, **log** dans Xcode, **ajoute à la liste**.
2. **Champ texte** `input_app_address` (prérempli avec l’adresse de l’app Lyrix)\
   Action : sur **Return**, valide l’adresse (URL), **log**, **ajoute à la liste**.
3. **Liste** `list_collected_addresses`\
   Action : **tap** sur un élément → ouvre l’adresse :
   - si **document** : ouverture avec l’app iOS par défaut (ou Universal Link si applicable),
   - si **app** : lance l’app cible.

> **Aucun autre contrôle UI** n’est autorisé. Chaque élément UI doit avoir **accessibilityIdentifier** égal à son **ID** ci‑dessus.

---

## Données & stockage partagé

- **Modèle**
  - `LinkItem { id: String, urlString: String, createdAt: Date }`
- **Stores** (App Group)
  - `LinkStore.load()/save()/add(urlStrings:)/remove(id:)`
- **App Group ID** : `group.com.atome.lyrix` (adapter si besoin)

---

## Swift — Signatures & flux (AUv3)

### Identifiants UI

- `btn_document_picker`, `input_app_address`, `list_collected_addresses`\
  (plus `cell_link` pour les cellules de la liste)

### Contrat fonctionnel (AUv3ViewController)

- `func onTapDocumentPicker()` → présente le picker et récupère **l’adresse**
- `func onSubmitAppAddress(_ text: String?)` → valide, log, ajoute
- `func onTapAddress(at index: Int)` → ouvre l’adresse (app/document)
- `func appendAddressToList(_ address: String)` → persiste + reload
- `func logAddress(_ url: URL)` → `Logger.info`
- `func openURLFromExtension(_ url: URL)` → `extensionContext?.open(url)`

### Exigences d’ouverture

- **Toujours** suite à une action utilisateur (tap/Return).
- Alerte minimaliste si `open` retourne `false`.

### Document Picker (adresse uniquement)

- `UIDocumentPickerViewController(forOpeningContentTypes:[UTType], asCopy:false)`
- Utiliser `url.absoluteString` comme adresse enregistrée.

### Classification adresse (ouverture)

- **App** : schémas connus (ex. `lyrix`, `aum.audiobus`, `loopypro`) ou Universal Link d’un domaine connu.
- **Document** : `file://…`, `https://…` vers contenu.
- **Inconnu** : demander confirmation (UIAlertController système, pas de contrôles additionnels).

---

## Swift — Côté App (standalone)

- **Deep Links** : `lyrix://` + **Universal Links** (AASA, `applinks:example.com`).
- **Gestion** : `SceneDelegate.scene(_:openURLContexts:)` & `continue userActivity` → `DeepLinkRouter.handle(url:)`.
- **Test de schémas** : `UIApplication.canOpenURL` sur **liste finie** (persister le résultat en App Group si utile à l’AUv3).
- **Réutilisation serveur** : interface `LocalContentService` avec implémentation `ExistingServerContentService` branchée sur **votre serveur local existant** (127.0.0.1, local‑only).

---

## JS (Squirrel) — Architecture modulaire & réutilisable

### Découpage des modules (ES Modules)

- `core/addressList.js`
  - `add(address: string): LinkItem`
  - `remove(id: string): void`
  - `all(): LinkItem[]`
  - `classify(address: string): 'app'|'document'|'unknown'`
- `io/documentPicker.js`
  - `presentForFileAddress(): Promise<string>`  // demande au natif le picker de **fichier** et retourne **l’adresse**
  - `presentForLinksJSON(): Promise<string[]>`   // optionnel pour importer des listes de liens
- `io/deeplink.js`
  - `openAddress(address: string): Promise<boolean>`  // passe au natif (AUv3/App effectue l’ouverture)
- `bridge/squirrel.js`
  - `invokeNative(method: string, payload?: any): Promise<any>`
  - Méthodes standard : `open_link`, `present_picker_file`, `present_picker_links_json`, `log_address`, `append_address`
- `ui/ids.js`
  - `export const IDs = { btnPicker:'btn_document_picker', inputApp:'input_app_address', list:'list_collected_addresses' }`
- `ui/controller.js`
  - `onPickerTap()`, `onInputReturn(value)`, `onListItemTap(id)`
  - `render(list)` minimal (aucun widget supplémentaire)

### Flux JS

1. Tap bouton → `documentPicker.presentForFileAddress()` → adresse → `addressList.add()` → `bridge.log_address()` → `render()`
2. Return champ texte → validation (URL) → `addressList.add()` → `bridge.log_address()` → `render()`
3. Tap liste → `deeplink.openAddress(address)` → toast/alerte en cas d’échec

---

## Bridge JS ⇄ Swift — Contrats

**JS → Swift**

- `open_link { address: string }`
- `present_picker_file {}` → `{ address: string | null }`
- `present_picker_links_json {}` → `{ addresses: string[] }` (optionnel)
- `log_address { address: string }`
- `append_address { address: string }` (si persistance côté natif)

**Swift → JS** (callbacks)

- `picker_result { address?: string, addresses?: string[] }`
- `open_result { ok: boolean }`

> Réutiliser **le bridge existant** (Squirrel/WKWebView). **Pas de nouveau canal.**

---

## Logging & Privacy

- `Logger(subsystem:"com.atome.lyrix", category:"AUv3Launcher")`
- Log **uniquement** les adresses (pas de contenu). Aucune PII.
- Mentionner en fiche App Store : *« Uses a local‑only server (127.0.0.1) to access files stored in the shared App Group. No data leaves the device. »*

---

## Checklists

### Technique

-

### App Store

-

---

## Extraits de signatures (copier‑coller)

### Swift (AUv3)

```
final class AUv3ViewController: UIViewController, UIDocumentPickerDelegate, UITableViewDataSource, UITableViewDelegate, UITextFieldDelegate {
    @IBOutlet weak var btnDocumentPicker: UIButton!     // id = btn_document_picker
    @IBOutlet weak var inputAppAddress: UITextField!    // id = input_app_address
    @IBOutlet weak var listAddresses: UITableView!      // id = list_collected_addresses

    @IBAction func onTapDocumentPicker(_ sender: Any) {}
    func textFieldShouldReturn(_ tf: UITextField) -> Bool { onSubmitAppAddress(tf.text); tf.resignFirstResponder(); return true }

    func onSubmitAppAddress(_ text: String?) {}
    func onTapAddress(at index: Int) {}

    // helpers
    func appendAddressToList(_ address: String) {}
    func logAddress(_ url: URL) {}
    func openURLFromExtension(_ url: URL) {}
}
```

### Swift (App)

```
enum DeepLinkRouter {
    static func handle(url: URL) {}
}

enum URLAvailabilityService {
    static func testSchemes(_ schemes: [String]) -> [String: Bool] { [:] }
}
```

### JS (Squirrel)

```
// core/addressList.js
export function add(address) {}
export function remove(id) {}
export function all() { return [] }
export function classify(address) { return 'unknown' }

// io/documentPicker.js
export async function presentForFileAddress() { return null }

// io/deeplink.js
export async function openAddress(address) { return false }

// bridge/squirrel.js
export async function invokeNative(method, payload) { /* reuse existing bridge */ }

// ui/controller.js
export function onPickerTap() {}
export function onInputReturn(value) {}
export function onListItemTap(id) {}
```

---

## Prochaines étapes

1. Générer le squelette Swift & JS avec ces signatures et IDs exacts.
2. Brancher `ExistingServerContentService` sur **votre serveur existant** (aucun nouveau serveur).
3. Activer AASA/Universal Links côté App et tester sur device.
4. Rédiger 2–3 tests unitaires (Swift/JS) sur `LinkStore` et `addressList`.

---


