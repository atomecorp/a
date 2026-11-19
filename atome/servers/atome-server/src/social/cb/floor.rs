// The floor of a CB channel (cahier §3.1 and §5, lot L3): one voice at a time. Taking it is atomic (the channel's state
// lives under one lock, channels.rs), it lasts 45 s at most (`cb.floor_max_ms`, a natural number of rule 19), and it goes
// back at the release, at the speaker's leaving or disconnection, or when its time ends. Taken by another, it is refused
// with `cb_floor_busy`. Each turn has its number, so a timer of an old turn never ends a newer one.
pub const BUSY: &str = "cb_floor_busy";

/// Who speaks: their pseudonym in the channel, never their account in a frame.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Holder {
    pub principal: String,
    pub live: u64,
    pub handle: String,
    pub since_ms: u64,
    pub until_ms: u64,
    pub turn: u64,
}

#[derive(Default, Debug)]
pub struct Floor {
    holder: Option<Holder>,
    turns: u64,
}

impl Floor {
    /// The speaker now, none once their time ended (a late timer changes nothing to that).
    pub fn speaking(&self, now_ms: u64) -> Option<&Holder> {
        self.holder
            .as_ref()
            .filter(|holder| now_ms < holder.until_ms)
    }

    /// Whether `principal` holds the floor at `now_ms`.
    pub fn held_by(&self, principal: &str, now_ms: u64) -> bool {
        self.speaking(now_ms)
            .is_some_and(|holder| holder.principal == principal)
    }

    /// The floor asked by `principal` (on connection `live`, as `handle`) for `max_ms` at most: their turn, the same one
    /// when they already hold it; `cb_floor_busy` while someone else speaks.
    pub fn take(
        &mut self,
        principal: &str,
        live: u64,
        handle: &str,
        now_ms: u64,
        max_ms: u64,
    ) -> Result<Holder, &'static str> {
        if let Some(holder) = self.speaking(now_ms) {
            return if holder.principal == principal {
                Ok(holder.clone())
            } else {
                Err(BUSY)
            };
        }
        self.turns += 1;
        let holder = Holder {
            principal: principal.to_string(),
            live,
            handle: handle.to_string(),
            since_ms: now_ms,
            until_ms: now_ms.saturating_add(max_ms),
            turn: self.turns,
        };
        self.holder = Some(holder.clone());
        Ok(holder)
    }

    /// `principal` lets go (or leaves): the turn they held, none if they did not hold it.
    pub fn release(&mut self, principal: &str) -> Option<Holder> {
        if self
            .holder
            .as_ref()
            .is_some_and(|holder| holder.principal == principal)
        {
            return self.holder.take();
        }
        None
    }

    /// The timer of `turn` rang: that turn ends, if it is still the one held.
    pub fn expire(&mut self, turn: u64) -> Option<Holder> {
        if self
            .holder
            .as_ref()
            .is_some_and(|holder| holder.turn == turn)
        {
            return self.holder.take();
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAX: u64 = 45_000;

    // Test 17: two asking at once, one only gets it; asking again while holding keeps the same turn.
    #[test]
    fn one_voice_at_a_time() {
        let mut floor = Floor::default();
        let ana = floor.take("ana", 1, "cbh_a", 1_000, MAX).expect("ana");
        assert_eq!(floor.take("bob", 2, "cbh_b", 1_001, MAX), Err(BUSY));
        assert_eq!(floor.take("ana", 1, "cbh_a", 2_000, MAX), Ok(ana.clone()));
        assert!(floor.held_by("ana", 2_000) && !floor.held_by("bob", 2_000));
        assert_eq!(
            floor.speaking(2_000).map(|h| h.handle.as_str()),
            Some("cbh_a")
        );
    }

    // Test 18: back at the release, at the leaving, and after 45 s; a late timer never ends a newer turn.
    #[test]
    fn the_floor_goes_back() {
        let mut floor = Floor::default();
        floor.take("ana", 1, "cbh_a", 0, MAX).expect("ana");
        assert_eq!(floor.release("bob"), None, "only its holder lets it go");
        assert!(floor.release("ana").is_some());
        let bob = floor.take("bob", 2, "cbh_b", 10, MAX).expect("bob");
        assert!(!floor.held_by("bob", 10 + MAX), "45 s at most");
        assert!(floor.speaking(10 + MAX).is_none());
        let ana = floor
            .take("ana", 1, "cbh_a", 10 + MAX, MAX)
            .expect("free once its time ended");
        assert_eq!(floor.expire(bob.turn), None, "the old turn's timer");
        assert!(floor.held_by("ana", 20 + MAX));
        assert_eq!(
            floor.expire(ana.turn).map(|h| h.principal),
            Some("ana".into())
        );
        assert!(floor.speaking(20 + MAX).is_none());
    }
}
