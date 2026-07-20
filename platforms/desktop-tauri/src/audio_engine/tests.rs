// Integration tests for the CPAL+Kira audio engine
// Run with: cargo test --package squirrel -- audio_engine_tests --test-threads=1
// These tests require audio hardware (mic + speakers) on the machine.
//
// All tests using the shared global AudioManager are combined into a single
// sequential test to avoid conflicts from parallel execution (the Kira
// AudioManager lives behind a global Mutex).

#[cfg(test)]
mod audio_engine_tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    // Serialise all tests that touch the global audio state.
    static TEST_LOCK: once_cell::sync::Lazy<Mutex<()>> =
        once_cell::sync::Lazy::new(|| Mutex::new(()));

    fn test_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("squirrel_audio_tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn generate_sine_wav(path: &str, duration_secs: f32, freq: f32, sample_rate: u32) {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        let num_samples = (duration_secs * sample_rate as f32) as usize;
        for i in 0..num_samples {
            let t = i as f32 / sample_rate as f32;
            let sample = (t * freq * 2.0 * std::f32::consts::PI).sin();
            let s16 = (sample * 32767.0) as i16;
            writer.write_sample(s16).unwrap();
        }
        writer.finalize().unwrap();
    }

    #[test]
    fn test_init_shutdown() {
        let _lock = TEST_LOCK.lock().unwrap();
        crate::audio_engine::playback::init().expect("init failed");
        crate::audio_engine::playback::init().expect("second init failed");
        crate::audio_engine::playback::shutdown().expect("shutdown failed");
    }

    #[test]
    fn test_load_and_play_sine() {
        let _lock = TEST_LOCK.lock().unwrap();

        let dir = test_dir();
        let wav_path = dir.join("test_sine_440hz.wav");
        let wav_str = wav_path.to_str().unwrap();

        generate_sine_wav(wav_str, 1.0, 440.0, 44100);
        assert!(wav_path.exists(), "WAV file should exist");

        crate::audio_engine::playback::init().expect("init failed");

        crate::audio_engine::playback::load_clip("test_sine", wav_str).expect("load_clip failed");

        crate::audio_engine::playback::play("test_sine").expect("play failed");

        std::thread::sleep(std::time::Duration::from_millis(500));

        crate::audio_engine::playback::stop("test_sine").expect("stop failed");

        crate::audio_engine::playback::destroy_clip("test_sine").expect("destroy_clip failed");

        crate::audio_engine::playback::shutdown().expect("shutdown failed");

        std::fs::remove_file(&wav_path).ok();
    }

    #[test]
    fn test_load_from_bytes() {
        let _lock = TEST_LOCK.lock().unwrap();

        let dir = test_dir();
        let wav_path = dir.join("test_bytes_880hz.wav");
        let wav_str = wav_path.to_str().unwrap();

        generate_sine_wav(wav_str, 0.5, 880.0, 44100);
        let bytes = std::fs::read(&wav_path).unwrap();

        crate::audio_engine::playback::init().expect("init failed");
        crate::audio_engine::playback::load_clip_from_bytes("test_bytes", bytes)
            .expect("load_clip_from_bytes failed");
        crate::audio_engine::playback::play("test_bytes").expect("play failed");

        std::thread::sleep(std::time::Duration::from_millis(300));

        crate::audio_engine::playback::stop("test_bytes").expect("stop failed");
        crate::audio_engine::playback::shutdown().expect("shutdown failed");

        std::fs::remove_file(&wav_path).ok();
    }

    #[test]
    fn test_record_mic() {
        let _lock = TEST_LOCK.lock().unwrap();
        let _metering_lock = crate::audio_engine::metering_scope::METERING_TEST_LOCK
            .lock()
            .unwrap();

        let dir = test_dir();
        let rec_path = dir.join("test_recording.wav");
        let rec_str = rec_path.to_str().unwrap();

        let result = crate::audio_engine::recorder::start("test_rec", rec_str, 44100, 1);
        if let Err(ref e) = result {
            if e.contains("No default input") {
                println!("SKIP: No microphone available on this machine");
                return;
            }
        }
        result.expect("record start failed");

        std::thread::sleep(std::time::Duration::from_secs(2));

        let rec_result =
            crate::audio_engine::recorder::stop("test_rec").expect("record stop failed");

        println!("Recording result: {:?}", rec_result);
        assert!(
            rec_result.duration_sec > 1.0,
            "Recording should be > 1 second"
        );
        assert!(
            std::path::Path::new(&rec_result.file_path).exists(),
            "WAV file should exist"
        );

        let reader = hound::WavReader::open(&rec_result.file_path).unwrap();
        let spec = reader.spec();
        println!(
            "Recorded WAV: {} Hz, {} channels, {} samples",
            spec.sample_rate,
            spec.channels,
            reader.len()
        );
        assert!(reader.len() > 0, "WAV should have samples");

        crate::audio_engine::playback::init().expect("init failed");
        crate::audio_engine::playback::load_clip("recorded", &rec_result.file_path)
            .expect("load recorded clip failed");
        crate::audio_engine::playback::play("recorded").expect("play recorded clip failed");

        std::thread::sleep(std::time::Duration::from_secs(2));

        crate::audio_engine::playback::stop("recorded").ok();
        crate::audio_engine::playback::shutdown().ok();

        // Cleanup
        std::fs::remove_file(&rec_result.file_path).ok();
    }

    #[test]
    fn test_metering() {
        let _metering_lock = crate::audio_engine::metering_scope::METERING_TEST_LOCK
            .lock()
            .unwrap();
        // Reset and verify zeros
        crate::audio_engine::metering::reset();
        let levels = crate::audio_engine::metering::get_levels();
        assert_eq!(levels.rms, 0.0);
        assert_eq!(levels.peak, 0.0);

        // Push some samples
        let samples: Vec<f32> = (0..1024)
            .map(|i| (i as f32 / 1024.0 * 2.0 * std::f32::consts::PI * 440.0).sin() * 0.5)
            .collect();
        crate::audio_engine::metering::push_samples(&samples);

        let levels = crate::audio_engine::metering::get_levels();
        println!(
            "Levels: RMS={:.4} ({:.1} dB), Peak={:.4} ({:.1} dB)",
            levels.rms, levels.rms_db, levels.peak, levels.peak_db
        );
        assert!(levels.rms > 0.0, "RMS should be positive");
        assert!(levels.peak > 0.0, "Peak should be positive");
        assert!(levels.peak <= 0.5 + 0.01, "Peak should be <= 0.5");
        assert!(levels.rms_db < 0.0, "RMS dB should be negative");
    }
}
