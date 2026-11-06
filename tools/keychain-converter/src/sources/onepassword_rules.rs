//! Which 1Password template field fills which CXF member, per item category.
//! Category codes and template field ids are those of the 1PUX `categoryUuid`
//! (1PIF `typeName`s are translated to them); a field with no rule is kept as a
//! custom field of its section, typed by its value.

/// A rule's target: a member of a fielded credential, or the item's scope.
pub enum Target {
    Member(&'static str, &'static str),
    Scope,
}

use Target::{Member as M, Scope};

pub fn rules(category: &str) -> &'static [(&'static str, Target)] {
    match category {
        "002" => &[
            ("cardholder", M("credit-card", "fullName")),
            ("type", M("credit-card", "cardType")),
            ("ccnum", M("credit-card", "number")),
            ("cvv", M("credit-card", "verificationNumber")),
            ("pin", M("credit-card", "pin")),
            ("expiry", M("credit-card", "expiryDate")),
            ("validFrom", M("credit-card", "validFrom")),
        ],
        "004" => &[
            ("firstname", M("person-name", "given")),
            ("initial", M("person-name", "given2")),
            ("lastname", M("person-name", "surname")),
            ("defphone", M("address", "tel")),
        ],
        "102" => &[
            ("username", M("basic-auth", "username")),
            ("password", M("basic-auth", "password")),
        ],
        "103" => &[
            ("fullname", M("drivers-license", "fullName")),
            ("birthdate", M("drivers-license", "birthDate")),
            ("number", M("drivers-license", "licenseNumber")),
            ("class", M("drivers-license", "licenseClass")),
            ("state", M("drivers-license", "territory")),
            ("country", M("drivers-license", "country")),
            ("expiry_date", M("drivers-license", "expiryDate")),
        ],
        "106" => &[
            ("type", M("passport", "passportType")),
            ("issuing_country", M("passport", "issuingCountry")),
            ("number", M("passport", "passportNumber")),
            ("fullname", M("passport", "fullName")),
            ("sex", M("passport", "sex")),
            ("nationality", M("passport", "nationality")),
            ("issuing_authority", M("passport", "issuingAuthority")),
            ("birthdate", M("passport", "birthDate")),
            ("birthplace", M("passport", "birthPlace")),
            ("issue_date", M("passport", "issueDate")),
            ("expiry_date", M("passport", "expiryDate")),
        ],
        "108" => &[
            ("name", M("identity-document", "fullName")),
            ("number", M("identity-document", "identificationNumber")),
        ],
        "109" => &[
            ("network_name", M("wifi", "ssid")),
            ("wireless_password", M("wifi", "passphrase")),
            ("wireless_security", M("wifi", "networkSecurityType")),
        ],
        "110" => &[
            ("url", Scope),
            ("username", M("basic-auth", "username")),
            ("password", M("basic-auth", "password")),
        ],
        "111" => &[
            ("pop_username", M("basic-auth", "username")),
            ("pop_password", M("basic-auth", "password")),
        ],
        "112" => &[
            ("username", M("api-key", "username")),
            ("credential", M("api-key", "key")),
            ("type", M("api-key", "keyType")),
            ("hostname", M("api-key", "url")),
            ("validFrom", M("api-key", "validFrom")),
            ("expires", M("api-key", "expiryDate")),
        ],
        _ => &[],
    }
}

/// The report's name of a category code (the code itself when unknown).
pub fn category_name(category: &str) -> &str {
    match category {
        "001" => "login",
        "002" => "credit-card",
        "003" => "secure-note",
        "004" => "identity",
        "005" => "password",
        "006" => "document",
        "100" => "software-license",
        "101" => "bank-account",
        "102" => "database",
        "103" => "drivers-license",
        "104" => "outdoor-license",
        "105" => "membership",
        "106" => "passport",
        "107" => "rewards-program",
        "108" => "social-security-number",
        "109" => "wireless-router",
        "110" => "server",
        "111" => "email-account",
        "112" => "api-credential",
        "113" => "medical-record",
        "114" => "ssh-key",
        "115" => "crypto-wallet",
        other => other,
    }
}

/// 1PIF `typeName` → 1PUX category code.
pub fn category_of_type_name(type_name: &str) -> Option<&'static str> {
    Some(match type_name {
        "webforms.WebForm" => "001",
        "wallet.financial.CreditCard" => "002",
        "securenotes.SecureNote" => "003",
        "identities.Identity" => "004",
        "passwords.Password" => "005",
        "wallet.computer.License" => "100",
        "wallet.financial.BankAccountUS" => "101",
        "wallet.computer.Database" => "102",
        "wallet.government.DriversLicense" => "103",
        "wallet.government.HuntingLicense" => "104",
        "wallet.membership.Membership" => "105",
        "wallet.government.Passport" => "106",
        "wallet.membership.RewardProgram" => "107",
        "wallet.government.SsnUS" => "108",
        "wallet.computer.Router" => "109",
        "wallet.computer.UnixServer" => "110",
        "wallet.onlineservices.Email.v2" => "111",
        _ => return None,
    })
}

/// 1Password's Wi-Fi security menu values → CXF WIFINetworkSecurityType.
pub fn wifi_security(value: &str) -> &str {
    match value {
        "none" => "unsecured",
        "wep" => "wep",
        "wpa" => "wpa-personal",
        "wpa2p" => "wpa2-personal",
        "wpa3p" => "wpa3-personal",
        other => other,
    }
}

/// 1Password's SSH key type → the IANA public key algorithm name CXF requires.
pub fn ssh_key_type(value: &str) -> Option<&str> {
    match value {
        "ed25519" | "ssh-ed25519" => Some("ssh-ed25519"),
        "rsa" | "ssh-rsa" => Some("ssh-rsa"),
        other if other.starts_with("ecdsa-sha2-") || other.starts_with("ssh-") => Some(other),
        _ => None,
    }
}
