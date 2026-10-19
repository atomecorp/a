package one.atome.billing

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

// Google Play Billing for the single atome offer. Called ONLY by the app's
// gated `billing_invoke` (Rust); no JavaScript command reaches this class. The
// purchase token it returns is a lookup key: the server verifies it with the
// Play Developer API, then acknowledges (plan) or consumes (pack) it.
@TauriPlugin
class BillingPlugin(private val activity: Activity) : Plugin(activity) {
    private class Pending(val invoke: Invoke, val productId: String, val accountToken: String, val type: String)
    private var pending: Pending? = null

    private val client: BillingClient by lazy {
        BillingClient.newBuilder(activity)
            .setListener { result, purchases -> onPurchases(result, purchases) }
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
    }

    private fun fail(invoke: Invoke, code: String) = invoke.resolve(JSObject().put("ok", false).put("error", code))
    private fun succeed(invoke: Invoke, productId: String, token: String) =
        invoke.resolve(JSObject().put("ok", true).put("productId", productId).put("purchaseToken", token))
    private fun code(result: BillingResult) = when (result.responseCode) {
        BillingResponseCode.SERVICE_UNAVAILABLE, BillingResponseCode.SERVICE_DISCONNECTED,
        BillingResponseCode.BILLING_UNAVAILABLE -> "billing_store_unavailable"
        BillingResponseCode.ITEM_UNAVAILABLE -> "billing_product_unknown"
        else -> "billing_store_failed"
    }

    private fun connected(invoke: Invoke, then: () -> Unit) {
        if (client.isReady) return then()
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingResponseCode.OK) then() else fail(invoke, code(result))
            }
            override fun onBillingServiceDisconnected() {}
        })
    }

    @Command
    fun purchase(invoke: Invoke) {
        val args = invoke.getArgs()
        val productId = args.optString("productId")
        val accountToken = args.optString("accountToken")
        val type = if (args.optString("kind") == "plan") BillingClient.ProductType.SUBS else BillingClient.ProductType.INAPP
        if (productId.isEmpty() || accountToken.isEmpty()) return fail(invoke, "billing_proof_invalid")
        if (pending != null) return fail(invoke, "billing_purchase_in_progress")
        connected(invoke) {
            val query = QueryProductDetailsParams.newBuilder().setProductList(listOf(
                QueryProductDetailsParams.Product.newBuilder().setProductId(productId).setProductType(type).build())).build()
            client.queryProductDetailsAsync(query) { result, details ->
                val product = details.productDetailsList.firstOrNull()
                if (result.responseCode != BillingResponseCode.OK || product == null) return@queryProductDetailsAsync fail(invoke, "billing_product_unknown")
                val params = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product)
                if (type == BillingClient.ProductType.SUBS) {
                    val offer = product.subscriptionOfferDetails?.firstOrNull()?.offerToken
                        ?: return@queryProductDetailsAsync fail(invoke, "billing_product_unknown")
                    params.setOfferToken(offer)
                }
                activity.runOnUiThread {
                    pending = Pending(invoke, productId, accountToken, type)
                    val launched = client.launchBillingFlow(activity, BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(listOf(params.build())).setObfuscatedAccountId(accountToken).build())
                    if (launched.responseCode != BillingResponseCode.OK) {
                        pending = null
                        if (launched.responseCode == BillingResponseCode.ITEM_ALREADY_OWNED) owned(Pending(invoke, productId, accountToken, type))
                        else fail(invoke, code(launched))
                    }
                }
            }
        }
    }

    private fun onPurchases(result: BillingResult, purchases: List<Purchase>?) {
        val current = pending ?: return
        pending = null
        val purchase = purchases?.firstOrNull { it.products.contains(current.productId) }
        when {
            result.responseCode == BillingResponseCode.USER_CANCELED -> fail(current.invoke, "billing_purchase_cancelled")
            result.responseCode == BillingResponseCode.ITEM_ALREADY_OWNED -> owned(current)
            result.responseCode != BillingResponseCode.OK || purchase == null -> fail(current.invoke, code(result))
            purchase.purchaseState == Purchase.PurchaseState.PENDING -> fail(current.invoke, "billing_purchase_pending")
            else -> succeed(current.invoke, current.productId, purchase.purchaseToken)
        }
    }

    // This Google account already holds the product: it is returned only when it
    // was bought for the same account token (a creation retried by the same key).
    private fun owned(current: Pending) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(current.type).build()) { result, purchases ->
            val purchase = purchases.firstOrNull { it.products.contains(current.productId) }
            when {
                result.responseCode != BillingResponseCode.OK -> fail(current.invoke, code(result))
                purchase == null || purchase.accountIdentifiers?.obfuscatedAccountId != current.accountToken ->
                    fail(current.invoke, "billing_purchase_owned_elsewhere")
                else -> succeed(current.invoke, current.productId, purchase.purchaseToken)
            }
        }
    }
}
