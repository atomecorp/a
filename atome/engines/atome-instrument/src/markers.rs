// Markers stuck to the sound (cahier sampler §7.1, decisions Q6/Q7): their
// positions are source frames, so stretch, pitch, tempo and reverse never move
// them. A marker at frame m is the boundary before frame m: it fires when the
// reading crosses it, in either direction, never on a jump (a note's start, a
// jump to a marker). A loop's wrap is no jump: re-entering a round loop crosses
// its loop start, a ping-pong turn crosses back what it read.
//
// Order: a segment's markers are sorted by frame, then by creation; markers
// crossed within one output frame fire in the order met — by position along
// the reading, then by creation for markers on the same frame.
//
// « When » filters the crossings: once for the instrument, every pass, every
// n-th or only the n-th within a note, once per note (voice).

use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerKind {
    Slice,
    LoopPoint,
    Action,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    // The first crossing for the instrument, until it is rebuilt or reset.
    Once,
    EveryPass,
    // Every n-th crossing within a note (n, 2n, …).
    Every(u32),
    // The n-th crossing within a note, only.
    Nth(u32),
    // The first crossing within each note.
    OncePerVoice,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Marker {
    pub frame: usize,
    pub kind: MarkerKind,
    pub when: When,
    // The marker's name: markers of one id in several segments share it, so a
    // transition « at m1 » follows whichever drawn segment carries an m1.
    pub label: u16,
    // It names an eVe command (Q7): each firing is reported to the host.
    pub reports: bool,
}

// A segment's markers: a run of the instrument's marker table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MarkerSpan {
    pub first: u32,
    pub len: u32,
}

impl MarkerSpan {
    pub fn range(&self) -> Range<usize> {
        self.first as usize..(self.first + self.len) as usize
    }
}

// A reading position just short of a loop end: a marker on the end frame is
// never crossed by a loop that turns there.
pub const EDGE: f64 = 1.0e-6;

// Calls `each` with the index of every marker crossed reading from `from` to
// `to` (source frames, `markers` sorted by frame): lo < m ≤ hi, in the order met.
pub fn crossed(markers: &[Marker], from: f64, to: f64, mut each: impl FnMut(usize)) {
    if markers.is_empty() || from == to {
        return;
    }
    let (low, high) = if from < to { (from, to) } else { (to, from) };
    let first = markers.partition_point(|marker| marker.frame as f64 <= low);
    let last = markers.partition_point(|marker| marker.frame as f64 <= high);
    if from < to {
        (first..last).for_each(each);
        return;
    }
    // Backward: frames descending, creation order kept on each frame.
    let mut top = last;
    while top > first {
        let frame = markers[top - 1].frame;
        let mut bottom = top - 1;
        while bottom > first && markers[bottom - 1].frame == frame {
            bottom -= 1;
        }
        (bottom..top).for_each(&mut each);
        top = bottom;
    }
}

pub const MAX_HITS: usize = 8;

// What one output frame of a player crossed: markers (span indices, in order),
// a loop wrap. Markers past `MAX_HITS` in one frame are counted in `missed`.
#[derive(Debug, Clone, Copy, Default)]
pub struct Hits {
    pub markers: [u32; MAX_HITS],
    pub count: usize,
    pub missed: usize,
    pub wrapped: bool,
}

impl Hits {
    pub fn clear(&mut self) {
        self.count = 0;
        self.missed = 0;
        self.wrapped = false;
    }

    pub fn push(&mut self, index: usize) {
        if self.count == MAX_HITS {
            self.missed += 1;
            return;
        }
        self.markers[self.count] = index as u32;
        self.count += 1;
    }

    pub fn any(&self) -> bool {
        self.count > 0 || self.missed > 0 || self.wrapped
    }

    pub fn markers(&self) -> &[u32] {
        &self.markers[..self.count]
    }
}

// Every marker of an instrument, sorted by frame within each segment's span,
// and the « once » state shared by its notes.
#[derive(Debug, Clone, Default)]
pub struct MarkerTable {
    markers: Vec<Marker>,
    fired: Vec<bool>,
}

impl MarkerTable {
    pub fn new(markers: Vec<Marker>) -> Self {
        let fired = vec![false; markers.len()];
        Self { markers, fired }
    }

    pub fn len(&self) -> usize {
        self.markers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.markers.is_empty()
    }

    pub fn get(&self, index: usize) -> &Marker {
        &self.markers[index]
    }

    pub fn span(&self, span: MarkerSpan) -> &[Marker] {
        &self.markers[span.range()]
    }

    // A segment's span lies in the table, its markers inside the region and in frame order.
    pub fn check(&self, span: MarkerSpan, start: usize, end: usize) -> Result<(), String> {
        let range = span.range();
        if range.end > self.markers.len() {
            return Err(format!("markers {}..{} are not in the table of {}", range.start, range.end, self.markers.len()));
        }
        let markers = &self.markers[range];
        if let Some(marker) = markers.iter().find(|marker| marker.frame < start || marker.frame >= end) {
            return Err(format!("marker at frame {} lies outside its region {start}..{end}", marker.frame));
        }
        if markers.windows(2).any(|pair| pair[0].frame > pair[1].frame) {
            return Err("a segment's markers are sorted by frame".to_string());
        }
        if let Some(marker) = markers.iter().find(|marker| matches!(marker.when, When::Every(0) | When::Nth(0))) {
            return Err(format!("marker at frame {}: « every » and « at » count from 1", marker.frame));
        }
        Ok(())
    }

    // Counts a crossing of `index` in a note's `counts`; answers that count when « When » lets it fire.
    pub fn fires(&mut self, index: usize, counts: &mut [u32]) -> Option<u32> {
        counts[index] = counts[index].saturating_add(1);
        let count = counts[index];
        let fires = match self.markers[index].when {
            When::Once => !std::mem::replace(&mut self.fired[index], true),
            When::EveryPass => true,
            When::Every(n) => count.is_multiple_of(n),
            When::Nth(n) => count == n,
            When::OncePerVoice => count == 1,
        };
        fires.then_some(count)
    }

    pub fn reset(&mut self) {
        self.fired.fill(false);
    }
}
