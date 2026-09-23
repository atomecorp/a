fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let local_vosk_dir = std::path::Path::new(&manifest_dir)
            .join("native")
            .join("lib");
        let local_vosk_so = local_vosk_dir.join("libvosk.so");

        println!("cargo:rerun-if-changed={}", local_vosk_so.display());

        // tauri-plugin-stt links against -lvosk; explicitly expose common Linux search
        // paths because some link invocations under WSL/LLD do not include /usr/local/lib.
        println!("cargo:rustc-link-search=native=/usr/local/lib");
        println!("cargo:rustc-link-search=native=/usr/lib/x86_64-linux-gnu");
        println!("cargo:rustc-link-search=native=/usr/lib");

        // Allow linking against a vendored Vosk runtime on Linux/WSL.
        if local_vosk_so.exists() {
            println!(
                "cargo:rustc-link-search=native={}",
                local_vosk_dir.display()
            );
            println!(
                "cargo:rustc-link-arg=-Wl,-rpath,{}",
                local_vosk_dir.display()
            );
        }
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        // Android has no C++ runtime of its own: libc++ ships as a separate
        // shared library (`libc++_shared.so`) inside the NDK, and the C++
        // dependencies of this crate (MIDI, audio, WebView glue) leave the C++ ABI
        // symbols undefined. Without that runtime the loader aborts before `main`
        // with `dlopen failed: cannot locate symbol "__cxa_pure_virtual"`.
        // The NDK's own linker driver finds the file; recording the dependency
        // also tells the Tauri CLI which shared library to copy into jniLibs,
        // which is what puts it inside the APK.
        //
        // Never add `<sysroot>/usr/lib/<triple>` to the link search path to help
        // it: that directory holds the static `libc.a` and no `libc.so`, so it
        // silently captures the link's own `-lc` and the library ends up with a
        // private, statically linked libc. That libc's auxv is never filled in,
        // and the process dies on the first `getauxval` call - measured as
        // SIGSEGV at `getauxval+28` from `init_have_lse_atomics`, before the
        // WebView is ever shown.
        println!("cargo:rustc-link-arg=-lc++_shared");
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let local_vosk_dir = std::path::Path::new(&manifest_dir)
            .join("native")
            .join("lib");
        let local_vosk_dylib = local_vosk_dir.join("libvosk.dylib");

        std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "11.0");
        println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=11.0");
        println!("cargo:rerun-if-changed={}", local_vosk_dylib.display());

        // Prefer a vendored local Vosk runtime when present so Tauri STT can link
        // without requiring a system-wide libvosk installation.
        if local_vosk_dylib.exists() {
            println!(
                "cargo:rustc-link-search=native={}",
                local_vosk_dir.display()
            );
            println!(
                "cargo:rustc-link-arg=-Wl,-rpath,{}",
                local_vosk_dir.display()
            );
        }
    }
}
