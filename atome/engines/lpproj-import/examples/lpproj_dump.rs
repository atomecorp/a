//! Prints a `.lpproj` bundle's normalized project and its Molecule import as JSON.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("usage: lpproj_dump <bundle.lpproj>")?;
    let path = std::path::Path::new(&path);
    let project = atome_lpproj_import::bundle::read_bundle(path)?;
    let name = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    let import = atome_lpproj_import::layout::lay_out(&project, name)?;
    let import: serde_json::Value = serde_json::from_str(&import.to_json())?;
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({ "project": project, "import": import }))?
    );
    Ok(())
}
