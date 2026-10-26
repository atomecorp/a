package one.atome.mobile

import android.content.Context
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Nickname
import android.provider.ContactsContract.CommonDataKinds.Note
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.Data
import org.json.JSONArray
import org.json.JSONObject

// The phone's address book, read for eVe's contact import: the same snapshot the Apple Contacts
// reader answers (`macos_contacts_snapshot`: contacts with names, phones, emails, organization,
// note), one query over the Data table grouped by contact. Read only; nothing is written back.
object NativeContacts {
    private val KINDS = arrayOf(StructuredName.CONTENT_ITEM_TYPE, Phone.CONTENT_ITEM_TYPE, Email.CONTENT_ITEM_TYPE,
        Organization.CONTENT_ITEM_TYPE, Nickname.CONTENT_ITEM_TYPE, Note.CONTENT_ITEM_TYPE)

    fun snapshot(context: Context): JSONObject {
        val contacts = LinkedHashMap<String, JSONObject>()
        val projection = arrayOf(Data.LOOKUP_KEY, Data.MIMETYPE, Data.DISPLAY_NAME, Data.DATA1, Data.DATA2, Data.DATA3)
        val where = "${Data.MIMETYPE} IN (${KINDS.joinToString(",") { "?" }})"
        context.contentResolver.query(Data.CONTENT_URI, projection, where, KINDS, "${Data.DISPLAY_NAME} ASC")?.use { rows ->
            while (rows.moveToNext()) {
                val key = rows.getString(0) ?: continue
                val contact = contacts.getOrPut(key) {
                    JSONObject().put("id", key).put("name", rows.getString(2) ?: "").put("phones", JSONArray()).put("emails", JSONArray())
                }
                val value = rows.getString(3) ?: ""
                when (rows.getString(1)) {
                    StructuredName.CONTENT_ITEM_TYPE -> contact.put("first_name", rows.getString(4) ?: "").put("last_name", rows.getString(5) ?: "")
                    Phone.CONTENT_ITEM_TYPE -> if (value.isNotBlank()) contact.getJSONArray("phones").put(JSONObject().put("label", label(context, Phone::class.java, rows.getInt(4))).put("value", value))
                    Email.CONTENT_ITEM_TYPE -> if (value.isNotBlank()) contact.getJSONArray("emails").put(JSONObject().put("label", label(context, Email::class.java, rows.getInt(4))).put("value", value))
                    Organization.CONTENT_ITEM_TYPE -> if (value.isNotBlank()) contact.put("organization", value)
                    Nickname.CONTENT_ITEM_TYPE -> if (value.isNotBlank()) contact.put("nickname", value)
                    Note.CONTENT_ITEM_TYPE -> if (value.isNotBlank()) contact.put("note", value)
                }
            }
        }
        return JSONObject().put("ok", true).put("permission", "granted").put("mode", "snapshot").put("complete", true)
            .put("source_label", "Android Contacts").put("contacts", JSONArray(contacts.values))
    }

    // The system's own label for a phone or an email type (« Mobile », « Domicile »…).
    private fun label(context: Context, kind: Class<*>, type: Int): String = when (kind) {
        Phone::class.java -> Phone.getTypeLabel(context.resources, type, "").toString()
        else -> Email.getTypeLabel(context.resources, type, "").toString()
    }
}
