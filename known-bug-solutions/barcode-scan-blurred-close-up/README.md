# Barcode scan on iPhone: the code stays blurred, nothing is read, no beep

## Symptom
Mes courses › Scan on an iPhone (1.54): the camera never gets the code sharp, the code is never read, so no beep
(the beep sounds only on a read whose GTIN check digit holds, `eVe/domains/media/api/barcode_scan.js`) — user report,
7 Nov. 2026. The product lookup itself works: atome.one answers `food-facts` `lookup` 3017620422003 with « Nutella ».

## Cause
The preview's photo session reads the back wide camera (`AppNativeMediaCaptureSupport.swift#makePhotoSession`) with no
setting for a scan. That camera does not focus nearer than its minimum focus distance (about 20 cm on an iPhone Pro);
the hand brings the code closer to fill the image, where it can only be blurred, and the metadata output reads
nothing.

## Fix
`AppNativeBarcodeScanner.swift#AppNativeBarcodeFocus`, Apple's barcode-sample rule: while a scan runs the back camera
keeps continuous focus restricted to near subjects, its point of interest at the centre, and is zoomed just enough
(at most ×3) that a 30 mm code filling half the image stands beyond the minimum focus distance; the camera's own zoom
and focus range are given back when the scan stops.

Back during a read (the preview's track stopped mid-grab, the native session gone) showed an error sheet; it now ends
the scan as closed, nothing said (`barcode_scan.js#closing`).

## Regression check
`PROBE_ISOLATED=1 PROBE_PREBUILT_SERVER=1 PROBE_NO_REFERENCE=1 node temp/d18_scanner/main.probe.mjs`: real Web app, fake
back camera filming EAN-13s, real BarcodeDetector — one beep per valid read, camera closed, the product's sheet
(verdict, Nutri-Score, NOVA, additives), « Au panier » saves; no beep on a blank or misread label; Back says nothing.
35/35 twice on 7 Nov. 2026 (34/35 before the Back fix).

## Acceptance
On an iPhone with a Pro camera: a retail code held about 20 cm away is sharp at once, read, and beeps once.
Device only: the simulator has no camera.

## Follow-up, 17 Nov. 2026 — « il ne se passe rien », « il valide »
User: « Il doit être automatique. Dès qu'il voit le code barre… il bip pour confirmer… et il valide. » On the USB iPad
(« Ipad atomic », Debug of 17 Nov.) the native read works with no touch: Achat › Scan, a real pack held up, the code read,
the beep played (`audio_play`), the camera closed, the product's sheet (`temp/barcode_scan_2026-11-17/`). Two causes of
« nothing happens / it does not validate »: the read gave up after 30 s (a person turning the pack to find its code was
too slow: « Aucun code-barres lu »), now 3 min (`barcode_scan.js#SCAN_TIMEOUT_MS`); and the product waited for a touch on
« Au panier » — a scan of its own now puts it in the basket at once, « Au panier » lit (touched again: one more),
« Éviter » setting it aside (`dashboard_shopping.js#scan`, `showResult({ add })`; a held item's scan only links).
Regression: `PROBE_ISOLATED=1 PROBE_PREBUILT_SERVER=1 PROBE_NO_REFERENCE=1 node temp/barcode_scan_2026-11-17/added.probe.mjs`.
A product not good enough (food.add's own rule, or the person's health against it) is refused, not added: « Refusé ·
Pas ajouté au panier » (`dashboard_shopping.js#addScanned`, `dashboard_shopping_result.js#answerRow`). The product photo
with no label wore the label's blurred band: `dashboard_card_records.js` (`label_band`) lays no band nor title without a
label. Proof on the iPad 17 Nov. 2026 18:39 and 18:57 (`temp/barcode_scan_2026-11-17/shots/final_1.png`, `final_2.png`).
