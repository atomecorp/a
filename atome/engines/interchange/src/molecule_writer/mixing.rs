//! The builder's mix: a track's volume, pan, catalogue effects, its sends and
//! routes to group tracks, and the automation lanes of any parameter.

use super::mix::{self, MIX_MAX_GAIN_DB, MIX_SILENCE_DB};
use super::spec::{DspSpec, Keyframe, TrackRole};
use super::{Lane, TimelineBuilder, finite};
use crate::ImportError;

impl TimelineBuilder {
    /// The track's volume, in dB (kept within -120..12).
    pub fn set_gain_db(&mut self, track_id: &str, gain_db: f64) -> Result<(), ImportError> {
        let gain = finite(gain_db, "gain")?.clamp(MIX_SILENCE_DB, MIX_MAX_GAIN_DB);
        self.strip(track_id)?.gain_db = gain;
        Ok(())
    }

    /// The track's pan (-1 left .. 1 right).
    pub fn set_pan(&mut self, track_id: &str, pan: f64) -> Result<(), ImportError> {
        let pan = finite(pan, "pan")?.clamp(-1.0, 1.0);
        self.strip(track_id)?.pan = pan;
        Ok(())
    }

    /// Adds a catalogue effect after the strip's volume and pan; answers its module id.
    pub fn add_dsp(&mut self, track_id: &str, dsp: &DspSpec) -> Result<String, ImportError> {
        let rank = self.strip(track_id)?.dsp.len() + 1;
        let module_id = format!("{track_id}:audio:dsp_{rank}");
        let module = mix::dsp_module(&module_id, dsp)?;
        self.strip(track_id)?.dsp.push(module);
        Ok(module_id)
    }

    /// Sends `send` (0..1) of the track's audio to a group track, `pass` (0..1) going on.
    pub fn send_to_group(
        &mut self,
        track_id: &str,
        group_id: &str,
        send: f64,
        pass: f64,
    ) -> Result<(), ImportError> {
        if self.track(group_id)?.spec.role != TrackRole::Group {
            return Err(ImportError::new(
                "writer_bus_not_group",
                format!("track {group_id} is not a group"),
            ));
        }
        if track_id == group_id {
            return Err(ImportError::new(
                "writer_bus_loop",
                format!("track {track_id} cannot feed itself"),
            ));
        }
        let send = finite(send, "send")?.clamp(0.0, 1.0);
        let pass = finite(pass, "pass")?.clamp(0.0, 1.0);
        self.strip(track_id)?
            .auxes
            .push((group_id.into(), send, pass));
        Ok(())
    }

    /// Routes the whole of the track's audio through a group track (a folder's member).
    pub fn route_to_group(&mut self, track_id: &str, group_id: &str) -> Result<(), ImportError> {
        self.send_to_group(track_id, group_id, 1.0, 0.0)
    }

    /// An automation lane of any target (a track or a clip) and parameter.
    pub fn add_automation(
        &mut self,
        target_id: &str,
        param: &str,
        keyframes: Vec<Keyframe>,
    ) -> Result<String, ImportError> {
        for keyframe in &keyframes {
            if !(keyframe.time_seconds.is_finite()
                && keyframe.time_seconds >= 0.0
                && keyframe.value.is_finite())
            {
                return Err(ImportError::new(
                    "writer_keyframe_invalid",
                    "a keyframe needs a time >= 0 and a finite value",
                ));
            }
        }
        let id = self.fresh("automation");
        self.lanes.push(Lane {
            id: id.clone(),
            target: target_id.into(),
            param: param.into(),
            keyframes,
        });
        Ok(id)
    }

    /// Automates the track's volume (values in dB, kept within -120..12).
    pub fn automate_gain_db(
        &mut self,
        track_id: &str,
        mut keyframes: Vec<Keyframe>,
    ) -> Result<String, ImportError> {
        self.strip(track_id)?;
        keyframes
            .iter_mut()
            .for_each(|k| k.value = k.value.clamp(MIX_SILENCE_DB, MIX_MAX_GAIN_DB));
        self.add_automation(
            track_id,
            &format!("{track_id}:audio:volume#gain_db"),
            keyframes,
        )
    }

    /// Automates the track's pan (values -1..1).
    pub fn automate_pan(
        &mut self,
        track_id: &str,
        mut keyframes: Vec<Keyframe>,
    ) -> Result<String, ImportError> {
        self.strip(track_id)?;
        keyframes
            .iter_mut()
            .for_each(|k| k.value = k.value.clamp(-1.0, 1.0));
        self.add_automation(track_id, &format!("{track_id}:audio:pan#pan"), keyframes)
    }
}
