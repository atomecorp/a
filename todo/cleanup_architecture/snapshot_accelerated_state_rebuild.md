# Reconstruction accélérée de `state_current`

**Différable.** Mesurer d’abord le rejeu intégral sur de gros historiques. La création et la restauration manuelles existent déjà dans les chemins Rust. Le travail restant est la reconstruction à partir d’un snapshot vérifié et des événements qui le suivent. [Snapshots du coffre](../../atome/engines/atome-store/src/snapshots.rs) · [Snapshots locaux](../../atome/servers/atome-server/src/local/local_atome_snapshots.rs)

1. Donner au snapshot immuable un périmètre, un curseur d’événement déterministe, les versions du schéma et de la projection, et une empreinte couvrant la projection et son curseur. Valider la compatibilité, l’intégrité, les droits et la continuité avant de l’utiliser. Le curseur suit l’ordre du journal, y compris pour des horodatages identiques.
2. Reconstruire dans une projection isolée. Prouver l’équivalence avec le rejeu intégral à la même borne d’événements avant activation. En cas de snapshot absent ou invalide, signaler le motif et utiliser le rejeu intégral de référence. Publier la projection validée atomiquement.
3. Couvrir les cas hors ligne, les événements tardifs ou dupliqués, les conflits de synchronisation et l’interruption pendant la reconstruction, sur les chemins Rust local et serveur. Mesurer le gain sur un historique représentatif.

L’historique et les versions de propriétés restent consultables. Toute politique de rétention ou de suppression relève d’une décision distincte, après preuve d’une restauration sûre. [Contrat de persistance](../../eVe/documentations/atome_persistence_contract.md) · [ATM-2011](../execution_order.md)
