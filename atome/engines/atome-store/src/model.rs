// The records the store reads and writes.
use super::*;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AtomeData {
    pub atome_id: String,
    pub atome_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator_id: Option<String>,
    pub data: serde_json::Value,
    pub sync_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EventRecord {
    pub id: String,
    pub ts: String,
    pub atome_id: Option<String>,
    pub project_id: Option<String>,
    pub kind: String,
    pub payload: Option<JsonValue>,
    pub actor: Option<JsonValue>,
    pub tx_id: Option<String>,
    pub gesture_id: Option<String>,
}
