use serde::Serialize;
use std::cell::RefCell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AtomeVideoCopySkipReason {
    MissingGpuImage,
    MissingSource,
    MissingFrameVersion,
    SourceNotReady,
    EmptySourceSize,
    FrameAlreadyCopied,
}

impl AtomeVideoCopySkipReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MissingGpuImage => "missing_gpu_image",
            Self::MissingSource => "missing_source",
            Self::MissingFrameVersion => "missing_frame_version",
            Self::SourceNotReady => "source_not_ready",
            Self::EmptySourceSize => "empty_source_size",
            Self::FrameAlreadyCopied => "frame_already_copied",
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct AtomeVideoCopyDiagnostics {
    pub copy_count: u32,
    pub skip_missing_gpu_image: u32,
    pub skip_missing_source: u32,
    pub skip_missing_frame_version: u32,
    pub skip_source_not_ready: u32,
    pub skip_empty_source_size: u32,
    pub skip_frame_already_copied: u32,
    pub last_copied_id: Option<String>,
    pub last_copied_frame_version: Option<u32>,
    pub last_skip_id: Option<String>,
    pub last_skip_frame_version: Option<u32>,
    pub last_skip_reason: Option<&'static str>,
}

thread_local! {
    static VIDEO_COPY_DIAGNOSTICS: RefCell<AtomeVideoCopyDiagnostics> =
        RefCell::new(AtomeVideoCopyDiagnostics::default());
}

pub fn record_video_copy_success(id: &str, frame_version: u32) {
    VIDEO_COPY_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        diagnostics.copy_count = diagnostics.copy_count.saturating_add(1);
        diagnostics.last_copied_id = Some(id.to_string());
        diagnostics.last_copied_frame_version = Some(frame_version);
    });
}

pub fn record_video_copy_skip(
    reason: AtomeVideoCopySkipReason,
    id: &str,
    frame_version: Option<u32>,
) {
    VIDEO_COPY_DIAGNOSTICS.with(|cell| {
        let mut diagnostics = cell.borrow_mut();
        match reason {
            AtomeVideoCopySkipReason::MissingGpuImage => {
                diagnostics.skip_missing_gpu_image =
                    diagnostics.skip_missing_gpu_image.saturating_add(1);
            }
            AtomeVideoCopySkipReason::MissingSource => {
                diagnostics.skip_missing_source = diagnostics.skip_missing_source.saturating_add(1);
            }
            AtomeVideoCopySkipReason::MissingFrameVersion => {
                diagnostics.skip_missing_frame_version =
                    diagnostics.skip_missing_frame_version.saturating_add(1);
            }
            AtomeVideoCopySkipReason::SourceNotReady => {
                diagnostics.skip_source_not_ready =
                    diagnostics.skip_source_not_ready.saturating_add(1);
            }
            AtomeVideoCopySkipReason::EmptySourceSize => {
                diagnostics.skip_empty_source_size =
                    diagnostics.skip_empty_source_size.saturating_add(1);
            }
            AtomeVideoCopySkipReason::FrameAlreadyCopied => {
                diagnostics.skip_frame_already_copied =
                    diagnostics.skip_frame_already_copied.saturating_add(1);
            }
        }
        diagnostics.last_skip_id = Some(id.to_string());
        diagnostics.last_skip_frame_version = frame_version;
        diagnostics.last_skip_reason = Some(reason.as_str());
    });
}

pub fn read_video_copy_diagnostics() -> AtomeVideoCopyDiagnostics {
    VIDEO_COPY_DIAGNOSTICS.with(|cell| cell.borrow().clone())
}

pub fn reset_video_copy_diagnostics() -> AtomeVideoCopyDiagnostics {
    VIDEO_COPY_DIAGNOSTICS.with(|cell| cell.replace(AtomeVideoCopyDiagnostics::default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_copy_diagnostics_track_copies_and_skip_reasons() {
        reset_video_copy_diagnostics();

        record_video_copy_skip(
            AtomeVideoCopySkipReason::MissingSource,
            "video_missing",
            None,
        );
        record_video_copy_skip(
            AtomeVideoCopySkipReason::FrameAlreadyCopied,
            "video_cached",
            Some(7),
        );
        record_video_copy_success("video_live", 8);

        let diagnostics = read_video_copy_diagnostics();
        assert_eq!(diagnostics.copy_count, 1);
        assert_eq!(diagnostics.skip_missing_source, 1);
        assert_eq!(diagnostics.skip_frame_already_copied, 1);
        assert_eq!(diagnostics.last_copied_id.as_deref(), Some("video_live"));
        assert_eq!(diagnostics.last_copied_frame_version, Some(8));
        assert_eq!(diagnostics.last_skip_id.as_deref(), Some("video_cached"));
        assert_eq!(diagnostics.last_skip_frame_version, Some(7));
        assert_eq!(
            diagnostics.last_skip_reason,
            Some(AtomeVideoCopySkipReason::FrameAlreadyCopied.as_str())
        );

        let previous = reset_video_copy_diagnostics();
        assert_eq!(previous.copy_count, 1);
        assert_eq!(read_video_copy_diagnostics().copy_count, 0);
    }
}
