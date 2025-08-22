# Streaming Audio from WebView to AUv3 Host

## Overview

This guide explains how to stream audio generated in a WebView (via
JavaScript/AudioWorklet) to an AUv3 host with minimal latency and no
distortion.\
It solves common issues such as: - Distorted or cracked audio - Audio
cutting after less than a second - Sync issues between WebView and AUv3
engine

The solution uses: - **AudioWorklet** in JavaScript for low-latency
frame generation - **WKScriptMessageHandler** for passing raw PCM
buffers from JS to Swift - **TPCircularBuffer** (lock-free ring buffer)
for real-time safe audio transfer to the DSP thread -
**AUAudioUnit.internalRenderBlock** for output to the host

------------------------------------------------------------------------

## Architecture

    WebView (JS/AudioWorklet)
       ↓ postMessage(ArrayBuffer)
    WKScriptMessageHandler (Swift UI thread)
       ↓ pushPCMLeftRight()
    TPCircularBuffer (lock-free, shared buffer)
       ↓ internalRenderBlock
    AUAudioUnit → Host (Logic Pro, GarageBand, etc.)

------------------------------------------------------------------------

## Key Points to Avoid Artifacts

1.  **Use ArrayBuffers (not Base64/JSON)** to avoid heavy copying.
2.  **Use a buffer size** of at least 200--500 ms to avoid underruns.
3.  **Ensure Float32 format** matches AUv3 output bus format.
4.  **Silence filling** when the buffer is empty (avoid random noise).
5.  **Avoid blocking the render thread** -- use lock-free or lightweight
    locking.

------------------------------------------------------------------------

## Project Setup

### 1. Add TPCircularBuffer

Create `TPCircularFloat32Buffer.h` and `.c` in your AUv3 extension
target.

### 2. Swift Wrapper

Use `TPCircularFloat32Buffer.swift` to interact with the C buffer
safely.

### 3. Audio Unit Implementation

Use `SampleStreamerAudioUnit.swift` as provided.\
- Initialize buffer with enough capacity. - Use `pushPCMLeftRight` to
add frames from WebView.

### 4. WebView Setup

Create `AUv3ViewController.swift` with: - WKWebView configuration - JS
handler named `"audio"`

### 5. Frontend JS/HTML

-   Use `AudioWorklet` to generate or capture audio.
-   Post ArrayBuffers as transferables to the native side.

------------------------------------------------------------------------

## Handling Audio Cutting After \~1 Second

If the audio stops streaming: - **Keep the AudioContext alive** (avoid
suspension) - Use a **regular `setInterval` or requestAnimationFrame**
to ensure messages are posted frequently - **Ensure buffer chunk size
matches sample rate** (e.g., 128--512 frames per message) - **Avoid
blocking the main thread** in JS (long tasks may drop messages)

------------------------------------------------------------------------

## Example Code

### Swift AUAudioUnit (DSP Engine)

``` swift
override var internalRenderBlock: AUInternalRenderBlock {
    let rbRef = rb
    let chCount = Int(outputBus.format.channelCount)

    return { _, _, frameCount, _, outputData, _ in
        guard let outABL = outputData else { return noErr }

        for c in 0..<chCount {
            let buf = outABL.pointee.mBuffers.advanced(by: c).pointee
            memset(buf.mData, 0, Int(buf.mDataByteSize))
        }

        let framesToRead = Int(frameCount)
        let readOK = rbRef.read(into: outABL, frames: framesToRead)
        if !readOK {
            // Silence already written above
        }
        return noErr
    }
}
```

### JavaScript (AudioWorklet)

``` javascript
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = 256; // Adjust for stability (128-512 recommended)
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];

    for (let i = 0; i < L.length; i++) {
      const t = (currentFrame + i) / sampleRate;
      L[i] = Math.sin(2 * Math.PI * 440 * t);
      R[i] = L[i];
    }

    // Send raw Float32 arrays
    this.port.postMessage({
      left: L.buffer,
      right: R.buffer,
      frames: L.length
    }, [L.buffer, R.buffer]);

    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
```

------------------------------------------------------------------------

## Debugging Tips

-   Use `print` in Swift to confirm data arrival
-   Check buffer fullness in `internalRenderBlock`
-   Add safety logs in JS to ensure `postMessage` fires continuously
-   Try different `block` sizes for AudioWorklet to match the host
    buffer size (e.g., 256 or 512 frames)

------------------------------------------------------------------------

## References

-   [TPCircularBuffer](https://github.com/michaeltyson/TPCircularBuffer)
-   Apple AUv3 Docs (Audio Unit Programming Guide)
-   Web Audio API / AudioWorklet Spec

------------------------------------------------------------------------

## License

This example is provided **AS IS** under the MIT license.
