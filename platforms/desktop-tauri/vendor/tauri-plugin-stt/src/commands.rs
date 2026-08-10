use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::Result;
use crate::SttExt;

/// Prepare the local recognition model without opening the microphone.
#[command]
pub(crate) async fn prepare_model<R: Runtime>(
    app: AppHandle<R>,
    language: Option<LanguageCode>,
) -> Result<()> {
    #[cfg(desktop)]
    {
        return app.stt().prepare_model(language.as_deref());
    }
    #[cfg(mobile)]
    {
        let _ = (app, language);
        Ok(())
    }
}

/// Start listening for speech
#[command]
pub(crate) async fn start_listening<R: Runtime>(
    app: AppHandle<R>,
    config: Option<ListenConfig>,
) -> Result<()> {
    app.stt().start_listening(config.unwrap_or_default())
}

/// Stop listening for speech
#[command]
pub(crate) async fn stop_listening<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.stt().stop_listening()
}

/// Check if STT is available on this device
#[command]
pub(crate) async fn is_available<R: Runtime>(app: AppHandle<R>) -> Result<AvailabilityResponse> {
    app.stt().is_available()
}

/// Get list of supported languages
#[command]
pub(crate) async fn get_supported_languages<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SupportedLanguagesResponse> {
    app.stt().get_supported_languages()
}

/// Check permission status
#[command]
pub(crate) async fn check_permission<R: Runtime>(app: AppHandle<R>) -> Result<PermissionResponse> {
    app.stt().check_permission()
}

/// Request permissions
#[command]
pub(crate) async fn request_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionResponse> {
    app.stt().request_permission()
}

/// Register a listener for plugin events (desktop only)
/// On mobile, this is handled by the Plugin base class
#[cfg(desktop)]
#[command]
pub(crate) async fn register_listener() -> Result<()> {
    // The mobile plugin handles listeners internally. This command exists
    // to satisfy the front-end call from `addPluginListener` on desktop.
    Ok(())
}

/// Remove a previously registered plugin listener (desktop only)
/// On mobile, this is handled by the Plugin base class
#[cfg(desktop)]
#[command]
pub(crate) async fn remove_listener() -> Result<()> {
    // No-op: mobile plugin manages its own listeners.
    Ok(())
}
