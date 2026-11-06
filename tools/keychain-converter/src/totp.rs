use percent_encoding::percent_decode_str;
use url::Url;

/// A TOTP credential (CXF §3.3.16).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Totp {
    pub secret: String,
    pub period: u16,
    pub digits: u16,
    pub algorithm: &'static str,
    pub username: Option<String>,
    pub issuer: Option<String>,
}

fn base32(secret: &str) -> Result<String, &'static str> {
    let secret: String = secret
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();
    let secret = secret.trim_end_matches('=');
    if secret.is_empty()
        || !secret
            .bytes()
            .all(|b| b.is_ascii_uppercase() || (b'2'..=b'7').contains(&b))
    {
        return Err("otp_secret_not_base32");
    }
    Ok(secret.to_string())
}

fn bounded(value: &str, reason: &'static str) -> Result<u16, &'static str> {
    value.parse::<u16>().ok().filter(|n| *n > 0).ok_or(reason)
}

/// Reads an `otpauth://totp/...` URI (Google Authenticator Key Uri Format, the
/// format CXF follows) or a bare Base32 secret with the defaults of §3.3.16.
/// The reason of a refusal names the defect, never the secret.
pub fn parse(input: &str) -> Result<Totp, &'static str> {
    let input = input.trim();
    if !input
        .get(..10)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("otpauth://"))
    {
        return Ok(Totp {
            secret: base32(input)?,
            period: 30,
            digits: 6,
            algorithm: "sha1",
            username: None,
            issuer: None,
        });
    }
    let uri = Url::parse(input).map_err(|_| "otp_uri_invalid")?;
    if !uri
        .host_str()
        .is_some_and(|kind| kind.eq_ignore_ascii_case("totp"))
    {
        return Err("otp_not_totp");
    }
    let label = percent_decode_str(uri.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| "otp_uri_invalid")?
        .into_owned();
    let (mut issuer, username) = match label.split_once(':') {
        Some((issuer, account)) => (Some(issuer.trim().to_string()), account.trim().to_string()),
        None => (None, label.trim().to_string()),
    };
    let mut code = Totp {
        secret: String::new(),
        period: 30,
        digits: 6,
        algorithm: "sha1",
        username: (!username.is_empty()).then_some(username),
        issuer: None,
    };
    for (key, value) in uri.query_pairs() {
        match key.to_ascii_lowercase().as_str() {
            "secret" => code.secret = base32(&value)?,
            "issuer" if !value.trim().is_empty() => issuer = Some(value.trim().to_string()),
            "digits" => code.digits = bounded(&value, "otp_digits_invalid")?,
            "period" => code.period = bounded(&value, "otp_period_invalid")?,
            "algorithm" => {
                code.algorithm = match value.to_ascii_uppercase().as_str() {
                    "SHA1" => "sha1",
                    "SHA256" => "sha256",
                    "SHA512" => "sha512",
                    _ => return Err("otp_algorithm_unknown"),
                }
            }
            _ => {}
        }
    }
    if code.secret.is_empty() {
        return Err("otp_secret_missing");
    }
    code.issuer = issuer.filter(|issuer| !issuer.is_empty());
    Ok(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_key_uri_and_bare_secret() {
        let code = parse("otpauth://totp/ACME%20Co:jos%C3%A9@example.com?secret=jbsw y3dp&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60").unwrap();
        assert_eq!(code.secret, "JBSWY3DP");
        assert_eq!(
            (code.period, code.digits, code.algorithm),
            (60, 8, "sha256")
        );
        assert_eq!(code.username.as_deref(), Some("josé@example.com"));
        assert_eq!(code.issuer.as_deref(), Some("ACME Co"));
        assert_eq!(
            parse("JBSW Y3DP EHPK 3PXP==").unwrap().secret,
            "JBSWY3DPEHPK3PXP"
        );
        assert_eq!(parse("otpauth://hotp/x?secret=JBSW"), Err("otp_not_totp"));
        assert_eq!(
            parse("otpauth://totp/x?secret=JBSW&algorithm=MD5"),
            Err("otp_algorithm_unknown")
        );
        assert_eq!(parse("not base32!"), Err("otp_secret_not_base32"));
    }
}
