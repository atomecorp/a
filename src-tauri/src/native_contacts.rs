#[cfg(any(target_os = "macos", target_os = "windows"))]
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

#[cfg(target_os = "windows")]
const WINDOWS_CONTACTS_POWERSHELL: &str = r#"
$payload = @{
  ok = $true
  fetched_at = (Get-Date).ToString('o')
  contacts = @()
}

try {
  $outlook = New-Object -ComObject Outlook.Application
  $namespace = $outlook.GetNameSpace('MAPI')
  $contactsFolder = $namespace.GetDefaultFolder(10)
  $items = $contactsFolder.Items

  foreach ($item in $items) {
    if ($null -eq $item) { continue }
    if ($item.Class -ne 40) { continue }

    $phones = @()
    if ($item.MobileTelephoneNumber) { $phones += @{ label = 'mobile'; value = [string]$item.MobileTelephoneNumber } }
    if ($item.BusinessTelephoneNumber) { $phones += @{ label = 'work'; value = [string]$item.BusinessTelephoneNumber } }
    if ($item.HomeTelephoneNumber) { $phones += @{ label = 'home'; value = [string]$item.HomeTelephoneNumber } }

    $emails = @()
    if ($item.Email1Address) { $emails += @{ label = 'email1'; value = [string]$item.Email1Address } }
    if ($item.Email2Address) { $emails += @{ label = 'email2'; value = [string]$item.Email2Address } }
    if ($item.Email3Address) { $emails += @{ label = 'email3'; value = [string]$item.Email3Address } }

    $first = [string]$item.FirstName
    $last = [string]$item.LastName
    $middle = [string]$item.MiddleName
    $full = [string]$item.FullName
    $company = [string]$item.CompanyName
    $nickname = [string]$item.NickName

    $name = $full.Trim()
    if ([string]::IsNullOrWhiteSpace($name)) {
      $name = (($first + ' ' + $middle + ' ' + $last).Trim())
    }
    if ([string]::IsNullOrWhiteSpace($name)) {
      $name = $nickname
    }
    if ([string]::IsNullOrWhiteSpace($name)) {
      $name = $company
    }
    if ([string]::IsNullOrWhiteSpace($name)) {
      if ($phones.Count -gt 0) {
        $name = [string]$phones[0].value
      } elseif ($emails.Count -gt 0) {
        $name = [string]$emails[0].value
      } else {
        $name = 'Contact'
      }
    }

    $payload.contacts += @{
      id = [string]$item.EntryID
      name = [string]$name
      first_name = [string]$first
      last_name = [string]$last
      middle_name = [string]$middle
      nickname = [string]$nickname
      organization = [string]$company
      note = [string]$item.Body
      phones = $phones
      emails = $emails
    }
  }
} catch {
  $payload = @{
    ok = $false
    error = 'windows_contacts_access_failed'
    message = [string]$_.Exception.Message
  }
}

$payload | ConvertTo-Json -Depth 8 -Compress
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

      #[cfg(target_os = "windows")]
      {
        let output = Command::new("powershell")
          .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            WINDOWS_CONTACTS_POWERSHELL,
          ])
          .output()
          .map_err(|error| format!("windows_contacts_command_failed:{}", error))?;

        if !output.status.success() {
          let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
          let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
          let message = if !stderr.is_empty() {
            stderr
          } else if !stdout.is_empty() {
            stdout
          } else {
            "unknown_powershell_failure".to_string()
          };
          return Err(format!("windows_contacts_command_failed:{}", message));
        }

        let stdout = String::from_utf8(output.stdout)
          .map_err(|error| format!("windows_contacts_utf8_failed:{}", error))?;
        let trimmed = stdout.trim();
        if trimmed.is_empty() {
          return Err("windows_contacts_empty_output".to_string());
        }

        return serde_json::from_str(trimmed)
          .map_err(|error| format!("windows_contacts_json_failed:{}", error));
      }

      #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("macos_contacts_unsupported".to_string())
    }
}
