// No command is exposed to JavaScript: page code cannot reach Health Connect
// directly. The app crate calls this plugin from its gated `health_invoke`.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
