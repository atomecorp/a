# atome keychain converter — formats and envelope

`atome-keychain-converter` turns the official export a person chooses from their
password manager into a document of the **FIDO Credential Exchange Format (CXF) 1.0**
(Proposed Standard of 2025-08-14 with the errata of 2026-03-09), sealed by default.
It is a standalone macOS tool: no account, no network, no telemetry, no atome
installation. Everything happens in memory on the person's Mac.

This file is the security documentation that CXF §5.1 asks an exporter to publish,
and the specification of every byte the tool writes.

## 1. Use

- **App:** open `atome keychain converter.app`. Five native dialogs: choose the
  export → preview (accounts, vaults, items, attachments, passkeys found) →
  passphrase (asked twice, 12 characters at least) → file name → report (what was
  converted, the limitations). The report is also written beside the output as
  `<output>.report.json`.
- **CLI** (same binary, for scripts and tests):

  ```
  atome-keychain-converter inspect <source> [--format 1pux|1pif|csv]
  atome-keychain-converter convert <source> --out <file> (--passphrase-stdin | --plaintext-cxf)
                           [--format …] [--timestamp <unix seconds>] [--report <file>] [--replace]
  atome-keychain-converter verify <file.atomecxf> --passphrase-stdin
  ```

  The report (JSON, without secrets) goes to stdout. Errors go to stderr as
  `error: <code>: <detail>`, with exit code 2. The passphrase is only ever read from
  stdin, never from an argument, which `ps` would show.

## 2. Sources

Only files the person exported and chose are read. There is no private API, no
keychain access and no attempt to bypass a protection: an encrypted export is
refused.

| Source | Detected by | Status |
| --- | --- | --- |
| 1Password 8 `.1pux` | ZIP magic | Complete: accounts, vaults, every category, attachments |
| 1Password 7 `.1pif` | `.1pif` extension, or a folder holding `data.1pif` | Complete except attachments, which 1PIF does not carry |
| Apple Passwords CSV | header `Title,URL,Username,Password,Notes,OTPAuth` | Complete |
| Bitwarden, Chrome/Edge/Brave, Firefox, LastPass, KeePassXC, Dashlane, Proton Pass CSV | their headers | Complete for what the CSV holds |
| Any other CSV | at least one title, URL, user name or password column (English or French header) | Generic mapping; every other column becomes a custom field |

### 2.1 1PUX (`export.attributes`, `export.data`, `files/`)

- **Account → `Account`.** `attrs.accountName` (or `name`) becomes `username`,
  `email` stays `email`, `name` becomes `fullName`. The uuid and domain go into the
  `atome.one/source` extension.
- **Vault → `Collection`** with its name, its description as `subtitle`, and its
  uuid and type (P personal, E everyone, U user) in the extension. Every item of
  the vault is linked from it.
- **Item → `Item`:** title, subtitle, `createdAt`/`updatedAt` → `creationAt`/`modifiedAt`,
  `favIndex > 0` → `favorite`, tags, every URL in `scope.urls`. The category,
  original uuid and state (`archived`; deleted items are absent from 1PUX) go into
  the extension.
- **Credentials:**
  - Login fields with a `username`/`password` designation → `basic-auth`.
  - Other login fields → `custom-fields` "Web Form Details".
  - `totp` fields → `totp`.
  - Address fields → `address`.
  - References → `item-reference`.
  - PKCS#8 PEM private keys → `ssh-key`.
  - `notesPlain` → `note`.
  - Template fields of categories 002, 004, 102, 103, 106, 108, 109, 110, 111 and 112
    fill the members of `credit-card`, `person-name`/`address`, `basic-auth`,
    `drivers-license`, `passport`, `identity-document`, `wifi` and `api-key`
    (table: `src/sources/onepassword_rules.rs`).
  - Every other field → `custom-fields` of its section, under the section title,
    typed by its value: `concealed` → `concealed-string`, `email`, `date`,
    `monthYear` → `year-month`, and anything else → `string`.
  - Labelled URLs → `custom-fields` "URLs"; the password history → `custom-fields`
    "Password History", one `concealed-string` per old password, its date as the
    label.
  - Documents (category 006 `documentAttributes`) and file fields → `file`, with the
    bytes in `documents/<id>`.
- **Values CXF cannot type.**
  - A value whose syntax does not match its CXF member is moved to a custom field
    rather than invented. For example, a date that is not ISO 8601, or a country
    that is not ISO 3166-1 alpha-2.
  - A value of an unknown 1Password type is kept as its JSON text, in a
    `concealed-string` custom field (it may be a secret), and reported as
    `source_field_type_unknown`.
  - A source member CXF types as `string` (the numbers of a licence, a passport or
    a social security card) stays `string` even when 1Password marks it concealed:
    CXF §3.4.2 says the value SHOULD belong to the member's declared type.
- **Keys with no CXF place** (for example `overview.ps`, `inputTraits`) are listed in
  the report under `source_keys_only_in_fidelity`. Their values stay in the sealed
  fidelity backup (§4).
