// The engine's threaded build asks for a shared memory able to grow to 4 GB; iOS
// refuses one that large (« RangeError: Out of memory ») though it grants 1 GB.
// A shared memory is asked no larger than `pages` (64 KB each); a smaller maximum
// still satisfies the module's import.
export const SHARED_MEMORY_PAGES = 16384;

export function limitSharedMemory(scope = globalThis, pages = SHARED_MEMORY_PAGES) {
    const Memory = scope.WebAssembly?.Memory;
    if (!Memory || Memory.limited) return;
    const Limited = function LimitedMemory(descriptor) {
        const limit = descriptor?.shared && descriptor.maximum > pages ? { ...descriptor, maximum: Math.max(pages, descriptor.initial || 0) } : descriptor;
        return new Memory(limit);
    };
    Limited.prototype = Memory.prototype;
    Limited.limited = true;
    scope.WebAssembly.Memory = Limited;
}
