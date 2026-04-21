use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

const PROJECTS: &str = "molecule_project_store_projects";
const ATOMES: &str = "molecule_project_store_atomes";
const TIMELINES: &str = "molecule_project_store_timelines";
const EVENTS: &str = "molecule_event_store_events";
const ORIGINAL_ASSETS: &str = "molecule_media_store_original_assets";
const MEDIA_REFS: &str = "molecule_media_store_refs";

pub struct MoleculeStoreState {
    db: Mutex<Connection>,
}

fn validate_store_name(store_name: &str) -> Result<(), String> {
    match store_name {
        PROJECTS | ATOMES | TIMELINES | EVENTS | ORIGINAL_ASSETS | MEDIA_REFS => Ok(()),
        _ => Err(format!("molecule_store/invalid_store: {}", store_name)),
    }
}

fn require_key(key: Option<String>) -> Result<String, String> {
    key.filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "molecule_store/key_required".to_string())
}

fn require_value(value: Option<Value>) -> Result<Value, String> {
    value.ok_or_else(|| "molecule_store/value_required".to_string())
}

fn open_database(data_dir: PathBuf) -> Result<Connection, String> {
    std::fs::create_dir_all(&data_dir).map_err(|err| err.to_string())?;
    let db_path = data_dir.join("molecule_store.db");
    let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS molecule_store_records (
            store_name TEXT NOT NULL,
            record_key TEXT NOT NULL,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (store_name, record_key)
        );
        CREATE TABLE IF NOT EXISTS molecule_store_sequences (
            store_name TEXT PRIMARY KEY,
            next_seq INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_molecule_store_records_store
            ON molecule_store_records (store_name);
        ",
    )
    .map_err(|err| err.to_string())?;
    Ok(conn)
}

pub fn create_state(data_dir: PathBuf) -> Result<MoleculeStoreState, String> {
    Ok(MoleculeStoreState {
        db: Mutex::new(open_database(data_dir)?),
    })
}

fn read_value(conn: &Connection, store_name: &str, record_key: &str) -> Result<Option<Value>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM molecule_store_records WHERE store_name = ?1 AND record_key = ?2",
            params![store_name, record_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    raw.map(|value| serde_json::from_str(&value).map_err(|err| err.to_string()))
        .transpose()
}

fn read_all(conn: &Connection, store_name: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT value_json FROM molecule_store_records
             WHERE store_name = ?1
             ORDER BY CAST(record_key AS INTEGER), record_key",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![store_name], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    let mut values = Vec::new();
    for row in rows {
        let raw = row.map_err(|err| err.to_string())?;
        values.push(serde_json::from_str(&raw).map_err(|err| err.to_string())?);
    }
    Ok(values)
}

fn write_value(
    conn: &Connection,
    store_name: &str,
    record_key: &str,
    value: &Value,
) -> Result<(), String> {
    let raw = serde_json::to_string(value).map_err(|err| err.to_string())?;
    conn.execute(
        "
        INSERT INTO molecule_store_records (store_name, record_key, value_json, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(store_name, record_key)
        DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
        ",
        params![store_name, record_key, raw, Utc::now().to_rfc3339()],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn next_sequence(conn: &Connection, store_name: &str) -> Result<i64, String> {
    let current: Option<i64> = conn
        .query_row(
            "SELECT next_seq FROM molecule_store_sequences WHERE store_name = ?1",
            params![store_name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let seq = current.unwrap_or(1);
    conn.execute(
        "
        INSERT INTO molecule_store_sequences (store_name, next_seq)
        VALUES (?1, ?2)
        ON CONFLICT(store_name)
        DO UPDATE SET next_seq = excluded.next_seq
        ",
        params![store_name, seq + 1],
    )
    .map_err(|err| err.to_string())?;
    Ok(seq)
}

#[tauri::command]
pub fn molecule_store_execute(
    state: State<MoleculeStoreState>,
    action: String,
    store_name: String,
    key: Option<String>,
    value: Option<Value>,
) -> Result<Value, String> {
    validate_store_name(&store_name)?;
    let conn = state.db.lock().map_err(|err| err.to_string())?;
    match action.as_str() {
        "get" => {
            let record_key = require_key(key)?;
            Ok(json!({ "value": read_value(&conn, &store_name, &record_key)? }))
        }
        "getAll" => Ok(json!({ "values": read_all(&conn, &store_name)? })),
        "put" => {
            let record_key = require_key(key)?;
            let stored_value = require_value(value)?;
            write_value(&conn, &store_name, &record_key, &stored_value)?;
            Ok(json!({ "ok": true }))
        }
        "add" => {
            let mut stored_value = require_value(value)?;
            let seq = next_sequence(&conn, &store_name)?;
            if let Value::Object(ref mut object) = stored_value {
                object.insert("seq".to_string(), json!(seq));
            }
            write_value(&conn, &store_name, &seq.to_string(), &stored_value)?;
            Ok(json!({ "ok": true, "key": seq, "value": stored_value }))
        }
        "delete" => {
            let record_key = require_key(key)?;
            conn.execute(
                "DELETE FROM molecule_store_records WHERE store_name = ?1 AND record_key = ?2",
                params![store_name, record_key],
            )
            .map_err(|err| err.to_string())?;
            Ok(json!({ "ok": true }))
        }
        _ => Err(format!("molecule_store/invalid_action: {}", action)),
    }
}