- **A newer `export.attributes` version** is read the same way and reported as
  `source_version_newer`. Any key it adds is listed as above.

### 2.2 1PIF

Records separated by `***5642bee8-a5ff-11dc-8314-0800200c9a66***`. Each `typeName`
is translated to its 1PUX category code, and the record then follows the same
mapping.

- Folders become collections.
- `trashed` becomes state `trashed`.
- `faveIndex` becomes `favorite`.
- `TOTP_…` fields become `totp`.
- Tombstones are counted and skipped.
- `data.1pif` is kept in the fidelity backup.

### 2.3 CSV

RFC 4180 rules:

- Quotes, doubled quotes and line breaks inside quotes are handled.
- The BOM is removed and CRLF line endings are accepted.
- The delimiter `,`, `;` or tab is detected.
- Encoding must be UTF-8.

Recognised columns are title, URL, user name, e-mail, password, notes, TOTP (an
`otpauth://totp` URI or a bare Base32 secret), folder, favourite, tags, created,
modified, archived, record type and original id. Every other column becomes a
`custom-fields` field under its header.

- **Folders:** a folder becomes a collection.
- **OTP values:** an OTP value that is not a TOTP (for example HOTP) is kept in
  a `concealed-string` field and reported.
- **Duplicates:** two identical rows stay two items with distinct ids.
- **Source line:** `sourceLine` is the physical line where the row starts.
- **Limitation `csv_has_no_attachments_ids_or_vaults`:** a CSV carries no
  attachments, no stable ids and no vaults.

## 3. CXF document

- `exporterRpId` `atome.one`, `exporterDisplayName` `atome keychain converter`,
  `version` 1.0, `timestamp` of the conversion (or `--timestamp`).
- **Identifiers:** base64url without padding of the first 16 bytes of
  `SHA-256("atome.one/keychain-converter/id/v1" ‖ 0x00-joined parts)`. The parts are
  the kind, the source format, the account and the source uuid.
  - They are stable: the same export always gives the same ids (CXF §3.1 SHOULD).
  - They are opaque: no personal data, and the original uuid cannot be read back.
  - An item uuid is scoped to its account, so the same uuid in two accounts gives
    two items, while a reference to another vault of the same account still
    resolves.
- **Extension `atome.one/source`** (CXF §3.5: an exporter-defined extension is named
  `EXPORTER_RP_ID/NAME`), on accounts, collections and items:
  `{ "name": "atome.one/source", "provider": "1password-1pux" | "1password-1pif" | "csv:<flavour>",
  "originalId"?, "category"?, "state"?: "archived" | "trashed", "vaultType"?, "domain"?,
  "sourceLine"?, "recordType"? }`. An importer that does not know it ignores it
  (§2.1.1).
- **Required arrays** are always present. Optional arrays are absent when empty.
  `favorite` is written only when true.
- **Validation:** `src/validate.rs` checks every document before it can be written.
  The checks cover identifiers, required members, the members of each credential
  type, the syntax of every `fieldType`, TOTP, `ssh-key`, extension names,
  duplicate ids, and each `file` against its document's size and SHA-256
  `integrityHash` (§5.2). The specification's own Appendix A example passes it
  with no violation.

## 4. Package

A ZIP laid out like the CXP credential payload:

| Entry | Content | Present |
| --- | --- | --- |
| `index.json` | the CXF document | always |
| `documents/<file id>` | the bytes of each `file` credential, stored (no compression) | when there are attachments |
| `report.json` | the conversion report | sealed package only |
| `fidelity/…` | the source export verbatim (`export.attributes`, `export.data`, unreferenced `files/…`, `data.1pif`, `source.csv`) | sealed package only |

Entries carry a fixed date and mode 0600. The same source and timestamp give the
same package, byte for byte.

The fidelity backup is what makes the conversion lossless: anything CXF cannot
hold is still there, encrypted. A plaintext package never carries it, so that no
second clear copy of the vault exists.

## 5. Envelope `.atomecxf`

The tool uses no cryptography of its own. It relies on two published constructions
through audited libraries:

- **Argon2id** (RFC 9106, crate `argon2` 0.5) derives a 256-bit key from the
  passphrase.
- **AES-256-GCM** (crate `ring` 0.17) encrypts and authenticates the whole package,
  with the header as associated data.

| Offset | Length | Field |
| --- | --- | --- |
| 0 | 8 | magic `ATOMECXF` |
| 8 | 1 | envelope version, `1` |
| 9 | 1 | KDF, `1` = Argon2id v1.3 |
| 10 | 4 | memory in KiB, big-endian (default 65536) |
| 14 | 4 | iterations, big-endian (default 3) |
| 18 | 4 | parallelism, big-endian (default 4) |
| 22 | 16 | salt, random |
| 38 | 1 | AEAD, `1` = AES-256-GCM |
| 39 | 12 | nonce, random |
| 51 | n | ciphertext of the package |
| 51 + n | 16 | GCM tag |

