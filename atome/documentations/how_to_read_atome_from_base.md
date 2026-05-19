# How to Read an Atome from the Base (Tauri/Fastify)

This note explains the safe, reliable way to read atomes and their data, why some APIs return partial data, and the common pitfalls that lead to missing fields (like `first_name`).

## 1) Know the Source You Are Reading

There are multiple sources that can return atomes, and they do **not** expose the same shape:

- **Directory or summary lists** (e.g., `auth.list().directory`)
  - Built for discovery and speed.
  - Typically only contain `username`, `phone`, `visibility`.
  - **Do not assume** profile fields (`first_name`, `eve_profile`, etc.) are present.

- **Atome lists** (e.g., `AdoleAPI.atomes.list` or `listStateCurrent`)
  - Better than directory lists, but still may be partial depending on backend settings.

- **Atome get / state current** (e.g., `getStateCurrent(atomeId)` or `AdoleAPI.atomes.get(atomeId)`)
  - This is the **authoritative read** for a single atome.
  - Use it when you need the full profile or all particles/properties.

## 2) Best Practice: Two-Phase Read

When you need a list + rich fields:

1. **Phase 1 (Fast list)**: Use directory/list APIs to get IDs + minimal fields.
2. **Phase 2 (Enrich)**: For items that need richer fields, fetch each atome with:
   - `getStateCurrent(id)` (preferred in UI tools)
   - fallback: `AdoleAPI.atomes.get(id)`

This prevents UI from blocking on expensive full reads, and guarantees completeness for the few items that need it.

## 3) Where Fields Live (and Why They Appear Missing)

An atome can store data in multiple places. Always check them in order:

- `record.properties` (common in state current)
- `record.data.properties`
- `record.data.particles`
- `record.particles`

For user profiles:

- **Profile blob**: `eve_profile`
- Direct particles: `first_name`, `name`, `username`, `phone`

If you only read `record.properties`, you can miss `eve_profile` when it is stored in `particles`. Always merge or check both.

## 4) Recommended Access Pattern

When normalizing a user atome:

- Try to resolve properties from **both** `particles` and `properties`.
- If `eve_profile` is a JSON string, parse it.
- If fields are `particle objects` (e.g., `{ value: "Jean" }`), unwrap `value`.

Example pseudo-order for `first_name`:

```
properties.first_name
properties.firstname
properties.firstName
profile.first_name
profile.firstname
profile.firstName
record.first_name
record.firstname
record.firstName
```

## 5) Pitfalls to Avoid

- **Using directory entries as if they were full atomes**
  - They are partial; they do not include `first_name` or `eve_profile`.

- **Reading only `properties`**
  - Many atomes store `eve_profile` under `particles`.

- **Assuming `type` is correct**
  - Some backends return `type: "atome"` while `properties.atome_type` or `properties.type` is `"user"`.
  - Use `properties.atome_type` or `properties.type` if `type` is missing or generic.

- **Ignoring JSON string particles**
  - `eve_profile` is often stored as a JSON string; you must parse it.

## 6) Quick Debug Checklist

If a field is missing in UI:

1. Verify whether you’re reading from directory or real atome.
2. Call `getStateCurrent(id)` and inspect:
   - `properties`
   - `particles`
   - `eve_profile`
3. Confirm the field exists in the full atome.
4. Update your normalization logic to read both `properties` and `particles`.

## 7) Summary

- Use **directory/list APIs** for fast IDs, not for full data.
- Use **getStateCurrent / atomes.get** for complete profiles.
- Merge **particles + properties** when normalizing an atome.
- Parse `eve_profile` if it is JSON.

This avoids the classic issue where `name` and `phone` show up, but `first_name` is missing.
