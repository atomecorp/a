//
//  PurchaseBridge.swift
//  atome
//
//  Legacy lightweight StoreKit 2 bridge (kept for backward compatibility) — core logic now lives in PurchaseManager.
//
import Foundation
import StoreKit

@available(iOS 15.0, *)
@available(iOS 15.0, *)
final class PurchaseBridge { // Deprecated wrapper – retained to avoid breaking older code paths
    static let shared = PurchaseBridge()
    private init() {}
    func purchase(productId: String, requestId: Int) async {
        await PurchaseManager.shared.purchase(id: productId, requestId: requestId)
    }
    func restore(requestId: Int) async {
        await PurchaseManager.shared.restore(requestId: requestId)
    }
}
final class LegacyPurchaseBridge {
    static let shared = LegacyPurchaseBridge()
    func purchase(productId: String, requestId: Int) {
        WebViewManager.sendBridgeJSON(["action":"purchaseResult", "productId": productId, "success": false, "requestId": requestId, "error":"unavailable_ios_version"]) }
    func restore(requestId: Int) {
        WebViewManager.sendBridgeJSON(["action":"restorePurchasesResult", "products": [], "requestId": requestId, "error":"unavailable_ios_version"]) }
}
