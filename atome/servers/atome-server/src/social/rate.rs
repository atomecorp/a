// `createRateLimiter({ max, windowMs })` (server/communication_delivery.js): each key's hits
// within the window, at most `max`; past 10 000 keys the oldest is forgotten.
use indexmap::IndexMap;
use std::sync::Mutex;

pub struct Rate {
    max: usize,
    window_ms: i64,
    hits: Mutex<IndexMap<String, Vec<i64>>>,
}

impl Rate {
    pub fn new(max: usize, window_ms: i64) -> Self {
        Self {
            max,
            window_ms,
            hits: Mutex::new(IndexMap::new()),
        }
    }

    pub fn allowed(&self, key: &str) -> bool {
        let now = chrono::Utc::now().timestamp_millis();
        let mut hits = self.hits.lock().expect("rate");
        let mut list: Vec<i64> = hits.get(key).cloned().unwrap_or_default();
        list.retain(|at| now - at < self.window_ms);
        if list.len() >= self.max {
            hits.insert(key.to_string(), list);
            return false;
        }
        list.push(now);
        hits.insert(key.to_string(), list);
        if hits.len() > 10_000 {
            hits.shift_remove_index(0);
        }
        true
    }
}
