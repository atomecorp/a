// Dense wake-phrase classifier over flattened feature windows. One trainer serves the
// offline base model (hidden layers) and the on-device personal verifier (logistic
// regression, no hidden layer). Training is seeded, hence deterministic.

const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const createRandom = (seed) => {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
    };
};

const normalizationOf = (samples, size) => {
    const mean = new Float32Array(size), scale = new Float32Array(size);
    for (const sample of samples) for (let index = 0; index < size; index += 1) mean[index] += sample[index];
    for (let index = 0; index < size; index += 1) mean[index] /= samples.length;
    for (const sample of samples) for (let index = 0; index < size; index += 1) scale[index] += (sample[index] - mean[index]) ** 2;
    for (let index = 0; index < size; index += 1) scale[index] = 1 / Math.sqrt(scale[index] / samples.length + 1e-6);
    return { mean, scale };
};

const forward = (model, input) => {
    const activations = [new Float32Array(input.length)];
    for (let index = 0; index < input.length; index += 1) {
        activations[0][index] = (input[index] - model.mean[index]) * model.scale[index];
    }
    model.layers.forEach((layer, layerIndex) => {
        const previous = activations[layerIndex], output = new Float32Array(layer.outputs);
        const last = layerIndex === model.layers.length - 1;
        for (let unit = 0; unit < layer.outputs; unit += 1) {
            let sum = layer.bias[unit];
            const offset = unit * layer.inputs;
            for (let index = 0; index < layer.inputs; index += 1) sum += layer.weights[offset + index] * previous[index];
            output[unit] = last ? sum : Math.max(0, sum);
        }
        activations.push(output);
    });
    return activations;
};

export const scoreWakeWindow = (model, window) => {
    const activations = forward(model, window);
    return sigmoid(activations[activations.length - 1][0]);
};

// Decision of the detector, shared by the worker and the offline measurements. A window
// counts only when its score passes and a voice stands `voiceRatio` times above the room
// noise floor: a quiet room or a distant voice scored high by the model opened the
// assistant on its own (iPad, 2026-10-13). A personal verifier decides the windows the base
// model already finds likely (`verifierGate`); it never replaces the voice requirement.
export const createWakeTrigger = (policy) => {
    let streak = 0;
    return {
        push({ baseScore, verifierScore = null, voiceRatio }) {
            const voiced = voiceRatio >= (policy.voiceRatio || 0);
            const passed = verifierScore === null ? baseScore >= policy.threshold
                : baseScore >= policy.verifierGate && verifierScore >= policy.verifierThreshold;
            streak = voiced && passed ? streak + 1 : 0;
            return streak === policy.consecutive;
        },
        reset() { streak = 0; }
    };
};

export const trainWakeClassifier = ({ positives, negatives, hidden = [], epochs = 30, batchSize = 64,
    learningRate = 1e-3, weightDecay = 0, negativeWeight = 1, seed = 1, onEpoch = () => {} }) => {
    if (!positives.length || !negatives.length) throw new Error('wake_training_examples_missing');
    const size = positives[0].length, random = createRandom(seed);
    const { mean, scale } = normalizationOf([...positives, ...negatives], size);
    const shape = [size, ...hidden, 1];
    const layers = shape.slice(1).map((outputs, index) => {
        const inputs = shape[index], limit = Math.sqrt(6 / (inputs + outputs));
        const weights = new Float32Array(inputs * outputs);
        for (let cell = 0; cell < weights.length; cell += 1) weights[cell] = (random() * 2 - 1) * limit;
        return { inputs, outputs, weights, bias: new Float32Array(outputs) };
    });
    const model = { mean, scale, layers };
    const moments = layers.map(layer => ({ mw: new Float32Array(layer.weights.length), vw: new Float32Array(layer.weights.length),
        mb: new Float32Array(layer.outputs), vb: new Float32Array(layer.outputs) }));
    const examples = [...positives.map(input => [input, 1]), ...negatives.map(input => [input, 0])];
    let step = 0;
    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (let index = examples.length - 1; index > 0; index -= 1) {
            const other = Math.floor(random() * (index + 1));
            [examples[index], examples[other]] = [examples[other], examples[index]];
        }
        let loss = 0;
        for (let start = 0; start < examples.length; start += batchSize) {
            const batch = examples.slice(start, start + batchSize);
            const gradients = layers.map(layer => ({ w: new Float32Array(layer.weights.length), b: new Float32Array(layer.outputs) }));
            for (const [input, label] of batch) {
                const activations = forward(model, input);
                const probability = sigmoid(activations[activations.length - 1][0]);
                const weight = label ? 1 : negativeWeight;
                loss -= weight * (label ? Math.log(probability + 1e-7) : Math.log(1 - probability + 1e-7));
                let delta = Float32Array.of(weight * (probability - label));
                for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
                    const layer = layers[layerIndex], previous = activations[layerIndex], gradient = gradients[layerIndex];
                    const next = layerIndex > 0 ? new Float32Array(layer.inputs) : null;
                    for (let unit = 0; unit < layer.outputs; unit += 1) {
                        const value = delta[unit];
                        if (!value) continue;
                        gradient.b[unit] += value;
                        const offset = unit * layer.inputs;
                        for (let cell = 0; cell < layer.inputs; cell += 1) {
                            gradient.w[offset + cell] += value * previous[cell];
                            if (next) next[cell] += value * layer.weights[offset + cell];
                        }
                    }
                    if (next) for (let cell = 0; cell < next.length; cell += 1) if (previous[cell] <= 0) next[cell] = 0;
                    delta = next;
                }
            }
            step += 1;
            const correction1 = 1 - 0.9 ** step, correction2 = 1 - 0.999 ** step;
            layers.forEach((layer, layerIndex) => {
                const moment = moments[layerIndex], gradient = gradients[layerIndex];
                const update = (values, grads, m, v, decay) => {
                    for (let cell = 0; cell < values.length; cell += 1) {
                        const g = grads[cell] / batch.length + decay * values[cell];
                        m[cell] = 0.9 * m[cell] + 0.1 * g;
                        v[cell] = 0.999 * v[cell] + 0.001 * g * g;
                        values[cell] -= learningRate * (m[cell] / correction1) / (Math.sqrt(v[cell] / correction2) + 1e-8);
                    }
                };
                update(layer.weights, gradient.w, moment.mw, moment.vw, weightDecay);
                update(layer.bias, gradient.b, moment.mb, moment.vb, 0);
            });
        }
        onEpoch({ epoch, loss: loss / examples.length });
    }
    return model;
};

const encode = (values) => {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    let text = '';
    for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(text);
};
const decode = (text) => {
    const binary = atob(text), bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Float32Array(bytes.buffer);
};

export const serializeWakeClassifier = (model, extra = {}) => ({ ...extra, mean: encode(model.mean), scale: encode(model.scale),
    layers: model.layers.map(layer => ({ inputs: layer.inputs, outputs: layer.outputs, weights: encode(layer.weights), bias: encode(layer.bias) })) });

export const deserializeWakeClassifier = (value) => {
    if (!value?.layers?.length) throw new Error('wake_classifier_invalid');
    return { mean: decode(value.mean), scale: decode(value.scale),
        layers: value.layers.map(layer => ({ inputs: layer.inputs, outputs: layer.outputs, weights: decode(layer.weights), bias: decode(layer.bias) })) };
};
