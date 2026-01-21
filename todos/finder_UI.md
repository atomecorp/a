# Structured Search Panel – Technical Specification

## Overview

This document describes the implementation of a **structured search panel**.
The panel must be consistent with existing UI patterns already used in:

* `src/application/eVe/tools/user`
* `src/application/eVe/tools/infos.js`

The goal is to provide a powerful, extensible, and coherent search experience across Atome / eVe.

---

## 1. Search Input (Top Section)

At the top of the panel, a **text input field** is displayed.

### Characteristics

* Includes a **magnifying-glass icon** (search indicator)
* Accepts free-text input
* Acts as the **primary query source**
* The entered value is reused by default filters further down the panel

---

## 2. Search Scope Selection

Below the search input, a horizontal row allows the user to choose **what to search for**.

### Available Search Scopes (5 buttons)

* **Store** – search in the shop / marketplace
* **People** – search for users or persons
* **Internet** – external web search
* **Place** – search for locations
* **Local** – search locally (projects, Atomes, files, etc.)

### Behavior

* Only **one scope** can be active at a time
* The selected scope determines the data source and search strategy

---

## 3. Result Sorting (Primary Filters)

A second horizontal row allows **sorting and filtering of results**.

### Sorting Options (5 choices)

* **Creation Date**
* **Modification Date**
* **Type**
* **Alphanumeric** (alphabetical order)
* **Size**

### Behavior

* Only **one sorting criterion** can be active
* Sorting affects the result list immediately

---

## 4. Advanced Filters (Accordion)

An **accordion section** provides advanced and extensible filtering capabilities.

### 4.1 Default Filter – Name

When the accordion is opened:

* A **Name filter** is present by default
* The associated input field is **automatically filled** with the value from the main search input

This ensures consistency between the global search and detailed filtering.

---

### 4.2 Additional Filters ("+" Button)

Inside the accordion, **below the Name filter**, a **"+" button** allows adding new filters.

Each added filter row contains **three fields**:

#### 1. Property Selector

A dropdown allowing selection of **any Atome property**, for example:

* `id`
* `width`
* `height`
* `color`
* `position`
* any other available property

This selector is **dynamic** and reflects the available Atome properties.

---

#### 2. Condition Selector

Defines **how the selected property is evaluated**.

Available conditions:

* starts with
* equals
* different from
* greater than
* greater than or equal to
* less than
* less than or equal to
* between

---

#### 3. Value Input

* For most conditions, a **single input field** is displayed

  * Example: `= 30`, `> 60`, `= "toto"`

* **Special case – `between`**

  * Displays **two input fields**
  * Defines a minimum and maximum value
  * Example: `between 30 and 60`

---

### Filter Combination Rules

* Multiple filters can be added
* All active filters are **combined** to refine the result set

---

## 5. Result Order Direction

Below the filters, a row allows changing the **order direction of results**.

### Columns (3)

* **Name** (alphabetical)
* **Date**
* **Atome Type**

### Behavior

* Each column allows toggling between:

  * **Ascending**
  * **Descending**

---

## 6. Results List

At the bottom of the panel, a **dynamic results list** is displayed.

### Columns (3)

* **Name**
* **Date**
* **Type**

### Behavior

The list updates dynamically according to:

* search input value
* selected search scope
* sorting option
* advanced filters
* order direction

---

## Notes

* UI must remain consistent with existing eVe tool panels
* Architecture must allow future extension (new scopes, properties, conditions)
* Filters and sorting must be reactive and performant

---

## UI–Finder Mapping Rules (Clarifications)

### Scope Mapping

UI search scopes represent functional domains and are mapped internally to Finder entities and permission scopes:

* **Store** → `entity: tool` | `scope: public`
* **People** → `entity: user` | `scope: public` or `project`
* **Place** → `entity: place` | `scope: public`
* **Local** → `entity: atome` | `scope: project` (default) or `personal`
* **Internet** → external search provider (bypasses Finder)

---

### Text Search vs Name Filter

The main search input performs a **free-text, fuzzy, ranked search**.
The default **Name** filter performs a **strict property-based filter** on the name field.
Both can be combined.

---

### Filter Logic

All filters added through the UI are combined using a logical **AND**.
Logical operators **OR** and **NOT** are not exposed in the UI and are reserved for API or AI-based queries.

---

### Sorting Rules

The UI allows only **one active sorting criterion** at a time.
Multi-column sorting is not supported in the UI.

---

### Pagination

Results are loaded incrementally using pagination.
Pagination details (limit, cursor) are handled internally and are not exposed in the UI.

---

### Permissions

All results displayed in the UI are **permission-filtered**.
The UI never displays items the user is not authorized to access.

---

### Entity Resolution

Each search scope targets **one primary entity type** (Atome, Tool, User, etc.).
The UI never mixes multiple entity types in a single result list.

---

### AI Search

AI-assisted search is **not part of the UI**.
When enabled, it generates structured Finder queries using the same underlying query model.
