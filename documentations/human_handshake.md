# Atome / ADOLE

## Human Contact Handshake (keyword + symbol)

### Complete Conceptual Specification

---

## 1. Objective

Enable two people who meet **in the real world** to connect reliably, without using:

* phone numbers
* globally unique usernames
* public directories

While guaranteeing:

* zero false positives
* tolerance to human errors
* minimal cognitive load
* proper operation in dense environments (festivals, conferences, concerts)

---

## 2. Foundational Principle

> **A real-world encounter must produce an immediate and recognizable digital trace.**

The system never guesses a relationship.
It **digitally reconstructs a real human act**.

---

## 3. The Handshake Pillars

### 3.1 Human Keyword (text)

* A word or short phrase freely chosen together
* Simple, natural, easy to remember
* Not globally unique
* May be approximate or misspelled
* **Never creates a relationship on its own**

The keyword is used to **trigger an intention**, not to identify a person.

---

### 3.2 Shared Graphic Symbol (visual key)

* Automatically generated upon the first keyword entry
* Simple visual (shapes / colors)
* Must be **seen by both people at the moment of the encounter**
* Serves as **shared visual proof**

The symbol is the digital equivalent of:

* recognizing a face
* seeing a business card
* sharing a distinctive sign

---

### 3.3 Connection Intention

* Created when a user enters a keyword
* Temporary
* Non-destructive
* Can be: matched, rejected, or expired

An intention **is never a connection**.

---

### 3.4 Human Confirmation

No relationship is created without:

* visual recognition of the symbol
* explicit confirmation

The system **never creates a connection automatically**.

---

## 4. Normal Flow (real-world case)

1. Two people meet
2. They choose a keyword or short phrase
3. At least one person enters the keyword immediately
4. A symbol is displayed
5. The symbol is shown to the other person
6. Later (or immediately), the second person enters the keyword
7. The system proposes a match **with the symbol**
8. Human confirmation
9. Relationship created

---

## 5. Time Handling

* No simultaneous entry required
* Delayed matching is allowed
* Limited time window
* Intentions automatically expire

Time is a core part of the security model.

---

## 6. Dense Environments

### Problem

* Obvious keywords (e.g. *hellfest*)
* Large crowds

### Solution

* The keyword alone is never sufficient
* The symbol provides distinction
* Human confirmation resolves ambiguity

Result: no possible cross-matching between different pairs.

---

## 7. Human Error Handling

### Wrong symbol selection

* No irreversible effect
* Attempt is rejected
* Intention remains valid

### Finger slip / memory lapse

* No state is consumed
* New attempt is always possible

### Missing confirmation

* No relationship is created
* Intention naturally expires

---

## 8. Conceptual Intention States

* **Pending**: intention created
* **Candidate**: potential match detected
* **Confirmed**: relationship created (final)
* **Rejected**: attempt refused
* **Expired**: intention timed out

Only **Confirmed** is irreversible.

---

## 9. Misspellings and Phrases

### Principle

> **Text is interpreted, never compared verbatim.**

### Invisible system processing

* Aggressive normalization
* Removal of weak words
* Extraction of meaningful tokens
* Limited tolerance for simple typos

Even with approximate text:

* no match without symbol recognition

---

## 10. UX in Case of Ambiguity

The system never says:

* “Invalid keyword”
* “Multiple users found”

It says:

> “A possible match was found. Is this the symbol you saw?”

With a maximum of 1 to 3 symbols.

---

## 11. Deliberate System Refusals

* Automatic matching
* Relationships without a real shared act
* Phone numbers as human identifiers
* Enforced global unique usernames
* Mandatory public directories

These are **design decisions**, not technical limitations.

---

## 12. Key Advantages

### UX

* Natural
* Highly memorable
* Error-tolerant

### Security

* Impossible without a real encounter
* Strong resistance to collisions
* Privacy-respecting

### Atome / ADOLE DNA

* Decentralized
* Contextual
* Granular
* Aligned with real-world behavior

---

## 13. Final Rules

1. The keyword triggers, it does not identify
2. The symbol distinguishes
3. The human confirms
4. No human error is irreversible
5. No relationship without a shared real-world act

---

## Conclusion

This protocol does not attempt to identify people.
It **digitally reenacts what humans already do naturally**: recognize each other, confirm, then connect.

It is reliable, elegant, and durable.
