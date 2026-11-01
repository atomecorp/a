import Foundation
import SQLite3

// ADOLE type gate on the Swift commit path — the same rules and error codes as the Fastify owner
// `atome/src/shared/atome_type_gate.js` (called by `database/adole_event_log.js`) and as Axum
// (`local_atome_type_gate.rs`): a declared type must be known (`atome_type_unknown`), and a property must
// be declared by the atome's type, the one the event declares or else the stored one
// (`atome_property_unknown`). The types come from `eVe/registry/generated/atome_types.json`, generated
// from the JS owner (`npm run registry:build`) and packaged into the runtime bundle
// (`package_ios_runtime.mjs`), never from a list kept here. A bundle without it refuses every commit.
extension AiSRuntime {
    private struct AtomeTypeCatalog {
        let typeUnknown: String
        let propertyUnknown: String
        let envelope: Set<String>
        let ungatedKinds: Set<String>
        // A type's declared properties; nil when the type accepts any property.
        let types: [String: Set<String>?]
    }

    private static let atomeTypeCatalog: Result<AtomeTypeCatalog, Error> = Result { try loadAtomeTypeCatalog() }

    private static func loadAtomeTypeCatalog() throws -> AtomeTypeCatalog {
        guard let root = Bundle.main.resourceURL else { throw AiSError("atome_types_json_missing") }
        let url = root.appendingPathComponent("atome_runtime/eVe/registry/generated/atome_types.json")
        guard let data = try? Data(contentsOf: url) else { throw AiSError("atome_types_json_missing") }
        guard let document = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let errors = document["errors"] as? [String: Any],
              let typeUnknown = errors["type_unknown"] as? String,
              let propertyUnknown = errors["property_unknown"] as? String,
              let types = document["types"] as? [String: [String: Any]] else { throw AiSError("atome_types_json_invalid") }
        return AtomeTypeCatalog(
            typeUnknown: typeUnknown,
            propertyUnknown: propertyUnknown,
            envelope: Set(document["envelope_keys"] as? [String] ?? []),
            ungatedKinds: Set(document["ungated_kinds"] as? [String] ?? []),
            types: types.mapValues { entry -> Set<String>? in
                (entry["allow_unknown_properties"] as? Bool) == false ? Set(entry["properties"] as? [String] ?? []) : nil
            }
        )
    }

    // Refuses a normalized event whose declared type, or one of whose properties, is undeclared,
    // before it is stored. `batchTypes` carries the types declared by the earlier events of a batch.
    static func assertKnownAtomeWrite(_ event: [String: Any], db: OpaquePointer?, batchTypes: inout [String: String]) throws {
        let kind = stringValue(event["kind"]).lowercased()
        guard let patch = extractEventPatch(kind: kind, payload: event["payload"], ts: "") else { return }
        try assertKnownAtomePatch(patch, atomeId: stringValue(event["atome_id"]), kind: kind, db: db, batchTypes: &batchTypes)
    }

    // The same refusal for a direct write outside the event log (the `atome` create and alter
    // messages): `declaredType` is the type the write stores, nil keeps the stored one.
    static func assertKnownAtomeDirectWrite(atomeId: String, declaredType: String?, properties: [String: Any], db: OpaquePointer?) throws {
        var patch = properties
        if let declaredType { patch["type"] = declaredType }
        var batchTypes = [String: String]()
        try assertKnownAtomePatch(patch, atomeId: atomeId, kind: "set", db: db, batchTypes: &batchTypes)
    }

    private static func assertKnownAtomePatch(_ patch: [String: Any], atomeId: String, kind: String, db: OpaquePointer?, batchTypes: inout [String: String]) throws {
        let catalog = try atomeTypeCatalog.get()
        let declared = (patch["type"] as? String) ?? (patch["atome_type"] as? String)
        if let declared {
            guard catalog.types[declared] != nil else { throw AiSError(catalog.typeUnknown) }
            batchTypes[atomeId] = declared
        }
        if catalog.ungatedKinds.contains(kind) { return }
        let resolved = try declared ?? batchTypes[atomeId] ?? findAnyAtomeMeta(db, atomeId: atomeId)?.atomeType
        guard let resolved, let entry = catalog.types[resolved], let properties = entry else { return }
        if patch.keys.contains(where: { !catalog.envelope.contains($0) && !properties.contains($0) }) {
            throw AiSError(catalog.propertyUnknown)
        }
    }
}
