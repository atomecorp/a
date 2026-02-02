# Atome Website Publishing

## Static + Live (PWA + Realtime) Specification

## 0. Goal

Provide a way to publish an Atome project as a full website accessible via a clean URL, with **minimal static hosting** while fully benefiting from the **atome.one backend** (permissions, versioning, sync, media, realtime).

Core principles:

* The published site is a **thin client** (viewer runtime) + configuration.
* The **single source of truth** is the Atome project hosted on **atome.one**.
* **PWA support is mandatory.**
* **Realtime synchronization is mandatory.**
* Offline capability and live updates are structural features, not optional plugins.

---

## 1. Concepts & vocabulary

### 1.1 Project type

A project can be declared as a website:

* `project.type = "website"`

A website project is a normal Atome project with additional conventions:

* pages
* routes
* navigation
* SEO metadata
* public rendering rules

---

### 1.2 Runtime modes

Runtime has explicit execution modes:

* `runtime.mode = "editor"` (default on atome.one)
* `runtime.mode = "site"` (public rendering)

Site mode constraints:

* no editor UI
* no creation tools
* no timeline tools
* restricted interactions based on permissions

---

### 1.3 Publish modes

Publishing binds a project to a public URL.

Two delivery forms:

* **Atome-hosted URL**: `https://atome.one/site/<site_id>`
* **External static host**: `https://mydomain.com/`

Export type:

* `export.type = "site_proxy"` (static shell + live data)

No HTML snapshot rendering is part of this specification.

---

## 2. Architecture (Static + Live + Realtime)

### 2.1 Components

* **Static host**: serves immutable files (HTML, JS, CSS, manifest, service worker, assets)
* **Atome Site Runtime**: viewer runtime in site mode
* **atome.one API**: project state, media, permissions, versions
* **WebSocket channel**: mandatory realtime updates

---

### 2.2 Data ownership

* Static host owns only:

  * runtime bundle
  * configuration
  * service worker
* atome.one owns:

  * project graph
  * property versions
  * permissions
  * media storage
  * site configuration

---

## 3. Publishing workflow (UX)

### 3.1 Create website project

User creates a project:

* name
* template (optional UX choice)
* `type = website`

---

### 3.2 Configure website

User defines:

* pages and routes
* homepage
* navigation structure
* site metadata (title, description, favicon)
* public permissions

---

### 3.3 Publish

User clicks **Publish**.

User chooses:

1. **Atome-hosted**
2. **External static export (ZIP)**

Publishing creates a **Site record**:

* stable `site_id`
* bound to `project_id`
* public settings
* cache and sync policy

---

### 3.4 Update

User edits the project on atome.one (editor mode).

Result:

* site updates in realtime (WebSocket)
* site updates on reconnect (offline → online)

No redeploy is required unless the runtime itself changes.

---

## 4. Static export format (site_proxy)

Export output:

```
/export/site/
  index.html
  app.js
  runtime.min.js
  manifest.json
  sw.js
  assets/
    icons/
    splash/
```

---

### 4.1 index.html

Responsibilities:

* load runtime
* boot `app.js`

---

### 4.2 app.js

Contains:

* `site_id`
* server URL
* rendering mode
* sync strategy

Example:

```
server = "https://atome.one"
mode = "site"
site_id = "site_abc123"
```

---

### 4.3 Service Worker (mandatory PWA)

Responsibilities:

* cache runtime and assets
* cache project state
* offline rendering
* background update

Strategy (mandatory):

* runtime/assets: **cache-first**
* project state: **network-first with cache fallback**
* media: **stale-while-revalidate**

---

## 5. Editing model

### 5.1 Principle

The static site is never edited directly.

You edit the **Atome website project** on atome.one.

The site renders the updated state automatically.

---

### 5.2 Editable elements

Everything represented as Atome properties:

* content (text, images, video)
* layout (sections, components, pages)
* style (colors, fonts, sizes)
* behavior (animations, links)
* routing (pages)

---

### 5.3 Non-editable without redeploy

* runtime bundle
* service worker logic
* manifest configuration

Mitigation:

* branding and icons should be loaded from atome.one

---

## 6. API contract (mandatory)

### 6.1 Resolve site

`GET /api/site/:site_id`
Returns:

* `project_id`
* route map
* public settings
* runtime constraints
* current version pointer

---

### 6.2 Fetch initial state

`GET /api/project/:project_id/state?mode=site`
Returns:

* minimal graph for rendering
* pages
* required media references

---

### 6.3 Realtime updates (mandatory)

`WS /ws/site/:site_id`
Events:

* `patch` (property-level diffs)
* `invalidate` (force reload)

---

### 6.4 Media

`GET /media/:id`
Public or signed URLs.

---

## 7. Permissions model

On Site record:

* `public_read: true`
* `public_write: false`

Per-property ACL still applies.

---

## 8. Routing model

### 8.1 Client-side routing

Static host always serves `index.html`.

Runtime resolves route using:

* site route map

---

### 8.2 404

If route not found:

* render project-defined 404 page

---

## 9. Versioning & cache invalidation

### 9.1 Version pointer

Each state response includes:

* `state_version`

---

### 9.2 Cache rules

* If `state_version` changes → refresh state
* PWA stores:

  * `last_state_version`
  * cached project state

---

## 10. Mandatory feature set

* website project type
* site runtime mode
* static export proxy
* PWA (service worker + manifest)
* realtime WebSocket updates
* routing
* permissions
* versioning
* cache + offline support

---

## 11. Open decisions

* site_id vs direct project_id exposure
* storage of routing map (site vs project)
* handling of private pages
* custom domains (DNS + TLS + binding)

---

## 12. Summary

* A published site is a **proxy client** of an Atome project.
* The project hosted on **atome.one** is the only source of truth.
* PWA and realtime are structural layers.
* Editing always happens on atome.one.
* Static hosting is used only to distribute the runtime shell.
