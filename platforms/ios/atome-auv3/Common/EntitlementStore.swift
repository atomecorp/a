//
//  EntitlementStore.swift
//  atome
//
//  Stores purchase entitlements in shared App Group so App + AUv3 extension stay in sync.
//
import Foundation

final class EntitlementStore {
    static let shared = EntitlementStore()
    private init() {}

    // Update this if App Group id changes
    private let appGroupIds = ["group.atome.one", "group.com.atomecorp.atome"]
    private let keyPrefix = "atome.entitlement." // namespaced

    private func userDefaults() -> UserDefaults {
        for id in appGroupIds { if let ud = UserDefaults(suiteName: id) { return ud } }
        return UserDefaults.standard
    }

    func setOwned(_ owned: Bool, productId: String) {
        userDefaults().set(owned, forKey: keyPrefix + productId)
    }
    func isOwned(_ productId: String) -> Bool {
        return userDefaults().bool(forKey: keyPrefix + productId)
    }
}
