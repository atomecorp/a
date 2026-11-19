//! Connected screens on the desktop (R-212, contract validated by the user, 17 Nov. 2026): a screen beside the
//! one the main window lies on shows the follower page (`?display=follower`, eVe/domains/rendering/
//! external_display_follower.js), fullscreen on that screen — a second view of the same document at that
//! screen's own size, no tools, read only. The screen gone, its window closes and the main window goes on
//! unchanged. The page and the follower talk through their own channel (same origin, external_display_link.js).
use std::time::Duration;
use tauri::{AppHandle, Manager, Monitor, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "external_display";
// A screen plugged or unplugged is seen within this time: the system gives Tauri no event for it.
const WATCH_INTERVAL: Duration = Duration::from_secs(1);

/// The follower page: the main page's address, its role named.
pub fn follower_url(main_url: &str) -> Result<tauri::Url, String> {
    let mut url =
        tauri::Url::parse(main_url).map_err(|error| format!("external_display_url:{error}"))?;
    url.query_pairs_mut().append_pair("display", "follower");
    Ok(url)
}

/// The connected screen: the first one that is not the main window's.
pub fn external_monitor(monitors: &[Monitor], main: Option<&Monitor>) -> Option<Monitor> {
    let main = main?;
    monitors
        .iter()
        .find(|monitor| !same_monitor(monitor, main))
        .cloned()
}

fn same_monitor(a: &Monitor, b: &Monitor) -> bool {
    a.position() == b.position() && a.size() == b.size()
}

fn open(app: &AppHandle, monitor: &Monitor, url: tauri::Url, init: &str) -> tauri::Result<()> {
    let scale = monitor.scale_factor();
    let position = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .initialization_script(init)
        .position(position.x, position.y)
        .inner_size(size.width, size.height)
        .decorations(false)
        .focused(false)
        .fullscreen(true)
        .build()
        .map(|_| ())
}

/// Watches the screens for the app's life (desktop only).
pub fn watch(app: AppHandle, main_url: &'static str, init: String) {
    std::thread::spawn(move || {
        let url = match follower_url(main_url) {
            Ok(url) => url,
            Err(error) => {
                eprintln!("[external_display] {error}");
                return;
            }
        };
        let mut shown: Option<Monitor> = None;
        loop {
            std::thread::sleep(WATCH_INTERVAL);
            let Some(main) = app.get_webview_window("main") else {
                continue;
            };
            // A screen list the system could not give is no change: the screen shown stays.
            let monitors = match app.available_monitors() {
                Ok(monitors) => monitors,
                Err(error) => {
                    eprintln!("[external_display] screens unreadable: {error}");
                    continue;
                }
            };
            let target =
                external_monitor(&monitors, main.current_monitor().ok().flatten().as_ref());
            let same = match (&shown, &target) {
                (Some(a), Some(b)) => same_monitor(a, b),
                (None, None) => true,
                _ => false,
            };
            if same {
                continue;
            }
            if let Some(window) = app.get_webview_window(LABEL)
                && let Err(error) = window.destroy()
            {
                eprintln!("[external_display] window not closed: {error}");
            }
            if let Some(monitor) = &target
                && let Err(error) = open(&app, monitor, url.clone(), &init)
            {
                eprintln!("[external_display] window not opened: {error}");
            }
            shown = target;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::follower_url;

    #[test]
    fn follower_url_names_the_role() {
        let url = follower_url("http://127.0.0.1:3000/").expect("url");
        assert_eq!(url.as_str(), "http://127.0.0.1:3000/?display=follower");
    }
}
