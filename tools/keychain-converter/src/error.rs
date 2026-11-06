use std::fmt;

/// One failure: a stable machine code and a detail that never carries a secret
/// (paths inside the export, line numbers, field names, sizes only).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub code: &'static str,
    pub detail: String,
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn err(code: &'static str, detail: impl Into<String>) -> Error {
    Error {
        code,
        detail: detail.into(),
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.detail.is_empty() {
            f.write_str(self.code)
        } else {
            write!(f, "{}: {}", self.code, self.detail)
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        err("io_error", error.kind().to_string())
    }
}
