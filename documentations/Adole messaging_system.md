# Specifications: ADOLE Messaging System

## 1. General Objective

Design and implement a messaging system based on ADOLE that combines:

* real-time notifications,
* instant messaging behavior,
* and email-like persistence and history.

No message must ever be lost. Messages are always stored, regardless of user presence.

---

## 2. Core Principles

* **Persistent by design**: every message is stored in the database in all cases.
* **Hybrid behavior**: real-time when possible, asynchronous when necessary.
* **User-controlled relationships**: users decide who can contact them.
* **Clear message states**: displayed, read, unread, archived, deleted.

---

## 3. Messaging Workflow

### 3.1 Sending a Message

* User A sends a message to User B using a phone number or an existing contact.
* User A must have at least the phone number of User B.

### 3.2 Message Storage (Mandatory)

* **All messages are systematically stored in the ADOLE database**, even if:

  * User B is online,
  * the message is instantly displayed on screen,
  * the notification is acknowledged.

A message is never transient. Notifications do not replace persistence.

### 3.3 Real-Time Notification

* If User B is online:

  * A visual and optional sound notification is displayed immediately.
  * The message content is shown directly in the notification.
* The system records:

  * that the message was delivered,
  * that it was displayed on screen (if applicable).

### 3.4 Offline Behavior

* If User B is offline:

  * The message is stored as **unread**.
  * No information is lost.
* When User B reconnects:

  * All unread messages are presented in the inbox.

---

## 4. Message States

Each message must support the following states:

* **Stored** (default, always true)
* **Displayed** (shown via notification)
* **Unread**
* **Read**
* **Archived**
* **Deleted**

State transitions must be fully traceable.

---

## 5. Inbox Structure

Each user has a mailbox composed of:

* **Unread messages**
* **Read messages (history)**
* **Archived messages**
* **Deleted messages** (optional retention)

Unread messages are always clearly distinguishable.

---

## 6. Contact & Connection Requests

### 6.1 Known Contacts

* If User A is already in User B’s contact list:

  * Messages are delivered directly following the standard workflow.

### 6.2 Unknown Contacts (Connection Request)

If User A is **not** present in User B’s address book:

* The message is converted into a **connection request**.
* User B receives a specific notification:

  * “User A wants to contact you.”
  * The reason or introductory message is displayed.
* User B can:

  * Accept the request → messaging becomes active.
  * Refuse the request → no messaging allowed.

Connection requests are stored and visible until a decision is made.

---

## 7. Technical Notes

* Notifications are only a user interface layer.
* The database is the single source of truth.
* Message persistence is guaranteed regardless of network state.
* Synchronization occurs automatically when a user reconnects.

---

## 8. Expected Benefits

* Zero message loss.
* Seamless mix of instant messaging and email-like reliability.
* Full traceability of message lifecycle.
* Strong user control over incoming communications.

---

This specification defines a robust, persistent, and user-centric messaging system fully aligned with the ADOLE philosophy.
