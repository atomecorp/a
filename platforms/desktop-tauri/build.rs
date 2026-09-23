// Android has no C++ runtime of its own: libc++ ships as a separate shared
// library (`libc++_shared.so`) inside the NDK, and the C++ dependencies of this
// crate (MIDI, audio, WebView glue) leave the C++ ABI symbols undefined. Without
// that runtime the loader aborts before `main` with
// `dlopen failed: cannot locate symbol "__cxa_pure_virtual"`.
// Recording the dependency also tells the Tauri CLI which shared library to
// copy into jniLibs, which is what puts it inside the APK.
fn android_sysroot_triple(target: &str) -> Option<&'static str> {
    match target {
        "aarch64-linux-android" => Some("aarch64-linux-android"),
        "armv7-linux-androideabi" => Some("arm-linux-androideabi"),
        "i686-linux-android" => Some("i686-linux-android"),
        "x86_64-linux-android" => Some("x86_64-linux-android"),
        _ => None,
    }
}

// The NDK keeps the runtime in
// `toolchains/llvm/prebuilt/<host>/sysroot/usr/lib/<triple>/libc++_shared.so`.
fn android_sysroot_lib_dir(
    triple: &str,
) -> Option<std::path::PathBuf> {
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    for key in ["ANDROID_NDK_HOME", "NDK_HOME", "ANDROID_NDK_ROOT"] {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() {
                roots.push(std::path::PathBuf::from(value));
            }
        }
    }
    for key in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Ok(value) = std::env::var(key) {
            if let Ok(entries) = std::fs::read_dir(std::path::Path::new(&value).join("ndk")) {
                roots.extend(entries.flatten().map(|entry| entry.path()));
            }
        }
    }

    for root in roots {
        let Ok(prebuilts) = std::fs::read_dir(root.join("toolchains").join("llvm").join("prebuilt"))
        else {
            continue;
        };
        for prebuilt in prebuilts.flatten() {
            let dir = prebuilt
                .path()
                .join("sysroot")
                .join("usr")
                .join("lib")
                .join(triple);
            if dir.join("libc++_shared.so").is_file() {
                return Some(dir);
            }
        }
    }
    None
}

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
        for key in [
            "ANDROID_NDK_HOME",
            "NDK_HOME",
            "ANDROID_NDK_ROOT",
            "ANDROID_HOME",
            "ANDROID_SDK_ROOT",
        ] {
            println!("cargo:rerun-if-env-changed={key}");
        }

        if let Some(triple) = android_sysroot_triple(&std::env::var("TARGET").unwrap_or_default()) {
            if let Some(dir) = android_sysroot_lib_dir(triple) {
                println!("cargo:rustc-link-search=native={}", dir.display());
            }
        }
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
