// The module's linear memory is capped: a script that allocates past it traps (an `unreachable` the worker reads
// as SCRIPT_MEMORY) instead of taking the page's memory. 55 MiB, 880 pages of 64 KiB (AGENTS.md rule 19): Opal's
// runtime takes ~20 MiB of it.
const MAX_MEMORY_BYTES: u64 = 880 * 65_536;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32") {
        println!("cargo:rustc-cdylib-link-arg=--max-memory={MAX_MEMORY_BYTES}");
    }
}
