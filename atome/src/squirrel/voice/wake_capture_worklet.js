// Forwards 16 kHz mono microphone audio, scaled to int16 range, to the wake capture
// owner in whole 80 ms frames so the main thread is woken 12.5 times per second.
const FRAME_SAMPLES = 1280;

class WakeCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.frame = new Float32Array(FRAME_SAMPLES);
        this.filled = 0;
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel) return true;
        for (let index = 0; index < channel.length; index += 1) {
            this.frame[this.filled++] = channel[index] * 32767;
            if (this.filled === FRAME_SAMPLES) {
                this.port.postMessage(this.frame, [this.frame.buffer]);
                this.frame = new Float32Array(FRAME_SAMPLES);
                this.filled = 0;
            }
        }
        return true;
    }
}
registerProcessor('wake-capture', WakeCaptureProcessor);
