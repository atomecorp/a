// A bank's samples are stored in FLAC (cahier sampler §9): lossless, about half a
// WAV, decoded by every engine. A plain encoder: fixed predictors (orders 0–4,
// the cheapest per channel and block) with partitioned Rice residuals, constant
// subframes for silence, independent channels, 8–24-bit integer PCM.
use crate::{KernelError, Result, UNSUPPORTED, require_channels};

const BLOCK: usize = 4096;
const MAX_PARTITION_ORDER: u32 = 6;
const MAX_RICE: u32 = 14;

#[derive(Default)]
struct BitWriter {
    bytes: Vec<u8>,
    acc: u64,
    bits: u32,
}

impl BitWriter {
    fn write(&mut self, value: u64, count: u32) {
        let mut left = count;
        while left > 0 {
            let take = left.min(32);
            left -= take;
            self.acc = (self.acc << take) | ((value >> left) & ((1u64 << take) - 1));
            self.bits += take;
            while self.bits >= 8 {
                self.bits -= 8;
                self.bytes.push((self.acc >> self.bits) as u8);
                self.acc &= (1u64 << self.bits) - 1;
            }
        }
    }
    fn unary(&mut self, zeros: u64) {
        let mut left = zeros;
        while left > 0 {
            let run = left.min(32) as u32;
            self.write(0, run);
            left -= u64::from(run);
        }
        self.write(1, 1);
    }
    fn align(&mut self) {
        if self.bits > 0 {
            self.write(0, 8 - self.bits);
        }
    }
}

fn crc8(bytes: &[u8]) -> u8 {
    bytes.iter().fold(0u8, |crc, byte| {
        (0..8).fold(crc ^ byte, |crc, _| {
            if crc & 0x80 != 0 {
                (crc << 1) ^ 0x07
            } else {
                crc << 1
            }
        })
    })
}
fn crc16(bytes: &[u8]) -> u16 {
    bytes.iter().fold(0u16, |crc, byte| {
        (0..8).fold(crc ^ (u16::from(*byte) << 8), |crc, _| {
            if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x8005
            } else {
                crc << 1
            }
        })
    })
}
fn utf8_number(value: u64) -> Vec<u8> {
    if value < 0x80 {
        return vec![value as u8];
    }
    let mut out = Vec::new();
    let (mut rest, mut room) = (value, 6u32);
    while rest >= 1u64 << room {
        out.insert(0, 0x80 | (rest & 0x3f) as u8);
        rest >>= 6;
        room -= 1;
    }
    let lead = (0xffu32 << (7 - out.len() as u32)) as u8;
    out.insert(0, lead | rest as u8);
    out
}

fn residuals_of(s: &[i32], order: usize) -> Vec<i64> {
    (order..s.len())
        .map(|i| {
            let at = |back: usize| i64::from(s[i - back]);
            match order {
                0 => at(0),
                1 => at(0) - at(1),
                2 => at(0) - 2 * at(1) + at(2),
                3 => at(0) - 3 * at(1) + 3 * at(2) - at(3),
                _ => at(0) - 4 * at(1) + 6 * at(2) - 4 * at(3) + at(4),
            }
        })
        .collect()
}
fn zigzag(value: i64) -> u64 {
    if value >= 0 {
        (value as u64) * 2
    } else {
        (-value as u64) * 2 - 1
    }
}
// The cheapest Rice parameter of a partition whose zigzagged residuals sum to `sum`, and its cost.
fn rice_of(sum: u64, count: u64) -> (u32, u64) {
    (0..=MAX_RICE)
        .map(|k| (k, count * u64::from(k + 1) + (sum >> k)))
        .min_by_key(|(_, bits)| *bits)
        .unwrap_or((0, u64::MAX))
}

struct Plan {
    partition_order: u32,
    rice: Vec<u32>,
    size: usize,
    bits: u64,
}

fn partition_plan(residuals: &[i64], block_size: usize, order: usize) -> Option<Plan> {
    let mut prefix = vec![0u64; residuals.len() + 1];
    for (i, value) in residuals.iter().enumerate() {
        prefix[i + 1] = prefix[i] + zigzag(*value);
    }
    let mut best: Option<Plan> = None;
    for partition_order in 0..=MAX_PARTITION_ORDER {
        let parts = 1usize << partition_order;
        if !block_size.is_multiple_of(parts) || block_size / parts <= order {
            break;
        }
        let size = block_size / parts;
        let mut rice = Vec::with_capacity(parts);
        let mut bits = 4u64;
        for part in 0..parts {
            let from = if part == 0 { 0 } else { part * size - order };
            let to = (part + 1) * size - order;
            let (k, cost) = rice_of(prefix[to] - prefix[from], (to - from) as u64);
            rice.push(k);
            bits += 4 + cost;
        }
        if best.as_ref().is_none_or(|plan| bits < plan.bits) {
            best = Some(Plan {
                partition_order,
                rice,
                size,
                bits,
            });
        }
    }
    best
}

