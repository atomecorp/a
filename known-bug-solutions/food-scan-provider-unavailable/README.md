# Barcode scan answers « Service produits indisponible » (and keeps doing so for minutes)

## Symptom
Mes courses › Scan (or Produits › Photo, a meal's Scan, `food.lookup` / `food.scan` / `food.add`): the code is read, then the
sheet says « Service produits indisponible » (`PROVIDER_UNAVAILABLE`) — for every product, for about five minutes — while
Open Food Facts itself answers the product.

## Cause (found 2026-11-04, D14)
`server/ws_open_food_facts.js` read the OFF additives taxonomy (`additives.json`, ~0.9 MB) before every first product read,
under the shared 8 s request timeout, and a failed taxonomy load (slow network, loaded host) set a 5-minute retry delay
during which `additiveRisks()` threw at once: every product read and search failed with it, though the product page
was reachable.

## Fix
The product is read whatever the taxonomy does: `risksOrUnknown` logs `ADDITIVES_TAXONOMY_UNAVAILABLE` and the product
carries `additives_evaluated: false` (its additives' risks unknown, never « no risk »); it is not cached, so a later read
judges it. `food_health_assessment.js`: such a product with additives gets no « good » verdict and its selection rule
`additive_high_risk` is `to_check` / `additives_unevaluated`. The client keeps the flag (`food_product_store.js`,
`storedFoodProduct`, item schema `additives_evaluated`) and reads a kept unevaluated product again (`seenProduct`).

## Regression check
`node temp/d18_scanner/proxy.probe.mjs 3229820129488` (live OFF; the last block simulates the taxonomy down: the product is
still served, `additives_evaluated: false`, verdict never « good » with additives, reason `additives_unevaluated`).
Full flow: `PROBE_ISOLATED=1 node temp/d18_scanner/main.probe.mjs`.

## Acceptance
A scan on a fresh server (taxonomy not yet loaded, or failing) shows the product's sheet, never « Service produits
indisponible » while OFF answers the product. Production (atome.one relays every iOS/Tauri read) needs the server deployed.
