// The bottles' state machine on an in-memory central schema (bottles/mod.rs).
use super::*;

fn db() -> Connection {
    let db = Connection::open_in_memory().expect("db");
    for statement in crate::central_schema::CB_TABLES {
        db.execute_batch(statement).expect("cb tables");
    }
    db.execute_batch(
        "CREATE TABLE moderation_cases (case_id TEXT, kind TEXT, target_id TEXT, reports INTEGER, status TEXT,
         hidden_at TEXT, opened_at TEXT, updated_at TEXT, handled_by TEXT, UNIQUE(kind, target_id));
         CREATE TABLE sync_share_policies (owner_id TEXT, peer_id TEXT, policy TEXT, revoked_at TEXT, updated_at TEXT);",
    )
    .expect("neighbours");
    db
}

fn zone(range: Range, cell: &str) -> Zone {
    Zone::parse(range, cell).expect("zone")
}

fn sea_bottle(db: &Connection, id: &str, sender: &str, range: &str, cell: &str, kind: &str) {
    run(db, "INSERT INTO cb_bottles (bottle_id, sender_id, sender_handle, zone_range, zone_cell, kind, body, state, created_ms, expires_ms, updated_ms)
        VALUES (?, ?, 'cbh_x', ?, ?, ?, 'hello', 'at_sea', 0, ?, 0)", &[&id, &sender, &range, &cell, &kind, &(now_ms() + LIFE_MS)]).expect("bottle");
}

#[test]
fn the_switch_reads_off_by_default() {
    assert_eq!(BottleVideo::parse(None), BottleVideo::Off);
    assert_eq!(BottleVideo::parse(Some("yes")), BottleVideo::Off);
    assert_eq!(BottleVideo::parse(Some(" Testers ")), BottleVideo::Testers);
    assert_eq!(BottleVideo::parse(Some("all")), BottleVideo::All);
}

// Test 42: ignored, it goes back to sea; returned three times, the next ignore expires it.
#[test]
fn three_returns_then_it_expires() {
    let db = db();
    sea_bottle(&db, "b1", "ana", "world", "", "text");
    let world = zone(Range::World, "world");
    for (round, catcher) in ["ben", "cy", "dan", "eve"].iter().enumerate() {
        let caught = catch(&db, catcher, &world, false, now_ms()).expect("catch");
        assert_eq!(caught["bottle"]["id"], "b1", "round {round}");
        assert!(open(&db, catcher, "b1", now_ms()).expect("open").is_some());
        let decided = decide(&db, catcher, "b1", "ignore", now_ms()).expect("decide");
        assert_eq!(decided["state"], if round < 3 { AT_SEA } else { "expired" });
    }
    assert_eq!(
        catch(&db, "fay", &world, false, now_ms()).expect("catch")["error"],
        "cb_bottle_none"
    );
}

// Test 41: a reservation run out gives no content, and the bottle is at sea again.
#[test]
fn a_reservation_runs_out() {
    let db = db();
    sea_bottle(&db, "b1", "ana", "5", "u09tv", "text");
    let now = now_ms();
    assert_eq!(
        catch(&db, "ben", &zone(Range::Km50, "u09t"), false, now).expect("catch")["bottle"]["id"],
        "b1"
    );
    assert!(
        open(&db, "ben", "b1", now + RESERVATION_MS + 1)
            .expect("open")
            .is_none()
    );
    assert!(open(&db, "cy", "b1", now).expect("another's").is_none());
    release_expired(&db, now + RESERVATION_MS + 1).expect("release");
    assert_eq!(
        catch(
            &db,
            "cy",
            &zone(Range::Km500, "u09"),
            false,
            now + RESERVATION_MS + 2
        )
        .expect("catch")["bottle"]["id"],
        "b1"
    );
    // Opened and left undecided: back to the sea once its reservation ends.
    let later = now + RESERVATION_MS + 2;
    assert!(open(&db, "cy", "b1", later).expect("open").is_some());
    release_expired(&db, later + RESERVATION_MS + 1).expect("release opened");
    assert_eq!(
        catch(
            &db,
            "dan",
            &zone(Range::Km5, "u09tv"),
            false,
            later + RESERVATION_MS + 2
        )
        .expect("catch")["bottle"]["id"],
        "b1"
    );
}

// Test 40 and 10: never one's own, never one seen, never from a neighbouring 5 km cell; a
// video only where the switch allows it.
#[test]
fn never_one_s_own_nor_one_seen_nor_a_neighbour_s() {
    let db = db();
    sea_bottle(&db, "own", "ben", "5", "u09tv", "text");
    sea_bottle(&db, "next", "ana", "5", "u09tw", "text");
    sea_bottle(&db, "film", "ana", "5", "u09tv", "video");
    let here = zone(Range::Km5, "u09tv");
    assert_eq!(
        catch(&db, "ben", &here, false, now_ms()).expect("catch")["error"],
        "cb_bottle_none"
    );
    let caught = catch(&db, "ben", &here, true, now_ms()).expect("catch");
    assert_eq!(caught["bottle"]["id"], "film");
    decide(&db, "ben", "film", "ignore", now_ms()).expect("not opened");
    open(&db, "ben", "film", now_ms()).expect("open");
    decide(&db, "ben", "film", "ignore", now_ms()).expect("ignore");
    assert_eq!(
        catch(&db, "ben", &here, true, now_ms()).expect("seen")["error"],
        "cb_bottle_none"
    );
}

#[test]
fn thirteen_catches_a_day() {
    let db = db();
    let world = zone(Range::World, "world");
    for index in 0..=CATCHES_PER_DAY {
        sea_bottle(&db, &format!("b{index}"), "ana", "world", "", "text");
    }
    for _ in 0..CATCHES_PER_DAY {
        let caught = catch(&db, "ben", &world, false, now_ms()).expect("catch");
        assert_eq!(caught["ok"], true);
    }
    assert_eq!(
        catch(&db, "ben", &world, false, now_ms()).expect("catch")["error"],
        "cb_bottle_catch_quota"
    );
}
