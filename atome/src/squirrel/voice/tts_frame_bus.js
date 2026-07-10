export const createTtsFrameBus = () => {
    const listeners = new Set();
    return Object.freeze({
        publish(frame) {
            const snapshot = Object.freeze({ ...frame });
            listeners.forEach((listener) => listener(snapshot));
        },
        subscribe(listener) {
            if (typeof listener !== 'function') throw new Error('tts_frame_listener_required');
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    });
};
