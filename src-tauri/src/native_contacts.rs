use std::process::Command;

#[cfg(target_os = "macos")]
const MACOS_CONTACTS_JXA: &str = r#"
function safeString(read) {
  try {
    var value = read();
    if (value === null || value === undefined) return '';
    return String(value);
  } catch (_error) {
    return '';
  }
}

function safeList(read, mapItem) {
  try {
    var list = read();
    if (!list || typeof list.length !== 'number') return [];
    var result = [];
    for (var index = 0; index < list.length; index += 1) {
      try {
        var mapped = mapItem(list[index]);
        if (mapped) result.push(mapped);
      } catch (_mapError) {}
    }
    return result;
  } catch (_error) {
    return [];
  }
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .replace(/^_\$!<|>!\$$/g, '')
    .replace(/_/g, ' ');
}

var payload = {
  ok: true,
  fetched_at: (new Date()).toISOString(),
  contacts: []
};

try {
  var app = Application('Contacts');
  app.includeStandardAdditions = true;
  var people = app.people();
  var contacts = [];

  for (var index = 0; index < people.length; index += 1) {
    var person = people[index];
    var firstName = safeString(function () { return person.firstName(); }).trim();
    var lastName = safeString(function () { return person.lastName(); }).trim();
    var middleName = safeString(function () { return person.middleName(); }).trim();
    var nickname = safeString(function () { return person.nickname(); }).trim();
    var organization = safeString(function () { return person.organization(); }).trim();
    var note = safeString(function () { return person.note(); }).trim();
    var identifier = safeString(function () { return person.id(); }).trim();
    var fullName = safeString(function () { return person.name(); }).trim();

    var phones = safeList(function () { return person.phones(); }, function (entry) {
      var value = safeString(function () { return entry.value(); }).trim();
      if (!value) return null;
      return {
        label: normalizeLabel(safeString(function () { return entry.label(); })),
        value: value
      };
    });

    var emails = safeList(function () { return person.emails(); }, function (entry) {
      var value = safeString(function () { return entry.value(); }).trim();
      if (!value) return null;
      return {
        label: normalizeLabel(safeString(function () { return entry.label(); })),
        value: value
      };
    });

    var contactName = fullName || [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
    if (!contactName) {
      contactName = nickname || organization || (phones[0] && phones[0].value) || (emails[0] && emails[0].value) || 'Contact';
    }

    contacts.push({
      id: identifier,
      name: contactName,
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName,
      nickname: nickname,
      organization: organization,
      note: note,
      phones: phones,
      emails: emails
    });
  }

  payload.contacts = contacts;
} catch (error) {
  payload = {
    ok: false,
    error: 'macos_contacts_access_failed',
    message: String(error && error.message ? error.message : error)
  };
}

JSON.stringify(payload);
"#;

#[tauri::command]
pub fn macos_contacts_snapshot() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args(["-l", "JavaScript", "-e", MACOS_CONTACTS_JXA])
            .output()
            .map_err(|error| format!("macos_contacts_command_failed:{}", error))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let message = if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "unknown_osascript_failure".to_string()
            };
            return Err(format!("macos_contacts_command_failed:{}", message));
        }

        let stdout = String::from_utf8(output.stdout)
            .map_err(|error| format!("macos_contacts_utf8_failed:{}", error))?;
        let trimmed = stdout.trim();
        if trimmed.is_empty() {
            return Err("macos_contacts_empty_output".to_string());
        }

        return serde_json::from_str(trimmed)
            .map_err(|error| format!("macos_contacts_json_failed:{}", error));
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("macos_contacts_unsupported".to_string())
    }
}
