//! Exact rational time (`Frac`): FCPXML's `N/Ds` values and OpenTimelineIO's
//! `value / rate` add up without drift, so 23.976 (24000/1001) stays exact until
//! the one rounding to the timeline's sample frames.

use crate::ImportError;

/// A reduced fraction `num / den` (`den > 0`), in seconds where it names a time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Frac {
    num: i128,
    den: i128,
}

const fn gcd(mut a: i128, mut b: i128) -> i128 {
    if a < 0 {
        a = -a;
    }
    if b < 0 {
        b = -b;
    }
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    if a == 0 { 1 } else { a }
}

// Past this size a fraction is no longer kept exact (a float written with many
// decimals): it is brought back to microsecond-scale precision.
const LIMIT: i128 = 1 << 60;

impl Frac {
    /// Zero seconds.
    pub const ZERO: Frac = Frac { num: 0, den: 1 };

    /// `num / den`; `den` must not be zero.
    pub fn new(num: i128, den: i128) -> Result<Frac, ImportError> {
        if den == 0 {
            return Err(ImportError::new(
                "time_denominator_zero",
                "a time has a zero denominator",
            ));
        }
        let sign = if den < 0 { -1 } else { 1 };
        Ok(Frac::bounded(sign * num, sign * den))
    }

    /// An integer.
    pub const fn int(value: i64) -> Frac {
        Frac {
            num: value as i128,
            den: 1,
        }
    }

    /// A finite float, exact when it is a whole number or a short decimal.
    pub fn from_f64(value: f64) -> Result<Frac, ImportError> {
        if !value.is_finite() {
            return Err(ImportError::new(
                "time_not_finite",
                "a time is not a finite number",
            ));
        }
        if value.fract() == 0.0 && value.abs() < 9.0e15 {
            return Ok(Frac {
                num: value as i128,
                den: 1,
            });
        }
        // Twelve decimals keep every value a file writes in decimal form.
        let scale = 1_000_000_000_000i128;
        Frac::new((value * scale as f64).round() as i128, scale)
    }

    /// The numerator.
    pub const fn num(self) -> i128 {
        self.num
    }

    /// The denominator (always positive).
    pub const fn den(self) -> i128 {
        self.den
    }

    /// The nearest float.
    pub fn to_f64(self) -> f64 {
        self.num as f64 / self.den as f64
    }

    fn bounded(num: i128, den: i128) -> Frac {
        let g = gcd(num, den);
        let (mut num, mut den) = (num / g, den / g);
        while num.abs() > LIMIT || den > LIMIT {
            num /= 2;
            den /= 2;
        }
        Frac {
            num,
            den: den.max(1),
        }
    }

    /// `self + other`.
    pub fn plus(self, other: Frac) -> Frac {
        Frac::bounded(
            self.num * other.den + other.num * self.den,
            self.den * other.den,
        )
    }

    /// `self - other`.
    pub fn minus(self, other: Frac) -> Frac {
        Frac::bounded(
            self.num * other.den - other.num * self.den,
            self.den * other.den,
        )
    }

    /// `self * other`.
    pub fn times(self, other: Frac) -> Frac {
        Frac::bounded(self.num * other.num, self.den * other.den)
    }

    /// `self / other`; `other` must not be zero.
    pub fn over(self, other: Frac) -> Result<Frac, ImportError> {
        if other.num == 0 {
            return Err(ImportError::new(
                "time_division_by_zero",
                "a time rate is zero",
            ));
        }
        Ok(Frac::bounded(
            self.num * other.den * other.num.signum(),
            self.den * other.num.abs(),
        ))
    }

    /// The smaller of two.
    pub fn min(self, other: Frac) -> Frac {
        if self <= other { self } else { other }
    }

    /// The larger of two.
    pub fn max(self, other: Frac) -> Frac {
        if self >= other { self } else { other }
    }

    /// True when below zero.
    pub const fn is_negative(self) -> bool {
        self.num < 0
    }

    /// True when exactly zero.
    pub const fn is_zero(self) -> bool {
        self.num == 0
    }

    /// Parses FCPXML's rational time: `"0s"`, `"5s"`, `"1001/24000s"`, `"2.5s"`.
    pub fn parse_fcp(text: &str) -> Result<Frac, ImportError> {
        let bad = || {
            ImportError::new(
                "fcpxml_time_invalid",
                format!("invalid FCPXML time {text:?}"),
            )
        };
        let body = text.trim().strip_suffix('s').ok_or_else(bad)?;
        match body.split_once('/') {
            Some((num, den)) => {
                let num: i128 = num.trim().parse().map_err(|_| bad())?;
                let den: i128 = den.trim().parse().map_err(|_| bad())?;
                Frac::new(num, den).map_err(|_| bad())
            }
            None => {
                if let Ok(whole) = body.parse::<i128>() {
                    return Ok(Frac { num: whole, den: 1 });
                }
                let value: f64 = body.parse().map_err(|_| bad())?;
                Frac::from_f64(value)
            }
        }
    }
}

// Ordered by value: both are reduced with a positive denominator.
impl Ord for Frac {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (self.num * other.den).cmp(&(other.num * self.den))
    }
}

impl PartialOrd for Frac {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::Frac;

    #[test]
    fn fcpxml_times_stay_exact() {
        let frame = Frac::parse_fcp("1001/24000s").expect("time");
        let nine = frame.times(Frac::int(9));
        assert_eq!((nine.num(), nine.den()), (3003, 8000));
        assert_eq!(Frac::parse_fcp("10s").expect("time"), Frac::int(10));
        assert!(Frac::parse_fcp("1/0s").is_err());
        assert!(Frac::int(1).over(Frac::ZERO).is_err());
        assert!(Frac::new(1, 3).expect("third") < Frac::new(1, 2).expect("half"));
    }
}
