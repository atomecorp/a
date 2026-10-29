// Denormal numbers (the dying tail of a reverb or a filter) cost a hundred
// times a normal one on most CPUs. A host holds this guard while it renders:
// the CPU then flushes them to zero, and the previous mode comes back on drop.
// WebAssembly has no such mode; there the guard does nothing.

pub struct FlushDenormals {
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    previous: u64,
}

#[cfg(target_arch = "x86_64")]
mod mode {
    // MXCSR: flush-to-zero (bit 15) and denormals-are-zero (bit 6).
    pub const FLUSH: u64 = (1 << 15) | (1 << 6);

    pub fn read() -> u64 {
        let mut csr: u32 = 0;
        // SAFETY: stores the SSE control register into a local.
        unsafe { core::arch::asm!("stmxcsr [{}]", in(reg) &mut csr, options(nostack)) };
        csr as u64
    }

    pub fn write(value: u64) {
        let csr = value as u32;
        // SAFETY: loads a control word read from this very register, flags added.
        unsafe { core::arch::asm!("ldmxcsr [{}]", in(reg) &csr, options(nostack, readonly)) };
    }
}

#[cfg(target_arch = "aarch64")]
mod mode {
    // FPCR: flush-to-zero (bit 24).
    pub const FLUSH: u64 = 1 << 24;

    pub fn read() -> u64 {
        let value: u64;
        // SAFETY: reads the floating-point control register.
        unsafe { core::arch::asm!("mrs {}, fpcr", out(reg) value, options(nomem, nostack)) };
        value
    }

    pub fn write(value: u64) {
        // SAFETY: writes back the control register read above, flags added.
        unsafe { core::arch::asm!("msr fpcr, {}", in(reg) value, options(nomem, nostack)) };
    }
}

impl FlushDenormals {
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    pub fn new() -> Self {
        let previous = mode::read();
        mode::write(previous | mode::FLUSH);
        Self { previous }
    }

    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    pub fn new() -> Self {
        Self {}
    }

    // Whether the CPU flushes denormals right now (tests).
    pub fn active() -> bool {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
        return mode::read() & mode::FLUSH == mode::FLUSH;
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
        return false;
    }
}

impl Default for FlushDenormals {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for FlushDenormals {
    fn drop(&mut self) {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
        mode::write(self.previous);
    }
}
