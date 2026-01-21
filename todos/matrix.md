# REV – Project Matrix Feature

## 1. Overview

This document describes the **Project Matrix** feature in **REV**. This feature is not a standalone panel but a **core project‑management functionality** integrated directly into the REV workspace.

Each user owns at least one default project created automatically at account creation and may create and manage multiple projects over time.

The Project Matrix provides a fluid way to **navigate, visualize, filter, and switch between projects** using animated zoom transitions while preserving global context and tools.

---

## 2. Core Concepts

### 2.1 Project Lifecycle

* A default project is automatically created when a user account is created.
* A user can create, open, close, and manage multiple projects.
* At any given time, **one project is active and displayed full‑screen**.

---

## 3. Matrix Trigger & Entry Point

### 3.0 Tool Identity & Activation

* The Project Matrix feature is activated exclusively through a **toolbar tool**.
* The tool identifier is:

  * `AI_Intuition_Matrix`
  * `Intuition_Matrix`
* Clicking this tool in the standard REV toolbar **explicitly activates Matrix mode**.
* This action is the single source of truth for entering the Project Matrix state.

### 3.1 Matrix Icon

* A dedicated **Matrix icon** is located in the **top toolbar**.
* This icon is always visible and accessible.

### 3.2 Behavior

* Clicking the Matrix icon while a project is active:

  * Triggers a **zoom‑out animation**.
  * The current project visually shrinks and reintegrates into the Project Matrix.
* Clicking the Matrix icon again while in Matrix view:

  * Keeps the Matrix view visible (no toggle back unless a project is selected).

---

## 4. Project Matrix View

### 4.1 Layout

* The Project Matrix is a **horizontal, scrollable grid** of square project thumbnails.
* Each square represents a project.
* The previously active project appears minimized within the matrix.

### 4.2 Navigation

* Horizontal scrolling allows navigation through projects.
* Projects are visually lightweight previews (not fully loaded).

---

## 5. Project Selection & Zoom

### 5.1 Selecting a Project

* Clicking on a project tile in the matrix:

  * Triggers a **zoom‑in animation**.
  * The selected project expands smoothly to occupy the full workspace.
  * The selected project becomes the new active project.

### 5.2 Visual Continuity

* Zoom animations must preserve spatial continuity.
* The transition should feel reversible and non‑destructive.

---

## 6. Toolbar & Filtering (Critical Requirement)

### 6.1 Persistent Toolbar

* The **standard REV toolbar (2F toolbar)** remains **always visible**:

  * In full‑screen project view.
  * During zoom‑in / zoom‑out transitions.
  * In Matrix view.

### 6.2 Filtering & Sorting

* All filtering and sorting actions are performed **exclusively via the toolbar**.
* No floating or contextual filter panels are allowed.

Supported actions include:

* Sort projects by date, name, or custom criteria.
* Filter projects by metadata or status.

### 6.3 Finder Integration

* The **Finder tool** in the toolbar is context‑aware.
* When the current context is **Project Matrix**:

  * Finder searches and filters **projects only**.
* Filtering updates the Matrix view in real time.

---

## 7. Context Awareness

* Toolbar tools adapt to the current context:

  * Project view → tools affect the active project.
  * Matrix view → tools affect the project list.
* Context switching must be automatic and explicit.

---

## 8. Performance & Memory Management

### 8.1 Lazy Loading

* Projects must be **lazy‑loaded**.
* Only minimal metadata and visual previews are loaded in Matrix view.
* Full project data is loaded **only when the project becomes active**.

### 8.2 Constraints

* It must be possible to manage a large number of projects.
* The system must prevent full memory loading of all projects simultaneously.

---

## 9. Technical Expectations

* Animations must be GPU‑friendly and interruptible.
* State transitions must be deterministic and reversible.
* No project state must be lost during zoom transitions.

---

## 10. UX Goals

* Zero modal dialogs.
* No hard context breaks.
* Seamless navigation between projects.
* Constant visual and cognitive continuity.

---

## 11. Summary

The Project Matrix is a **core navigational layer** of REV, enabling users to manage multiple projects through animated zoom transitions, persistent tooling, and context‑aware filtering — without ever leaving the main workspace.