fn write_subframe(writer: &mut BitWriter, samples: &[i32], bits: u32) {
    let mask = (1u64 << bits) - 1;
    let raw = |value: i32| (i64::from(value) as u64) & mask;
    if samples.iter().all(|value| *value == samples[0]) {
        writer.write(0, 8);
        writer.write(raw(samples[0]), bits);
        return;
    }
    let mut best: Option<(usize, Vec<i64>, Plan, u64)> = None;
    for order in 0..=4.min(samples.len() - 1) {
        let residuals = residuals_of(samples, order);
        if let Some(plan) = partition_plan(&residuals, samples.len(), order) {
            let cost = plan.bits + (order as u64) * u64::from(bits);
            if best
                .as_ref()
                .is_none_or(|(.., best_cost)| cost < *best_cost)
            {
                best = Some((order, residuals, plan, cost));
            }
        }
    }
    let Some((order, residuals, plan, _)) =
        best.filter(|(.., cost)| *cost < samples.len() as u64 * u64::from(bits))
    else {
        writer.write(0b0000_0010, 8);
        for value in samples {
            writer.write(raw(*value), bits);
        }
        return;
    };
    writer.write(0x10 | ((order as u64) << 1), 8);
    for value in &samples[..order] {
        writer.write(raw(*value), bits);
    }
    writer.write(0, 2);
    writer.write(u64::from(plan.partition_order), 4);
    for (part, k) in plan.rice.iter().enumerate() {
        writer.write(u64::from(*k), 4);
        let from = if part == 0 {
            0
        } else {
            part * plan.size - order
        };
        for residual in &residuals[from..(part + 1) * plan.size - order] {
            let value = zigzag(*residual);
            writer.unary(value >> k);
            if *k > 0 {
                writer.write(value & ((1u64 << k) - 1), *k);
            }
        }
    }
}

/// A FLAC file of integer PCM (1..8 channels, `bits` 8..24 deep).
pub fn encode_flac(channels: &[&[i32]], sample_rate: u32, bits: u32) -> Result<Vec<u8>> {
    let frames = require_channels(channels)?;
    if channels.len() > 8 {
        return Err(KernelError::new(UNSUPPORTED, "FLAC holds 1 to 8 channels"));
    }
    if !(8..=24).contains(&bits) {
        return Err(KernelError::new(
            UNSUPPORTED,
            "FLAC here holds 8 to 24-bit PCM",
        ));
    }
    if sample_rate == 0 || sample_rate >= 1 << 20 {
        return Err(KernelError::new(
            UNSUPPORTED,
            format!("sample rate {sample_rate}"),
        ));
    }
    let mut w = BitWriter::default();
    w.write(u64::from(u32::from_be_bytes(*b"fLaC")), 32);
    w.write(1, 1);
    w.write(0, 7);
    w.write(34, 24);
    let block = BLOCK.min(frames.max(16)) as u64;
    w.write(block, 16);
    w.write(block, 16);
    w.write(0, 24);
    w.write(0, 24);
    w.write(u64::from(sample_rate), 20);
    w.write(channels.len() as u64 - 1, 3);
    w.write(u64::from(bits) - 1, 5);
    w.write(frames as u64, 36);
    w.write(0, 64);
    w.write(0, 64);
    for (index, start) in (0..frames).step_by(BLOCK).enumerate() {
        let size = BLOCK.min(frames - start);
        let from = w.bytes.len();
        w.write(0xfff8, 16);
        w.write(0b0111, 4);
        w.write(0, 4);
        w.write(channels.len() as u64 - 1, 4);
        w.write(0, 4);
        for byte in utf8_number(index as u64) {
            w.write(u64::from(byte), 8);
        }
        w.write(size as u64 - 1, 16);
        let crc = crc8(&w.bytes[from..]);
        w.write(u64::from(crc), 8);
        for channel in channels {
            write_subframe(&mut w, &channel[start..start + size], bits);
        }
        w.align();
        let crc = crc16(&w.bytes[from..]);
        w.write(u64::from(crc), 16);
    }
    Ok(w.bytes)
}
