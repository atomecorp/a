//! The little-endian primitives of the scene codec (`mod.rs`): a writer, and a reader checking every length.

use crate::scene::UsdMatrix;

#[derive(Default)]
pub(super) struct Writer(pub(super) Vec<u8>);

impl Writer {
    pub(super) fn u8(&mut self, value: u8) {
        self.0.push(value);
    }
    pub(super) fn u32(&mut self, value: u32) {
        self.0.extend_from_slice(&value.to_le_bytes());
    }
    pub(super) fn index(&mut self, value: usize) {
        self.u32(u32::try_from(value).expect("scene3d_codec_index_overflow"));
    }
    pub(super) fn f32(&mut self, value: f32) {
        self.0.extend_from_slice(&value.to_le_bytes());
    }
    pub(super) fn f64(&mut self, value: f64) {
        self.0.extend_from_slice(&value.to_le_bytes());
    }
    pub(super) fn bool(&mut self, value: bool) {
        self.u8(u8::from(value));
    }
    pub(super) fn bytes(&mut self, value: &[u8]) {
        self.index(value.len());
        self.0.extend_from_slice(value);
    }
    pub(super) fn str(&mut self, value: &str) {
        self.bytes(value.as_bytes());
    }
    pub(super) fn f32s<const N: usize>(&mut self, value: &[f32; N]) {
        value.iter().for_each(|item| self.f32(*item));
    }
    pub(super) fn matrix(&mut self, value: &UsdMatrix) {
        value.iter().for_each(|item| self.f64(*item));
    }
    pub(super) fn option_index(&mut self, value: Option<usize>) {
        // 0 is none; an index travels as index + 1.
        self.u32(value.map_or(0, |index| {
            u32::try_from(index + 1).expect("scene3d_codec_index_overflow")
        }));
    }
    pub(super) fn list<T>(&mut self, items: &[T], mut each: impl FnMut(&mut Self, &T)) {
        self.index(items.len());
        items.iter().for_each(|item| each(self, item));
    }
}

pub(super) struct Reader<'a> {
    pub(super) bytes: &'a [u8],
    pub(super) at: usize,
}

pub(super) type Read<T> = Result<T, String>;

impl<'a> Reader<'a> {
    pub(super) fn take(&mut self, count: usize) -> Read<&'a [u8]> {
        let end = self
            .at
            .checked_add(count)
            .filter(|end| *end <= self.bytes.len())
            .ok_or("scene3d_codec_truncated")?;
        let slice = &self.bytes[self.at..end];
        self.at = end;
        Ok(slice)
    }
    pub(super) fn array<const N: usize>(&mut self) -> Read<[u8; N]> {
        Ok(self.take(N)?.try_into().expect("length taken"))
    }
    pub(super) fn u8(&mut self) -> Read<u8> {
        Ok(self.take(1)?[0])
    }
    pub(super) fn u32(&mut self) -> Read<u32> {
        Ok(u32::from_le_bytes(self.array()?))
    }
    pub(super) fn index(&mut self) -> Read<usize> {
        Ok(self.u32()? as usize)
    }
    pub(super) fn f32(&mut self) -> Read<f32> {
        Ok(f32::from_le_bytes(self.array()?))
    }
    pub(super) fn f64(&mut self) -> Read<f64> {
        Ok(f64::from_le_bytes(self.array()?))
    }
    pub(super) fn bool(&mut self) -> Read<bool> {
        match self.u8()? {
            0 => Ok(false),
            1 => Ok(true),
            other => Err(format!("scene3d_codec_bool_invalid:{other}")),
        }
    }
    pub(super) fn bytes(&mut self) -> Read<Vec<u8>> {
        let count = self.index()?;
        Ok(self.take(count)?.to_vec())
    }
    pub(super) fn str(&mut self) -> Read<String> {
        String::from_utf8(self.bytes()?).map_err(|_| "scene3d_codec_utf8_invalid".to_string())
    }
    pub(super) fn f32s<const N: usize>(&mut self) -> Read<[f32; N]> {
        let mut value = [0.0; N];
        for item in &mut value {
            *item = self.f32()?;
        }
        Ok(value)
    }
    pub(super) fn matrix(&mut self) -> Read<UsdMatrix> {
        let mut value = [0.0; 16];
        for item in &mut value {
            *item = self.f64()?;
        }
        Ok(value)
    }
    pub(super) fn option_index(&mut self) -> Read<Option<usize>> {
        Ok(self.index()?.checked_sub(1))
    }
    /// A list whose length is checked against the bytes left (`min_item` bytes per item at least).
    pub(super) fn list<T>(
        &mut self,
        min_item: usize,
        mut each: impl FnMut(&mut Self) -> Read<T>,
    ) -> Read<Vec<T>> {
        let count = self.index()?;
        if count.saturating_mul(min_item) > self.bytes.len() - self.at {
            return Err("scene3d_codec_truncated".into());
        }
        (0..count).map(|_| each(self)).collect()
    }
}
