//
//  PurchaseManager.swift
//  atome
//
//  StoreKit 2 in-app purchase of the single atome offer. The entitlement belongs
//  to the account, never to this device: the app only returns the signed
//  transaction (JWS) to the page, and the server verifies it with Apple before
//  anything is granted. Renewals and refunds reach the server through App Store
//  Server Notifications v2.
//
import Foundation
import StoreKit

final class PurchaseManager {
    static let shared = PurchaseManager()
    private var updates: Task<Void, Never>?
    private init() {}

    // Transactions delivered outside a purchase call (renewals, Ask to Buy
    // approvals) are finished here; the server learns them from Apple.
    func start() {
        guard updates == nil else { return }
        updates = Task.detached {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result { await transaction.finish() }
            }
        }
    }

    // `billing_store_purchase`: buys `productId` bound to the account token of the
    // device key that creates or owns the account.
    func purchase(productId: String, accountToken: String, completion: @escaping ([String: Any]?, String?) -> Void) {
        // An Audio Unit extension has no scene to present the store sheet.
        guard !WebViewManager.runningInExtension else { completion(nil, "billing_store_unavailable"); return }
        guard let token = UUID(uuidString: accountToken) else { completion(nil, "billing_account_token_invalid"); return }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    completion(nil, "billing_product_unknown"); return
                }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else { completion(nil, "billing_proof_untrusted"); return }
                    await transaction.finish()
                    completion(["ok": true, "productId": productId, "jws": verification.jwsRepresentation], nil)
                case .userCancelled:
                    completion(nil, "billing_purchase_cancelled")
                case .pending:
                    completion(nil, "billing_purchase_pending")
                @unknown default:
                    completion(nil, "billing_store_failed")
                }
            } catch {
                completion(nil, "billing_store_failed")
            }
        }
    }
}
