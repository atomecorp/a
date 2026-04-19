pub fn xcode_logs_enabled() -> bool {
    std::env::var("SQUIRREL_XCODE_LOGS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}