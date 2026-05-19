# PurchaseKit -- Documentation

## 1. Configuration côté App Store Connect

1.  **Créer les produits**
    -   Types : consommable, non-consommable, abonnement.
    -   Créer des IDs stables (ex. `com.atome.lyrix.pro`).
2.  **Configurer dans App Store Connect**
    -   Menu *Fonctionnalités → Achats intégrés*.
    -   Renseigner les noms, descriptions et prix.

## 2. Configuration côté Xcode

1.  **Activer la capacité In-App Purchase** dans *Signing &
    Capabilities*.
2.  **(Optionnel) App Group** pour AUv3 (ex. `group.com.atome.shared`).
3.  **Créer un fichier .storekit** pour tester localement.

## 3. Intégration du code

Le code est structuré en deux fichiers principaux :

### PurchaseKit/EntitlementStore.swift

Gère la sauvegarde des achats en local (UserDefaults ou App Group).

### PurchaseKit/PurchaseManager.swift

-   Chargement des produits.
-   Achats et restauration.
-   Gestion des transactions en arrière-plan.

## 4. Exemple d'intégration SwiftUI

``` swift
struct ContentView: View {
    private let ids: Set<String> = ["com.atome.lyrix.pro"]
    var body: some View {
        PaywallView(productIDs: ids)
    }
}
```

## 5. AUv3 -- Partage des droits

-   Utiliser le même App Group pour partager l'état des achats entre
    l'app et l'extension AUv3.

## 6. Pont WebView (optionnel)

-   Permet d'exposer les achats dans la WebView.
-   Utilise un handler JS → Swift pour les commandes et un callback
    Swift → JS pour les réponses.

## 7. Tests et soumission

-   Tester d'abord avec le fichier `.storekit`.
-   Ensuite tester avec un compte Sandbox.
-   Vérifier la restauration des achats.
-   Soumettre avec les produits bien configurés dans App Store Connect.

## 8. Bonnes pratiques

-   Toujours vérifier les transactions (`VerificationResult`).
-   Isoler la logique d'achat dans PurchaseKit.
-   Ne jamais accorder d'accès sans transaction vérifiée.

