// Memory-only keystore seam; real CryptoKit signatures verify the native proof consumer.
enum SandboxPathValidator {
 static func primaryRoot() -> URL? { URL(fileURLWithPath:CommandLine.arguments[1]) }
 static func pluginContainerRoot() -> URL? { nil }
}
enum SharedBus {static let appGroupSuite = "qa-session-descriptor-" + URL(fileURLWithPath:CommandLine.arguments[1]).lastPathComponent}
enum FastifySyncClient { static func configureRemote(_ value:[String:Any], localUserId:String)->[String:Any]{ ["ok":true] } }
final class iCloudFileManager {static let shared=iCloudFileManager();func getCurrentStorageURL()->URL?{SandboxPathValidator.primaryRoot()}}
enum AuthDeviceKey {
 static let key=P256.Signing.PrivateKey()
 static func identity(scope:String)throws->String { "qa-key" }
 static func verify(scope:String,message:String,signature:Data)throws->Bool {
  guard let parsed=try? P256.Signing.ECDSASignature(rawRepresentation:signature) else{return false}
  return key.publicKey.isValidSignature(parsed,for:Data(message.utf8))
 }
}
extension AiSRuntime {
 static func base64url(_ value:Data)->String{value.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")}
 static func base64urlDecode(_ value:String)->Data?{let text=value.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/");return Data(base64Encoded:text+String(repeating:"=",count:(4-text.count%4)%4))}
 static func createToken(userId:String,username:String,grant:String?=nil,generation:Int64?=nil)throws->String{userId}
 static func verifyToken(_ token:String)throws->[String:Any]?{["sub":token]}
 static func runDescriptorChecks()throws {
  let db=try openDatabase()
  try ensureLocalAuthSchema(db);try ensureLocalAuthSchema(db)
  let legacyRow = try query(db,"SELECT generation,locked,remote_session_id FROM auth_local_grants WHERE grant_id='legacy-grant'",[]).first!
  precondition(intValue(legacyRow["generation"],defaultValue:0) == 7 && intValue(legacyRow["locked"],defaultValue:0) == 1)
  precondition(legacyRow["remote_session_id"] as? String == nil)
  let remote:[String:Any]=["id":"qa-remote-A","phone":"+33612345678","username":"QA"]
  let bound=try bindRemoteIdentity(remote,scope:"qa-scope",keyId:"qa-key",sessionId:"qa-server-session",sessionGeneration:4)
  let local=bound["localSession"] as! [String:Any], grant=local["id"] as! String
  let row=try localAuthDescriptor(["grantId":grant],db:db)["localGrant"] as! [String:Any]
  let saved=row["remoteSession"] as! [String:Any], session=saved["session"] as! [String:Any]
  precondition(saved["userId"] as? String == "qa-remote-A" && session["id"] as? String == "qa-server-session")
  precondition(session["generation"] as? Int64 == 4 && saved["token"] == nil)
  do { _=try bindRemoteIdentity(remote,scope:"qa-scope",keyId:"qa-key",sessionId:"qa-server-session",sessionGeneration:3)
       preconditionFailure("older generation overwrote native authority") } catch {precondition(error.localizedDescription == "auth_session_stale")}
  // Read the actual database file through a fresh handle, as after a WebView cache disappearance.
  var reopened:OpaquePointer?
  precondition(sqlite3_open_v2(SandboxPathValidator.primaryRoot()!.appendingPathComponent("adole.db").path,&reopened,SQLITE_OPEN_READWRITE,nil) == SQLITE_OK)
  defer { sqlite3_close(reopened) }
  let restored=try localAuthDescriptor(["grantId":grant],db:reopened)["localGrant"] as! [String:Any]
  precondition((restored["remoteSession"] as? [String:Any])?["userId"] as? String == "qa-remote-A")
  func locking(_ remoteOnly:Bool, invalid:Bool=false)throws {
   let challenge=try localAuthChallenge(["grantId":grant,"purpose":"local-lock"],db:reopened)["challenge"] as! [String:Any]
   let context:[Any]=["atome.phone-link.v1","https://atome.one","local-lock",challenge["reference"]!,challenge["challenge"]!,challenge["nonce"]!,challenge["keyId"]!,challenge["issuedAt"]!]
   let bytes=try JSONSerialization.data(withJSONObject:context,options:[.withoutEscapingSlashes])
   let signature=invalid ? Data(repeating:0,count:64) : try AuthDeviceKey.key.signature(for:bytes).rawRepresentation
   _=try consumeLocalAuthChallenge(["action":"local-session-lock","grantId":grant,"challengeId":challenge["challenge"]!,"signature":base64url(signature),"remoteOnly":remoteOnly],db:reopened)
  }
  do {try locking(true,invalid:true);preconditionFailure("invalid proof accepted")}catch{precondition(error.localizedDescription == "auth_proof_invalid")}
  let stillStored = try localAuthDescriptor(["grantId":grant],db:reopened)["localGrant"] as! [String:Any]
  precondition(stillStored["remoteSession"] is [String:Any])
  try locking(true)
  let retired=try localAuthDescriptor(["grantId":grant],db:reopened)["localGrant"] as! [String:Any]
  precondition(retired["remoteSession"] is NSNull && retired["remoteSessionKnown"] as? Bool == true && retired["locked"] as? Bool == false)
  _=try bindRemoteIdentity(remote,scope:"qa-scope",keyId:"qa-key",sessionId:"qa-new-session",sessionGeneration:5)
  try locking(false)
  let locked = try localAuthDescriptor(["grantId":grant],db:reopened)
  precondition(locked["localGrant"] is NSNull)
  let lockedRecord = try localAuthDescriptor(["grantId":grant,"includeLocked":true],db:reopened)["localGrant"] as! [String:Any]
  precondition(lockedRecord["locked"] as? Bool == true && lockedRecord["remoteSession"] is NSNull)
  // Account B stays separate and does not receive A's descriptor.
  _=try bindRemoteIdentity(["id":"qa-remote-B","phone":"+33612345679","username":"QB"],scope:"qb-scope",keyId:"qb-key",sessionId:"qb-session",sessionGeneration:0)
  let b=try localAuthDescriptor([:],db:reopened)["localGrant"] as! [String:Any]
  precondition((b["remoteSession"] as! [String:Any])["userId"] as? String == "qa-remote-B")
  print("Native descriptor: schema migration, restart, signed clear, logout and account isolation passed")
 }
}
// Start with the installed seven-column schema; the production migration must preserve it.
var legacy: OpaquePointer?
sqlite3_open(URL(fileURLWithPath:CommandLine.arguments[1]).appendingPathComponent("adole.db").path,&legacy)
sqlite3_exec(legacy,"CREATE TABLE IF NOT EXISTS auth_local_grants (grant_id TEXT PRIMARY KEY,local_principal TEXT NOT NULL,remote_principal TEXT NOT NULL,key_id TEXT NOT NULL,key_scope TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,locked INTEGER NOT NULL DEFAULT 0,UNIQUE(remote_principal,key_id))",nil,nil,nil)
sqlite3_exec(legacy,"INSERT INTO auth_local_grants VALUES ('legacy-grant','legacy-local','legacy-remote','legacy-key','legacy-scope',7,1)",nil,nil,nil)
sqlite3_close(legacy)
try AiSRuntime.queue.sync{try AiSRuntime.runDescriptorChecks()}
UserDefaults(suiteName:SharedBus.appGroupSuite)?.removePersistentDomain(forName:SharedBus.appGroupSuite)