- **Defaults:** they are RFC 9106 §4's second recommended option.
- **Salt and nonce:** both come fresh from the system CSPRNG for every file, and a
  key is used once.
- **Header:** the 51-byte header is authenticated, so changing the parameters, the
  salt or the nonce makes opening fail.
- **Opening:**
  - Parameters above 1 GiB, 16 passes or 16 lanes are refused before any
    derivation, so a hostile file cannot exhaust memory.
  - A wrong passphrase and an altered byte give the same error,
    `seal_authentication_failed`.
- **Passphrase:** at least 12 characters (counted as characters). The app asks for
  it twice.
- **Memory:** the clear package, the key and the passphrase are held in zeroizing
  buffers.

`age` (scrypt or X25519 recipients) would be an equally proven alternative for this
envelope. It is not used, because it would add a dependency the workspace does not
already carry.

## 6. Plaintext CXF

`--plaintext-cxf` writes the package unencrypted, for an importer that reads CXF
directly. It is only ever produced on that explicit request. It prints a warning
on stderr. It carries neither the report nor the fidelity backup. The app never
offers it.

## 7. Security measures

- **Local only:** no network code, no telemetry, no update check.
- **No clear copy on disk:** the source is read into memory and nothing is
  extracted. The output goes to a sibling `.<name>.partial-<pid>` file created with
  mode 0600, then is renamed into place; on failure the partial file is removed.
- **Logs:** the report and the logs name items by their CXF id and fields by their
  label or source key. They never hold a value, a title, a URL or a user name
  (tested).
- **ZIP checks** (`src/safe_zip.rs`), applied before any entry is read:
  - Zip Slip: no absolute path, `..`, `.`, empty component, backslash, NUL or
    drive letter.
  - No symbolic link and no encrypted entry.
  - No duplicate name. The `zip` crate silently keeps one of several entries with
    the same name, so the count declared by the end-of-central-directory record
    (ZIP64 included) must equal the number of distinct entries.
  - Limits: 100,000 entries, 1 GiB per entry, 2 GiB in all, and an expansion ratio
    of 200 above 1 MiB (decompression bombs).
- **ZIP checks on read:** the actual size must equal the declared size, and the
  CRC must match.
- **Strict parsing:** JSON is parsed strictly, with nesting bounded by serde_json,
  and types are checked path by path (`source_structure_invalid` names the path).
  CSV is bounded to 512 columns and 1,000,000 rows. Sources are bounded to 256 MiB
  (CSV) and 512 MiB (`data.1pif`).

## 8. Limitations

These always appear in the report when they apply:

- **`passkeys_not_in_file_exports`** (always listed). A passkey's private key never
  leaves its provider, so no 1PUX, 1PIF or CSV export holds one. The tool counts
  the passkeys it sees (`passkeys_found`, warning `passkey_not_exportable`) and
  never simulates one. To move them, use a Credential Exchange (CXP) transfer
  between providers that support it, or create a new passkey on each site.
- **`password_history_as_custom_fields`:** CXF has no password history, so old
  passwords are kept as concealed custom fields.
- **`1pif_has_no_attachments`** and **`csv_has_no_attachments_ids_or_vaults`**.
- **Attachments:**
  - An attachment named by an item but absent from the export gives
    `attachment_missing`.
  - A file present but referenced by no item stays in the fidelity backup
    (`attachment_unreferenced_kept_in_fidelity`), or is left out of a plaintext
    package (`attachment_unreferenced_not_exported`).

## 9. atome

atome has no CXF importer yet. Its one store for a person's secrets is the account
secret vault (`server/providerCredentialVault.js` `createAccountSecretVault`,
reached through `secret.store`). `src/atome_entries.rs` gives the shape an importer
would write there, within that vault's limits:

- One entry per CXF item:
  `{ "entry_id": "cxf:<account id>:<item id>", "value": <CXF item>, "metadata": { "kind": "cxf-item", "cxf_version": "1.0", "account": <account id> } }`.
- Limits: ids of at most 512 bytes in `[A-Za-z0-9._%:-]`, 256 KiB per entry, and
  1000 entries.

The synthetic example, in `tests/fixtures/keychain_converter/expected/`:

- `example.cxf.json`: the CXF document of the 1PUX fixture.
- `example.atome_entries.json`: its atome entries.

## 10. Tests

`cargo test -p atome-keychain-converter` runs the integration tests under
`tests/keychain_converter/`. They use the fictitious exports of
`tests/fixtures/keychain_converter/`:

- every type, Unicode, several accounts and vaults, attachments;
- repeated conversion;
- unknown fields and newer versions;
- hostile ZIPs (Zip Slip, symbolic link, encryption, duplicates, bomb, lying
  sizes, CRC, truncation, ZIP64);
- malformed JSON, CSV and 1PIF;
- the envelope (round trip, tampering, hostile headers);
- 3000 items with 48 MiB of attachments;
- the CLI.

`KEYCHAIN_CONVERTER_UPDATE=1` rewrites the golden example after a deliberate change.
