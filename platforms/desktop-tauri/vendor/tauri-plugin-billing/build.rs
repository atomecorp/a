// No command is exposed to JavaScript: page code cannot reach Play Billing
// directly. The app crate calls this plugin from its gated `billing_invoke`.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
