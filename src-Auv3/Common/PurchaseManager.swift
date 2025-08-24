//
//  PurchaseManager.swift
//  atome
//
//  Higher-level StoreKit 2 manager: loads products, observes transactions, exposes entitlements.
//
import Foundation
import StoreKit

@available(iOS 15.0, *)
@MainActor
final class PurchaseManager: ObservableObject {
    static let shared = PurchaseManager()
    private init() { Task { await configure() } }

    @Published private(set) var products: [Product] = []
    private let targetIds: Set<String> = ["midi_console_unlock"] // align with JS for now

    // Public query
    func isOwned(_ id: String) -> Bool { EntitlementStore.shared.isOwned(id) }

    // Initial load + start transaction listener
    private func configure() async {
        await loadProducts()
        await listenForTransactions()
        await refreshEntitlementsFromCurrent()
    }

    private func loadProducts() async {
        do { products = try await Product.products(for: Array(targetIds)) } catch { print("🛒 loadProducts error: \(error)") }
    }

    private func listenForTransactions() async {
        Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { continue }
                await self.handle(transactionResult: result)
            }
        }
    }

    private func handle(transactionResult: VerificationResult<Transaction>) async {
        switch transactionResult {
        case .verified(let tx):
            if targetIds.contains(tx.productID) { EntitlementStore.shared.setOwned(true, productId: tx.productID) }
            await tx.finish()
            WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":tx.productID,"success":true])
        case .unverified(let tx, _):
            print("🛒 Unverified transaction: \(tx.productID)")
        }
    }

    private func refreshEntitlementsFromCurrent() async {
        var changed = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let tx) = result, targetIds.contains(tx.productID) {
                if EntitlementStore.shared.isOwned(tx.productID) == false { EntitlementStore.shared.setOwned(true, productId: tx.productID); changed = true }
            }
        }
    if changed { WebViewManager.sendBridgeJSON(["action":"restorePurchasesResult","products":Array(targetIds.filter{ EntitlementStore.shared.isOwned($0) })]) }
    }

    // Explicit purchase request
    func purchase(id: String, requestId: Int) async {
        do {
            var candidate = products.first(where:{ $0.id == id })
            if candidate == nil { // fetch fresh if not already loaded
                let fetched = try await Product.products(for:[id])
                candidate = fetched.first
            }
            guard let product = candidate else {
                WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"not_found"]) ; return }
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                if case .verified(let tx) = verification {
                    EntitlementStore.shared.setOwned(true, productId: id)
                    await tx.finish()
                    WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":true,"requestId":requestId])
                } else {
                    WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"unverified"]) }
            case .userCancelled:
                WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"cancelled"])        
            case .pending:
                WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"pending"])        
            @unknown default:
                WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"unknown"])        
            }
        } catch {
            WebViewManager.sendBridgeJSON(["action":"purchaseResult","productId":id,"success":false,"requestId":requestId,"error":"exception" ])
        }
    }

    func restore(requestId: Int) async {
        await refreshEntitlementsFromCurrent()
        let owned = targetIds.filter{ EntitlementStore.shared.isOwned($0) }
        WebViewManager.sendBridgeJSON(["action":"restorePurchasesResult","products":Array(owned),"requestId":requestId])
    }
}
