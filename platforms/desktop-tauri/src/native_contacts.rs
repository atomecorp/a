#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::rc::autoreleasepool;
#[cfg(target_os = "macos")]
use objc2::runtime::{Bool, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2_contacts::{
    CNAuthorizationStatus, CNContact, CNContactEmailAddressesKey, CNContactFamilyNameKey,
    CNContactFetchRequest, CNContactGivenNameKey, CNContactIdentifierKey, CNContactMiddleNameKey,
    CNContactNicknameKey, CNContactNoteKey, CNContactOrganizationNameKey, CNContactPhoneNumbersKey,
    CNContactStore, CNEntityType, CNKeyDescriptor, CNLabeledValue, CNPhoneNumber,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSArray, NSError, NSCopying, NSString};

#[cfg(target_os = "macos")]
fn permission_name(status: CNAuthorizationStatus) -> &'static str {
    if status == CNAuthorizationStatus::Authorized {
        "authorized"
    } else if status == CNAuthorizationStatus::Denied {
        "denied"
    } else if status == CNAuthorizationStatus::Restricted {
        "restricted"
    } else {
        "not_determined"
    }
}

#[cfg(target_os = "macos")]
fn resolve_contacts_permission() -> Result<CNAuthorizationStatus, String> {
    let initial = unsafe { CNContactStore::authorizationStatusForEntityType(CNEntityType::Contacts) };
    if initial != CNAuthorizationStatus::NotDetermined {
        return Ok(initial);
    }

    let store = unsafe { CNContactStore::new() };
    let (sender, receiver) = std::sync::mpsc::channel();
    let completion: RcBlock<dyn Fn(Bool, *mut NSError)> = RcBlock::new(
        move |granted: Bool, error: *mut NSError| {
            let _ = sender.send((granted.as_bool(), error.is_null()));
        },
    );
    unsafe {
        store.requestAccessForEntityType_completionHandler(CNEntityType::Contacts, &completion);
    }
    receiver
        .recv_timeout(std::time::Duration::from_secs(60))
        .map_err(|_| "macos_contacts_permission_timeout".to_string())?;
    Ok(unsafe { CNContactStore::authorizationStatusForEntityType(CNEntityType::Contacts) })
}

#[cfg(target_os = "macos")]
unsafe fn phone_values(contact: &CNContact) -> Vec<serde_json::Value> {
    contact
        .phoneNumbers()
        .iter()
        .map(|entry: &CNLabeledValue<CNPhoneNumber>| {
            serde_json::json!({
                "label": entry.label().map(|value| value.to_string()).unwrap_or_default(),
                "value": entry.value().stringValue().to_string()
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
unsafe fn email_values(contact: &CNContact) -> Vec<serde_json::Value> {
    contact
        .emailAddresses()
        .iter()
        .map(|entry: &CNLabeledValue<NSString>| {
            serde_json::json!({
                "label": entry.label().map(|value| value.to_string()).unwrap_or_default(),
                "value": entry.value().to_string()
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn read_apple_contacts() -> Result<serde_json::Value, String> {
    let permission = resolve_contacts_permission()?;
    let permission_text = permission_name(permission);
    if permission != CNAuthorizationStatus::Authorized {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "macos_contacts_permission_denied",
            "permission": permission_text,
            "contacts": []
        }));
    }

    autoreleasepool(|_| unsafe {
        let key_objects = [
            CNContactIdentifierKey,
            CNContactGivenNameKey,
            CNContactMiddleNameKey,
            CNContactFamilyNameKey,
            CNContactNicknameKey,
            CNContactOrganizationNameKey,
            CNContactNoteKey,
            CNContactPhoneNumbersKey,
            CNContactEmailAddressesKey,
        ]
        .into_iter()
        .map(|key| ProtocolObject::<dyn CNKeyDescriptor>::from_retained(key.copy()))
        .collect();
        let keys = NSArray::from_vec(key_objects);
        let request = CNContactFetchRequest::new();
        request.setKeysToFetch(&keys);
        let store = CNContactStore::new();
        let result = store
            .enumeratorForContactFetchRequest_error(&request)
            .map_err(|error| {
                format!(
                    "macos_contacts_fetch_failed:{}",
                    error.localizedDescription().to_string()
                )
            })?;
        let mut contacts = Vec::new();
        for contact in result.value() {
            let first_name = contact.givenName().to_string();
            let middle_name = contact.middleName().to_string();
            let last_name = contact.familyName().to_string();
            let nickname = contact.nickname().to_string();
            let organization = contact.organizationName().to_string();
            let phones = phone_values(&contact);
            let emails = email_values(&contact);
            let composed_name = [first_name.as_str(), middle_name.as_str(), last_name.as_str()]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            let fallback_phone = phones
                .first()
                .and_then(|entry| entry.get("value"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let fallback_email = emails
                .first()
                .and_then(|entry| entry.get("value"))
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let name = [
                composed_name.as_str(),
                nickname.as_str(),
                organization.as_str(),
                fallback_phone,
                fallback_email,
                "Contact",
            ]
            .into_iter()
            .find(|candidate| !candidate.trim().is_empty())
            .unwrap_or("Contact");
            contacts.push(serde_json::json!({
                "id": contact.identifier().to_string(),
                "name": name,
                "first_name": first_name,
                "last_name": last_name,
                "middle_name": middle_name,
                "nickname": nickname,
                "organization": organization,
                "note": contact.note().to_string(),
                "phones": phones,
                "emails": emails
            }));
        }
        Ok(serde_json::json!({
            "ok": true,
            "permission": permission_text,
            "fetched_at": chrono::Utc::now().to_rfc3339(),
            "contacts": contacts
        }))
    })
}

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
    if ([string]::IsNullOrWhiteSpace($name)) { $name = (($first + ' ' + $middle + ' ' + $last).Trim()) }
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $nickname }
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $company }
    if ([string]::IsNullOrWhiteSpace($name)) {
      if ($phones.Count -gt 0) { $name = [string]$phones[0].value }
      elseif ($emails.Count -gt 0) { $name = [string]$emails[0].value }
      else { $name = 'Contact' }
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

#[cfg(target_os = "windows")]
fn read_windows_contacts() -> Result<serde_json::Value, String> {
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
        .map_err(|error| format!("windows_contacts_command_failed:{error}"))?;
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
        return Err(format!("windows_contacts_command_failed:{message}"));
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("windows_contacts_utf8_failed:{error}"))?;
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("windows_contacts_empty_output".to_string());
    }
    serde_json::from_str(trimmed).map_err(|error| format!("windows_contacts_json_failed:{error}"))
}

#[tauri::command]
pub async fn macos_contacts_snapshot() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        return tokio::task::spawn_blocking(read_apple_contacts)
            .await
            .map_err(|error| format!("macos_contacts_task_failed:{error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        return tokio::task::spawn_blocking(read_windows_contacts)
            .await
            .map_err(|error| format!("windows_contacts_task_failed:{error}"))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("macos_contacts_unsupported".to_string())
    }
}
