import Foundation
import UIKit
import PushKit
import CallKit
import UserNotifications
import AVFoundation

// OS presentation and a bounded inbox only. Account proof, signaling and media
// participation remain with the canonical authenticated runtime.
final class AppNativeCommunication: NSObject, PKPushRegistryDelegate, CXProviderDelegate, UNUserNotificationCenterDelegate {
    static let shared = AppNativeCommunication()
    private let provider: CXProvider
    private var registry: PKPushRegistry?
    private var tokens: [String: String] = [:]
    private var pending: [[String: Any]] = []
    private var calls: [UUID: [String: Any]] = [:]
    private var answers: [UUID: CXAnswerCallAction] = [:]
    private var deadlines: [UUID: DispatchWorkItem] = [:]
    private let defaults = UserDefaults.standard
    private var installation: String {
        if let id = defaults.string(forKey: "atome.push.installation") { return id }
        let id = UUID().uuidString.lowercased(); defaults.set(id, forKey: "atome.push.installation"); return id
    }
    override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        provider = CXProvider(configuration: configuration)
        super.init()
        pending = defaults.array(forKey: "atome.push.pending") as? [[String: Any]] ?? []
        provider.setDelegate(self, queue: .main)
    }
    func start() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
        let push = PKPushRegistry(queue: .main); push.delegate = self
        push.desiredPushTypes = [.voIP]; registry = push
    }
    static func canHandle(_ command: String) -> Bool { command.hasPrefix("notifications_") }
    private func principal() -> String? {
        // Read the actual unlocked local grant on every delivery, including cold start.
        return AiSRuntime.queue.sync {
            guard let db = try? AiSRuntime.openDatabase(), let descriptor = try? AiSRuntime.localAuthDescriptor([:], db: db),
                  let grant = descriptor["localGrant"] as? [String: Any], grant["locked"] as? Bool != true,
                  let remote = grant["remoteSession"] as? [String: Any] else { return nil }
            return remote["userId"] as? String
        }
    }
    private func notify() {
        WebViewManager.evaluateJS("window.dispatchEvent(new Event('atome:notifications-available'));", label: "notifications.available")
    }
    func resume() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                if settings.authorizationStatus == .denied { self.tokens.removeValue(forKey: "alert") }
                self.notify()
            }
        }
    }
    private func append(_ action: String, data: [String: Any]) {
        guard data["principal_id"] as? String == principal() else { return }
        pending.append(data.merging(["action": action]) { _, new in new })
        if pending.count > 32 { pending.removeFirst(pending.count - 32) }
        // Persist only opaque navigation references, never payload content/credentials.
        defaults.set(pending, forKey: "atome.push.pending"); notify()
    }
    func handle(_ command: String, payload: [String: Any], completion: @escaping ([String: Any], String?) -> Void) {
        DispatchQueue.main.async {
            if command == "notifications_enable" {
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { allowed, _ in
                    DispatchQueue.main.async {
                        if allowed { UIApplication.shared.registerForRemoteNotifications() }
                        completion(["ok": true, "authorized": allowed], nil)
                    }
                }
            } else if command == "notifications_tokens" {
                #if DEBUG
                let environment = "sandbox"
                #else
                let environment = "production"
                #endif
                completion(["ok": true, "installationId": self.installation, "environment": environment, "tokens": self.tokens], nil)
            } else if command == "notifications_take" {
                let restored = self.defaults.array(forKey: "atome.push.pending") as? [[String: Any]] ?? []
                let owner = self.principal()
                let items = restored.filter { $0["principal_id"] as? String == owner && owner != nil }
                completion(["ok": true, "items": items], nil)
            } else if command == "notifications_ack" {
                let restored = self.defaults.array(forKey: "atome.push.pending") as? [[String: Any]] ?? []
                self.pending = restored.filter { $0["notification_id"] as? String != payload["id"] as? String || $0["action"] as? String != payload["action"] as? String }
                self.defaults.set(self.pending, forKey: "atome.push.pending"); completion(["ok": true], nil)
            } else if command == "notifications_call_result", let room = payload["room_id"] as? String, let id = UUID(uuidString: room) {
                self.answers.removeValue(forKey: id)
                self.deadlines.removeValue(forKey: id)?.cancel()
                if payload["ok"] as? Bool != true { self.end(id, reason: .failed) }
                completion(["ok": true], nil)
            } else if command == "notifications_call_end", let room = payload["room_id"] as? String, let id = UUID(uuidString: room) {
                self.end(id, reason: .remoteEnded); completion(["ok": true], nil)
            } else if command == "notifications_logout" {
                for id in Array(self.calls.keys) { self.end(id, reason: .failed) }
                self.pending = []; self.defaults.removeObject(forKey: "atome.push.pending"); completion(["ok": true], nil)
            } else { completion(["ok": false], "notifications_command_unsupported") }
        }
    }
    func receiveAlertToken(_ data: Data) { tokens["alert"] = data.map { String(format: "%02x", $0) }.joined(); notify() }
    func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        tokens["voip"] = credentials.token.map { String(format: "%02x", $0) }.joined(); notify()
    }
    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) { tokens.removeValue(forKey: "voip"); notify() }
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType, completion: @escaping () -> Void) {
        receiveIncomingCall(payload, mustReport: true, completion: completion)
    }
    @available(iOS 26.4, *)
    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingVoIPPushWith payload: PKPushPayload,
                      metadata: PKVoIPPushMetadata, withCompletionHandler completion: @escaping () -> Void) {
        receiveIncomingCall(payload, mustReport: metadata.mustReport, completion: completion)
    }
    private func receiveIncomingCall(_ payload: PKPushPayload, mustReport: Bool, completion: @escaping () -> Void) {
        let data = payload.dictionaryPayload["atome"] as? [String: Any] ?? [:]
        let room = (data["room_id"] as? String).flatMap(UUID.init(uuidString:))
        let id = room ?? UUID()
        let isCurrent = { () -> Bool in
            guard room != nil, let owner = self.principal(), data["principal_id"] as? String == owner,
                  let expiry = data["expires_at"] as? NSNumber else { return false }
            return expiry.doubleValue > Date().timeIntervalSince1970 * 1000
        }
        if !mustReport && (calls[id] != nil || !isCurrent()) { completion(); return }
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Atome")
        update.hasVideo = data["call_mode"] as? String == "visio"
        // Report immediately, even when expired/foreign payloads must then be ended.
        provider.reportNewIncomingCall(with: id, update: update) { error in
            DispatchQueue.main.async {
                defer { completion() }
                guard error == nil else { return }
                guard isCurrent(), let expiry = data["expires_at"] as? NSNumber else {
                    self.provider.reportCall(with: id, endedAt: Date(), reason: .failed); return
                }
                guard self.calls[id] == nil else { return }
                self.calls[id] = data
                let deadline = DispatchWorkItem { self.end(id, reason: .unanswered) }
                self.deadlines[id] = deadline
                DispatchQueue.main.asyncAfter(deadline: .now() + (expiry.doubleValue / 1000 - Date().timeIntervalSince1970), execute: deadline)
            }
        }
    }
    private func end(_ id: UUID, reason: CXCallEndedReason) {
        deadlines.removeValue(forKey: id)?.cancel(); answers.removeValue(forKey: id)?.fail()
        calls.removeValue(forKey: id); provider.reportCall(with: id, endedAt: Date(), reason: reason)
        releaseAudio()
    }
    func providerDidReset(_ provider: CXProvider) {
        for work in deadlines.values { work.cancel() }; deadlines.removeAll()
        for action in answers.values { action.fail() }; answers.removeAll(); calls.removeAll()
        releaseAudio()
    }
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let data = calls[action.callUUID], data["principal_id"] as? String == principal() else { action.fail(); return }
        deadlines.removeValue(forKey: action.callUUID)?.cancel(); answers[action.callUUID] = action
        let deadline = DispatchWorkItem {
            self.append("end", data: data); self.end(action.callUUID, reason: .failed)
        }
        deadlines[action.callUUID] = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: deadline)
        let audio = AppNativeAudioController.shared
        audio.queue.async {
            audio.systemOwnsAudioActivation = true
            do {
                try audio.acquireAudioSessionConsumer("callkit", kind: .communicationCapture)
                DispatchQueue.main.async { action.fulfill() }
            } catch { DispatchQueue.main.async { action.fail(); self.end(action.callUUID, reason: .failed) } }
        }
    }
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let data = calls[action.callUUID] { append(answers[action.callUUID] == nil ? "decline_or_end" : "end", data: data) }
        deadlines.removeValue(forKey: action.callUUID)?.cancel(); answers.removeValue(forKey: action.callUUID)?.fail()
        calls.removeValue(forKey: action.callUUID); action.fulfill()
        releaseAudio()
    }
    private func releaseAudio() {
        let audio = AppNativeAudioController.shared
        audio.queue.async {
            audio.systemOwnsAudioActivation = false
            audio.releaseAudioSessionConsumer("callkit")
        }
    }
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        for (id, _) in answers { if let data = calls[id] { append("answer", data: data) } }
    }
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        let audio = AppNativeAudioController.shared
        audio.queue.async { audio.systemOwnsAudioActivation = false; audio.applyCurrentAudioSessionPlan(transition: "callkit_deactivated") }
    }
    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        action.fail()
        if let call = action as? CXCallAction { end(call.callUUID, reason: .failed) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        let data = notification.request.content.userInfo["atome"] as? [String: Any] ?? [:]
        completion(data["principal_id"] as? String == principal() ? [.banner, .sound] : [])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completion: @escaping () -> Void) {
        if let data = response.notification.request.content.userInfo["atome"] as? [String: Any] { append("open", data: data) }
        completion()
    }
}

final class AtomeApplicationDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        AppNativeCommunication.shared.start(); return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        AppNativeCommunication.shared.receiveAlertToken(token)
    }
}
