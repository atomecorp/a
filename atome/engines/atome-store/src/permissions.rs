//! The permissions table: the owner of an atome, its grants, their inheritance
//! from the parent, and the per-principal checks.
use super::*;

pub fn can_read(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    crate::security::can_read(db, atome_id, principal_id, None)
}

pub fn can_write(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    crate::security::can_write(db, atome_id, principal_id, None)
}

pub fn can_delete(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    crate::security::can_delete(db, atome_id, principal_id, None)
}

pub fn can_create(db: &Connection, atome_id: &str, principal_id: &str) -> bool {
    crate::security::can_create(db, atome_id, principal_id)
}
