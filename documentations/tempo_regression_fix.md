# Tempo Button Regression Fix

## Problem
The Tempo button (`<button>Tempo</button>`) in `ios_apis.js` was always returning 120 BPM instead of the real tempo value from the host.

## Root Cause Analysis
1. **Cached Tempo Never Updated**: The `cachedTempo` variable in `WebViewManager.swift` was initialized to 120.0 and never updated.
2. **Missing Tempo Updates**: The `checkHostTempo()` function was completely removed as an "ULTRA OPTIMIZATION" (line 242 in utils.swift).
3. **Fallback Logic**: When `requestHostTempo` is called:
   - It first tries to get tempo from `musicalContextBlock` 
   - If that fails or returns 0, it falls back to the never-updated `cachedTempo` (120.0)
   - Result: Always returns 120 BPM

## Solution Implemented

### 1. Added Tempo Updates in Transport Check
Modified `checkHostTransport()` in `utils.swift` to also check and update tempo:
```swift
// Also check and update tempo while we're checking transport
if let musicalBlock = self.musicalContextBlock {
    var currentTempo: Double = 0
    if musicalBlock(&currentTempo, nil, nil, nil, nil, nil), currentTempo > 0 {
        WebViewManager.updateCachedTempo(currentTempo)
    }
}
```

### 2. Enhanced requestHostTempo Handler
Improved `requestHostTempo` in `WebViewManager.swift`:
- Added retry logic with full parameter set
- Added debug logging with source information
- Update cached tempo when valid value is obtained
- Better error reporting showing which fallback was used

### 3. Correct AUHostMusicalContextBlock Parameters
Fixed parameter types according to Apple documentation:
```swift
typedef BOOL (^AUHostMusicalContextBlock)(
    double * __nullable currentTempo, 
    double * __nullable timeSignatureNumerator, 
    NSInteger * __nullable timeSignatureDenominator, 
    double * __nullable currentBeatPosition, 
    NSInteger * __nullable sampleOffsetToNextBeat, 
    double * __nullable currentMeasureDownbeatPosition
);
```

## Testing
To test the fix:
1. Load plugin in AUM or other host with tempo ≠ 120 BPM
2. Press "Tempo" button in iOS APIs test page
3. Should now return the actual host tempo value
4. Check console logs for debug information showing source of tempo data

## Debug Information
The enhanced logging shows the source of tempo data:
- `hostBlock`: Direct from musicalContextBlock (ideal)
- `hostBlockFull`: From musicalContextBlock with full parameters
- `cached(XXX)`: From cached value (shows actual cached tempo)
- `cachedNoBlock(XXX)`: No musicalContextBlock available
- `noAU(XXX)`: No hostAudioUnit available

## Files Modified
1. `/src-Auv3/auv3/utils.swift`: Added tempo update in `checkHostTransport()`
2. `/src-Auv3/Common/WebViewManager.swift`: Enhanced `requestHostTempo` handling

## Performance Impact
Minimal - tempo check piggybacks on existing transport polling (throttled to 5 FPS).
