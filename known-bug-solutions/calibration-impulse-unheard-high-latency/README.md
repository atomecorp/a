# Input calibration says « no impulse heard » on a high-latency output

## Symptom

The input calibration fails although the clicks are clearly recorded, on an
output with a large latency (Bluetooth, ~170 ms).

## Confirmed cause

`eVe/intuition/tools/molecule/recording/input_calibration.js#calibrationResidual`
paired a heard click with its emitted one only in an asymmetric window
(`-spacing/4` .. `spacing/2`): a late round trip fell outside it.

## Durable correction

Symmetric pairing window `±spacing/2`. The capture round trip is read again at
stop while the input still runs (`settledCaptureRoundTripSeconds`).

## Regression checks

- `temp/timeline/timeline_sync_real_app.probe.mjs` (13/13): calibration equals
  the first take's offset.
