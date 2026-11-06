// The central database (Fastify's `SQLITE_PATH`, database/driver.js): the
// registries telling which vault holds an atome or a stream, and the shares.
// Fastify keeps writing its other tables there; both wait on each other's
// writes as better-sqlite3 does (5 s).
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags, Params, Row};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone)]
pub struct Central {
    db: Arc<Mutex<Connection>>,
}

// A row as Fastify's driver hands it: every column by name.
pub fn row_json(row: &Row<'_>) -> rusqlite::Result<JsonValue> {
    let statement = row.as_ref();
    let mut object = JsonMap::new();
    for index in 0..statement.column_count() {
        let value = match row.get_ref(index)? {
            ValueRef::Null => JsonValue::Null,
            ValueRef::Integer(number) => JsonValue::from(number),
            // better-sqlite3 hands JavaScript a number: an integral REAL writes as an integer.
            ValueRef::Real(number) => super::js::number_json(number),
            ValueRef::Text(text) => JsonValue::from(String::from_utf8_lossy(text).into_owned()),
            ValueRef::Blob(_) => JsonValue::Null,
        };
        object.insert(statement.column_name(index)?.to_string(), value);
    }
    Ok(JsonValue::Object(object))
}

impl Central {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(directory) = path.parent() {
            std::fs::create_dir_all(directory)
                .map_err(|e| format!("central_database_open_failed:{e}"))?;
        }
        let db = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
        )
        .map_err(|e| format!("central_database_open_failed:{e}"))?;
        db.busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| e.to_string())?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
        })
    }

    // A database call off the async threads (a write may wait on Fastify's).
    async fn call<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
    ) -> Result<T, String> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || work(&db.lock().expect("central database")))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
    }

    /// A unit of work in one immediate transaction (Fastify's `withTransaction`),
    /// rolled back when it fails.
    pub async fn transaction<T: Send + 'static>(
        &self,
        work: impl FnOnce(&rusqlite::Transaction<'_>) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            let mut db = db.lock().expect("central database");
            let transaction = db
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .map_err(|e| e.to_string())?;
            let outcome = work(&transaction)?;
            transaction.commit().map_err(|e| e.to_string())?;
            Ok(outcome)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// A unit of work that keeps what it wrote whether it succeeds or not, as Fastify's
    /// statements outside `withTransaction` do; its own `withTransaction` blocks are
    /// `atomic`.
    pub async fn committed<T: Send + 'static>(
        &self,
        work: impl FnOnce(&rusqlite::Transaction<'_>) -> Result<T, String> + Send + 'static,
    ) -> Result<Result<T, String>, String> {
        self.transaction(move |db| Ok(work(db))).await
    }

    pub async fn run(&self, sql: &'static str, values: Vec<JsonValue>) -> Result<(), String> {
        self.call(move |db| {
            db.prepare_cached(sql)?.execute(params(&values))?;
            Ok(())
        })
        .await
    }

    pub async fn get(
        &self,
        sql: &'static str,
        values: Vec<JsonValue>,
    ) -> Result<Option<JsonValue>, String> {
        self.call(move |db| {
            let mut statement = db.prepare_cached(sql)?;
            let mut rows = statement.query(params(&values))?;
            rows.next()?.map(row_json).transpose()
        })
        .await
    }

    pub async fn all(&self, sql: String, values: Vec<JsonValue>) -> Result<Vec<JsonValue>, String> {
        self.call(move |db| {
            let mut statement = db.prepare_cached(&sql)?;
            let rows = statement.query_map(params(&values), row_json)?;
            rows.collect()
        })
        .await
    }
}

/// `withTransaction` nested in a `committed` unit: a savepoint, rolled back when it fails.
pub fn atomic<T>(
    db: &rusqlite::Connection,
    work: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    db.execute_batch("SAVEPOINT atomic")
        .map_err(|e| e.to_string())?;
    match work(db) {
        Ok(outcome) => db
            .execute_batch("RELEASE atomic")
            .map(|()| outcome)
            .map_err(|e| e.to_string()),
        Err(error) => db
            .execute_batch("ROLLBACK TO atomic; RELEASE atomic")
            .map_err(|e| e.to_string())
            .and(Err(error)),
    }
}

/// A JSON value bound as Fastify binds it: text, numbers, a flag as 0 or 1, else null.
pub fn sql_value(value: &JsonValue) -> rusqlite::types::Value {
    match value {
        JsonValue::String(text) => rusqlite::types::Value::Text(text.clone()),
        JsonValue::Number(number) => number
            .as_i64()
            .map(rusqlite::types::Value::Integer)
            .unwrap_or_else(|| rusqlite::types::Value::Real(number.as_f64().unwrap_or(0.0))),
        JsonValue::Bool(flag) => rusqlite::types::Value::Integer(i64::from(*flag)),
        _ => rusqlite::types::Value::Null,
    }
}

fn params(values: &[JsonValue]) -> impl Params + '_ {
    rusqlite::params_from_iter(values.iter().map(sql_value))
}
