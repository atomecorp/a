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
