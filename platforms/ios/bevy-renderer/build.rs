// With the `voice` feature, libvosk_ios.a (platforms/ios/build_vosk_ios.sh) is bundled into
// this static library: the Xcode link only adds -lc++ and Accelerate.
fn main() {
    println!("cargo:rerun-if-env-changed=VOSK_IOS_LIB_DIR");
    if std::env::var_os("CARGO_FEATURE_VOICE").is_none() { return; }
    let dir = std::env::var("VOSK_IOS_LIB_DIR").expect("voice feature: VOSK_IOS_LIB_DIR must name the directory of libvosk_ios.a (platforms/ios/build_vosk_ios.sh)");
    println!("cargo:rustc-link-search=native={dir}");
    println!("cargo:rustc-link-lib=static=vosk_ios");
}
