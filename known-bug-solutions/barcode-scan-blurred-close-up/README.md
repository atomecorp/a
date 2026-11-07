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
