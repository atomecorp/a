# Prompt Xcode — Implémenter schémas d’URL + Universal Links + déclenchement depuis AUv3 (simple, efficace, technique)

Objectif
- Permettre à l’app hôte (standalone) d’ouvrir directement une chanson/projet via lyrix:// et via des Universal Links (https://ton-domaine/...).
- Depuis l’extension AUv3, déclencher ces ouvertures proprement sans contourner la sandbox, via l’API d’extension.
- Fournir des exemples testables et un plan de vérification.

Prérequis
- Xcode ≥ 15, iOS ≥ 16 (ok iOS 15+ si nécessaire).
- Identifiant de domaine (ex: example.com) dont vous contrôlez le contenu pour apple-app-site-association.
- Cible App (standalone) + Extension AUv3 (Audio Unit) dans le même projet.

1) Déclarer un schéma d’URL custom (lyrix://)
- Cible App → Info → URL Types.
- Ajouter:
    
    Type identifier: com.atome.lyrix
    URL Schemes: lyrix
    Role: Editor (ou None)
    Icon (optionnel)

- Résultat équivalent Info.plist (si édition manuelle):
    
        <key>CFBundleURLTypes</key>
        <array>
          <dict>
            <key>CFBundleURLName</key>
            <string>com.atome.lyrix</string>
            <key>CFBundleURLSchemes</key>
            <array>
              <string>lyrix</string>
            </array>
          </dict>
        </array>

2) Activer les Universal Links (Associated Domains)
- Cible App → Signing & Capabilities → + Capability → Associated Domains.
- Ajouter au moins:
    
        applinks:example.com
        applinks:www.example.com

- Héberger à la racine du domaine example.com un fichier JSON apple-app-site-association (sans extension, Content-Type: application/json). Exemple minimal:
    
        {
          "applinks": {
            "apps": [],
            "details": [{
              "appID": "TEAMID.com.atome.lyrix",
              "paths": [ "/lyrix/*", "/open/*" ]
            }]
          }
        }

- Remplacer TEAMID par votre Team ID Apple, et le bundleID par celui de l’app.
- Déployer sur HTTPS, sans redirection, sans compression exotique.

3) Routage côté App (UIScene) — gérer lyrix:// et https://example.com/lyrix/…
- Dans SceneDelegate (projet SwiftUI/Storyboard, adapter si AppDelegate only):
    
        import UIKit

        class SceneDelegate: UIResponder, UIWindowSceneDelegate {
            var window: UIWindow?

            func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
                guard let url = URLContexts.first?.url else { return }
                DeepLinkRouter.route(url: url)
            }

            func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
                if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
                   let url = userActivity.webpageURL {
                    DeepLinkRouter.route(url: url)
                }
            }
        }

- Un routeur ultra-simple:
    
        enum DeepLinkRouter {
            static func route(url: URL) {
                // lyrix://open?song=SongID
                if url.scheme == "lyrix" {
                    handleLyrixURL(url)
                    return
                }
                // https://example.com/lyrix/open/SongID
                if url.host?.contains("example.com") == true {
                    handleUniversalLink(url)
                    return
                }
            }

            private static func handleLyrixURL(_ url: URL) {
                let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
                let songID = comps?.queryItems?.first(where: { $0.name == "song" })?.value
                if let id = songID { openSong(withID: id) }
            }

            private static func handleUniversalLink(_ url: URL) {
                let path = url.path  // ex: /lyrix/open/SongID
                let parts = path.split(separator: "/").map(String.init)
                if parts.count >= 3, parts[0] == "lyrix", parts[1] == "open" {
                    openSong(withID: parts[2])
                }
            }

            private static func openSong(withID id: String) {
                // Brancher ici la logique d’ouverture de chanson/projet dans l’app
                // Exemple: AppModel.shared.openSong(id: id)
                print("Open song id =", id)
            }
        }

4) Déclencher l’ouverture depuis l’extension AUv3
- Dans le ViewController de l’UI AUv3 (hérité d’UIViewController), lors d’un tap utilisateur:
    
        import UIKit
        import AudioToolbox
        import AVFoundation

        final class AUv3ViewController: UIViewController {

            @IBAction func openLyrixSongButtonTapped(_ sender: Any) {
                guard let url = URL(string: "lyrix://open?song=MySong123") else { return }
                extensionContext?.open(url, completionHandler: { success in
                    // success indique si le handoff vers l’app cible s’est effectué
                    // Aucun contournement sandbox: appel officiel d’extension
                    print("Open URL from AUv3 =", success)
                })
            }
        }

- Notes
  - Toujours déclencher depuis une interaction utilisateur (tap/bouton) pour éviter tout blocage d’iOS.
  - extensionContext?.open(...) est l’API correcte pour une extension; pas besoin d’UIApplication.shared.

5) Tests rapides (simulateur et device)
- Simulateur: lancer l’app, puis dans un terminal:
    
        xcrun simctl openurl booted "lyrix://open?song=SimSong001"
        xcrun simctl openurl booted "https://example.com/lyrix/open/SimSong002"

- Device
  - Envoyez-vous l’URL par iMessage/Notes et touchez-la.
  - Pour les Universal Links, vérifier que la bannière “Ouvrir dans Lyrix” apparaît et que l’URL ne s’ouvre pas dans Safari (sinon, vérifier apple-app-site-association, cache, et qu’aucune redirection n’est en place).

6) Checklist de validation
- Lancer l’app, coller dans Safari: lyrix://open?song=Test1 → l’app s’ouvre sur la bonne vue.
- Toucher https://example.com/lyrix/open/Test2 dans Notes → ouverture directe dans l’app (pas Safari).
- Depuis l’UI AUv3, bouton “Open Song” → handoff immédiat vers l’app.
- Multi-instance AUv3: répéter; le comportement reste identique (contexte foreground via l’hôte).

7) Bonnes pratiques
- Normaliser les actions: lyrix://open?song=ID, lyrix://setlist?name=MySet, lyrix://mode?fullscreen=1.
- Côté Universal Links, garder une arbo cohérente: /lyrix/open/:id, /lyrix/setlist/:name.
- Fournir un bouton “Copier lien de la chanson” dans l’app pour partager facilement des deep links.
- Journaliser l’échec d’ouverture (erreurs réseau pour universal links, paramètres manquants) pour diagnostiquer vite.
- Si l’app cible n’expose pas de schéma/lien, impossible d’ouvrir un fichier privé de cette app (sandbox). Passer par UIDocumentPicker si besoin d’un choix utilisateur.

8) Exemples prêts à l’emploi
- URL scheme (ouvrir chanson):
    
        lyrix://open?song=MySong123

- Universal link (ouvrir chanson):
    
        https://example.com/lyrix/open/MySong123

- apple-app-site-association (minimal, multiple bundles si besoin):
    
        {
          "applinks": {
            "apps": [],
            "details": [
              { "appID": "TEAMID.com.atome.lyrix", "paths": [ "/lyrix/*", "/open/*" ] }
            ]
          }
        }

9) Dépannage éclair
- Universal Link s’ouvre dans Safari → vérifier AASA (HTTPS sans redirection, MIME JSON, chemins corrects), bundleID/TeamID, réinstaller l’app (cache des liens).
- extensionContext?.open renvoie false → pas d’app pour l’URL scheme, ou pas d’interaction utilisateur; tester d’abord dans la standalone.
- Rien ne se passe sur un lien lyrix:// dans iOS → valider CFBundleURLTypes et redémarrer le device (caching des handlers).

Fin — Ce prompt est prêt à coller dans Xcode (README.md de ton projet). Garde-le au root du repo.
