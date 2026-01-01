use std::ffi::{CStr, CString};

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::os::raw::c_char;

    #[link(name = "squirrel_native_recorder", kind = "static")]
    extern "C" {
        fn squirrel_recorder_start(
            abs_wav_path: *const c_char,
            sample_rate: u32,
            channels: u16,
            source: *const c_char,
            err_out: *mut *mut c_char,
        ) -> bool;

        fn squirrel_recorder_stop(err_out: *mut *mut c_char, out_duration_sec: *mut f64) -> bool;

        fn squirrel_string_free(s: *mut c_char);
    }

    fn take_error(err_ptr: *mut c_char) -> String {
        if err_ptr.is_null() {
            return "Unknown error".to_string();
        }
        unsafe {
            let msg = CStr::from_ptr(err_ptr).to_string_lossy().to_string();
            squirrel_string_free(err_ptr);
            msg
        }
    }

    pub fn start(abs_wav_path: &str, sample_rate: u32, channels: u16, source: &str) -> Result<(), String> {
        let path_c = CString::new(abs_wav_path).map_err(|_| "Invalid output path".to_string())?;
        let source_c = CString::new(source).map_err(|_| "Invalid source".to_string())?;

        let mut err_out: *mut c_char = std::ptr::null_mut();
        let ok = unsafe {
            squirrel_recorder_start(
                path_c.as_ptr(),
                sample_rate,
                channels,
                source_c.as_ptr(),
                &mut err_out as *mut *mut c_char,
            )
        };

        if ok {
            Ok(())
        } else {
            Err(take_error(err_out))
        }
    }

    pub fn stop() -> Result<f64, String> {
        let mut err_out: *mut c_char = std::ptr::null_mut();
        let mut duration_sec: f64 = 0.0;
        let ok = unsafe { squirrel_recorder_stop(&mut err_out as *mut *mut c_char, &mut duration_sec as *mut f64) };
        if ok {
            Ok(duration_sec)
        } else {
            Err(take_error(err_out))
        }
    }
}

pub fn start(abs_wav_path: &str, sample_rate: u32, channels: u16, source: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return macos::start(abs_wav_path, sample_rate, channels, source);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (abs_wav_path, sample_rate, channels, source);
        Err("Native recorder is only implemented on macOS in this build".to_string())
    }
}

pub fn stop() -> Result<f64, String> {
    #[cfg(target_os = "macos")]
    {
        return macos::stop();
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Native recorder is only implemented on macOS in this build".to_string())
    }
}
