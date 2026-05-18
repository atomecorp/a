Sharing System – Technical Specification

This document defines the complete functional and security requirements for the Sharing System. It is intended to be used directly by Copilot or any developer as a precise implementation guide, without interpretation.

⸻

1. Scope and Objectives

The Sharing System provides a unified, secure, and granular mechanism to share:
 • Atomes
 • Projects
 • User profiles

The same sharing logic, data model, and security rules apply to all entity types.

Primary objectives:
 • Fine-grained access control (down to property level)
 • Real-time collaboration when enabled
 • Maximum security at all layers
 • No implicit sharing, no accidental exposure

⸻

1. Default State (No Sharing)
 • By default, no entity is shared.
 • No visibility, no read access, no write access.
 • Any access attempt without explicit permission MUST be rejected.
 • Security is deny-by-default at every layer.

⸻

1. Share Tool (Main Entry Point)

3.1 Share Activation

The Share panel starts with:
 • Share: ON | OFF

Rules:
 • OFF → entity is fully private
 • ON → sharing configuration becomes active

⸻

3.2 Share Target

Only one target mode can be active at a time.

A. Public
 • Entity is visible to everyone
 • Appears in:
 • global directory
 • search results (e.g. find people, find atomes)

B. Targeted (Private)
 • Shared with one or more specific users
 • Invisible to everyone else

⸻

3.3 Share Type

Each share defines a synchronization mode:
 1. One-shot
 • Snapshot at time T
 • No future updates propagated
 2. Persistent
 • Share remains active
 • Updates propagate only when explicitly refreshed
 3. Real-time (Live)
 • All changes propagate instantly
 • Visual and state updates must appear live

⸻

1. Permissions Model

4.1 Global Permissions

Per share target:
 • Read
 • Write

Possible states:
 • No access
 • Read only
 • Read + write

⸻

4.2 Property-Level Permissions (Core Requirement)

Each Atome property has independent permissions.

Examples of properties:
 • color
 • position
 • width
 • text
 • sound

For each property:
 • Read allowed | denied
 • Write allowed | denied

Rules:
 • If read is denied → property is invisible
 • Invisible properties must not be:
 • rendered
 • inspected
 • queried

Example:
 • User Toto:
 • can edit color
 • cannot read text
 • cannot modify width
 • text does not exist visually for Toto

⸻

1. Selection and Application
 • Sharing can be applied to:
 • a single Atome
 • multiple selected Atomes
 • an entire Project

Workflow:
 1. User selects entities
 2. User opens Share tool
 3. User configures share panel
 4. Rules apply to entire selection atomically

⸻

1. Info Panel (Inspection Panel)

The Info panel provides full visibility of the current sharing state.

It must display:
 • Share ON/OFF state
 • Targets
 • Share type
 • Global permissions
 • Property-level permissions

The Info panel:
 • Allows editing the exact same options as the Share panel
 • Is an inspection + control panel, not a summary

⸻

1. User Panel (Profile Sharing)

The User panel controls user visibility, not Atome permissions.

7.1 User Visibility State
 • Public
 • User appears in search and directory
 • Private
 • User is invisible unless explicitly shared

7.2 Contact Information
 • Phone number is never public by default
 • Making contact info visible is an explicit opt-in
 • Visibility of contact info is independent from user visibility

⸻

1. Real-Time Synchronization

When share type = Real-time:
 • All authorized changes propagate instantly
 • No manual refresh
 • No polling-based illusion of real-time
 • Must support concurrent edits (subject to permissions)

When not real-time:
 • No live propagation

⸻

1. Security Requirements (Critical)

Security is mandatory and non-negotiable.

9.1 General Principles
 • Zero trust model
 • Deny-by-default
 • No client-side authority

⸻

9.2 Database Security
 • Permissions enforced at database level
 • Queries must be permission-aware
 • No entity may bypass permissions via crafted queries

⸻

9.3 API Security
 • Every request must:
 • authenticate the user
 • validate permissions per entity and property

⸻

9.4 Network Security
 • All communication encrypted
 • Protection against man-in-the-middle attacks
 • No sensitive data in clear text

⸻

9.5 Runtime Enforcement
 • UI must never be trusted as a security layer
 • Server / core runtime must re-validate all permissions
 • Property-level access must be enforced everywhere

⸻

1. Consistency Rules
 • Same rules everywhere
 • Same logic for all entity types
 • No duplicated permission systems
 • No implicit inheritance without explicit definition

⸻

1. Non-Goals
 • No social-network style implicit sharing
 • No heuristic permissions
 • No hidden defaults

⸻

1. Final Objective

The Sharing System must support:
 • Public discovery
 • Private collaboration
 • Professional co-editing
 • Partial and secure disclosure
 • Maximum safety with zero accidental exposure

This specification must be followed strictly.
