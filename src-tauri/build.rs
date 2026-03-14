fn main() {
    tauri_build::build();

    // Native audio recorder for macOS (Objective-C++ / AVFoundation)
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let local_vosk_dir = std::path::Path::new(&manifest_dir).join("native").join("lib");
        let local_vosk_dylib = local_vosk_dir.join("libvosk.dylib");

        std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "11.0");
        println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=11.0");
        println!("cargo:rerun-if-changed=native/recorder.mm");
        println!("cargo:rerun-if-changed=native/recorder.h");
        println!("cargo:rerun-if-changed=../src/native/iplug/recorder/RecorderCore.cpp");
        println!("cargo:rerun-if-changed=../src/native/iplug/recorder/RecorderCore.h");
        println!("cargo:rerun-if-changed=../src/core/ring_buffer.cpp");
        println!("cargo:rerun-if-changed=../src/core/ring_buffer.h");
        println!("cargo:rerun-if-changed={}", local_vosk_dylib.display());

        cc::Build::new()
            .file("native/recorder.mm")
            .file("../src/native/iplug/recorder/RecorderCore.cpp")
            .file("../src/core/ring_buffer.cpp")
            .flag("-fobjc-arc")
            // Match Rust's deployment target (Tauri defaults to 11.0 in this repo)
            .flag("-mmacosx-version-min=11.0")
            .cpp(true)
            .compile("squirrel_native_recorder");

        // AVAudioEngine/AVAudioFile live behind AVFoundation/AVFAudio; link explicitly.
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AVFoundation");

        // Some SDKs split audio classes into AVFAudio; safe to link when available.
        println!("cargo:rustc-link-lib=framework=AVFAudio");

        // Needed for Objective-C++ exception personality and C++ runtime.
        println!("cargo:rustc-link-lib=c++");

        // Ensure these actually make it onto the final link line, even when the
        // downstream crates use explicit linker args (e.g. -nodefaultlibs).
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=AVFoundation");
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=AVFAudio");
        println!("cargo:rustc-link-arg=-lc++");

        // Make sure the linker can find system frameworks even under -nodefaultlibs.
        println!("cargo:rustc-link-search=framework=/System/Library/Frameworks");

        // Prefer a vendored local Vosk runtime when present so Tauri STT can link
        // without requiring a system-wide libvosk installation.
        if local_vosk_dylib.exists() {
            println!("cargo:rustc-link-search=native={}", local_vosk_dir.display());
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", local_vosk_dir.display());
        }
    }
}
