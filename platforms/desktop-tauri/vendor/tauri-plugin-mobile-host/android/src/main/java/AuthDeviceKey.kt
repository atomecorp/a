package one.atome.mobile

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import org.json.JSONObject

// The existing Rust auth_device owner validates action/scope/message before
// this non-exportable Android Keystore capability is invoked.
object AuthDeviceKey {
    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    @Synchronized fun handle(args: JSONObject): Any {
        val scope = args.getString("scope")
        require(scope.matches(Regex("[a-fA-F0-9]{64}"))) { "auth_device_scope_invalid" }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "one.atome.auth.device.$scope"
        if (!store.containsAlias(alias)) {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            generator.initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256).setUserAuthenticationRequired(false).build())
            generator.generateKeyPair()
        }
        val key = store.getKey(alias, null) as java.security.PrivateKey
        val info = KeyFactory.getInstance(key.algorithm, "AndroidKeyStore").getKeySpec(key, KeyInfo::class.java)
        check(info.isInsideSecureHardware) { "auth_protected_device_key_unavailable" }
        val public = store.getCertificate(alias).publicKey as ECPublicKey
        return when (args.getString("action")) {
            "public" -> {
                fun coordinate(value: java.math.BigInteger): ByteArray {
                    val bytes = value.toByteArray()
                    return ByteArray(32).also { bytes.copyInto(it, 32 - minOf(32, bytes.size), maxOf(0, bytes.size - 32)) }
                }
                JSONObject().put("kty", "EC").put("crv", "P-256")
                    .put("x", encode(coordinate(public.w.affineX))).put("y", encode(coordinate(public.w.affineY)))
            }
            "sign" -> Signature.getInstance("SHA256withECDSA").run {
                initSign(key); update(args.getString("message").toByteArray(Charsets.UTF_8)); encode(sign())
            }
            "verify" -> Signature.getInstance("SHA256withECDSA").run {
                initVerify(public); update(args.getString("message").toByteArray(Charsets.UTF_8))
                verify(Base64.decode(args.getString("signature"), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            }
            else -> error("auth_device_action_invalid")
        }
    }
}
