# ADOLE Global Search Engine

1. Purpose

The goal of the ADOLE Global Search Engine is to provide a unified, powerful, and flexible search system allowing users to explore data stored in the platform without redefining the database structure. The search engine operates on existing data and permissions.

⸻

2. Search Scope Levels

The search engine must support multiple search scopes, selectable by the user:

2.1 Personal Scope
 • Search across all content owned by the current user.
 • Includes all projects, atomes, assets, metadata, and history visible to the user.

2.2 Project Scope
 • Restrict search to the currently opened project.
 • Only objects, atomes, and metadata belonging to that project are indexed.

2.3 Atome Scope
 • Restrict search to a specific Atome (TELATOM).
 • Useful for deep inspection of complex objects with many properties and versions.

2.4 Global Public Scope
 • Search across all public entities available on the platform.
 • Includes:
 • Public users
 • Public machines
 • Public projects / atomes
 • Private users, private machines, and private content must never appear.

⸻

3. Searchable Entities

The search engine must be able to index and search the following entities:
 • Users (public profiles only)
 • Machines (public machines only)
 • Projects
 • Atomes
 • Atome properties and metadata
 • Tags

Visibility is always filtered by permissions and privacy rules.

⸻

4. Search Criteria

The search engine must support multi-criteria filtering, including:

4.1 Date-Based Filters
 • Creation date (created_at)
 • Last modification date (updated_at)
 • Support for ranges (from / to)

4.2 Tag-Based Search
 • Search by one or multiple tags
 • Tags can be attached to:
 • Users
 • Projects
 • Atomes
 • Machines
 • Support logical combinations (AND / OR)

4.3 Textual Search
 • Names
 • Titles
 • Descriptions
 • Identifiers (IDs, references)

⸻

5. Global Search Model

The search engine is designed as a single global entry point with:
 • Dynamic scope selection (user / project / atome / public)
 • Dynamic filters (dates, tags, types)
 • Permission-aware results

The same search engine logic is reused everywhere; only the scope and filters change.

⸻

6. Permissions and Privacy Rules
 • Only public users and machines are indexed globally.
 • Private entities are searchable only by their owner or authorized users.
 • Permissions are enforced at query time.
 • No result should ever leak private or unauthorized data.

⸻

7. Expected Benefits
 • Unified search experience across the entire platform
 • No duplication of search logic
 • Scales from personal search to global discovery
 • Fully compatible with offline/online synchronization
 • Ready for future extensions (AI-assisted search, semantic search, ranking models)

⸻

8. Summary

The ADOLE Global Search Engine is a permission-aware, scope-driven, tag- and date-capable search system allowing users to explore personal, project-level, atome-level, or public content through a single, consistent interface, without redefining the underlying database architecture.
