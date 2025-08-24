class MediaTapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sec = options?.processorOptions?.chunkDurationSec ?? 0.12; // ~120ms by default
    this.setChunkSamples(sec);
    this.buf = new Float32Array(this.chunkSamples);
    this.write = 0;
    this.frames = 0;

    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.cmd === 'setChunkSec') {
        this.setChunkSamples(msg.sec);
        this.buf = new Float32Array(this.chunkSamples);
        this.write = 0;
      }
    };
  }

  setChunkSamples(sec) {
    const clamped = Math.min(0.5, Math.max(0.02, Number(sec) || 0.12));
    this.chunkSamples = Math.max(128, Math.round(clamped * sampleRate));
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const L = input[0] || new Float32Array(128);
    const R = input[1] || L;
    const n = L.length;

    for (let i = 0; i < n; i++) {
      const mono = (L[i] + R[i]) * 0.5;
      if (this.write >= this.chunkSamples) {
        this.port.postMessage({ sr: sampleRate, pcm: this.buf }, [this.buf.buffer]);
        this.buf = new Float32Array(this.chunkSamples);
        this.write = 0;
      }
      this.buf[this.write++] = mono;
    }

    return true;
  }
}

registerProcessor('media-tap-processor', MediaTapProcessor);
