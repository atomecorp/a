//
//  AppNativeMediaCaptureController.swift
//  Shared native media capture controller (camera/microphone) used by both the
//  standalone application target and the AUv3 extension target. Handles the
//  set of `media_*` commands dispatched through the WKWebView native invoke
//  bridge (`window.__ATOME_IOS_NATIVE_INVOKE`).
//
//  Recording and still capture are file-producing capabilities. The video
//  recorder also exposes bounded raw frames for the shared Bevy tool texture.
//

import UIKit
import WebKit
import AVFoundation

final class AppNativeMediaCaptureController: NSObject {
    static let shared = AppNativeMediaCaptureController()

    let sessionQueue = DispatchQueue(label: "atome.app.native_media_capture", qos: .userInitiated)
    let videoRecorder = AppNativeVideoRecorder()
    var photoSession: AVCaptureSession?
    var photoOutput: AVCapturePhotoOutput?
    var photoCompletion: (([String: Any], String?) -> Void)?
    var photoOutputURL: URL?
    var photoRelativePath: String?
    var photoFileName: String?

    var activeCameraPosition: AVCaptureDevice.Position = .back
    weak var previewWebView: WKWebView?

    static func canHandle(command: String) -> Bool {
        switch command {
        case "media_capture_photo",
             "media_capture_permissions_prepare",
             "media_video_record_start",
             "media_video_record_stop",
             "media_video_record_state",
             "media_video_preview_frame",
             "media_video_record_cancel",
             "media_video_record_ack",
             "media_camera_switch":
            return true
        default:
            return false
        }
    }

    func attachPreviewHost(webView: WKWebView) {
        DispatchQueue.main.async {
            self.previewWebView = webView
        }
    }

    func handle(command: String,
                payload: [String: Any],
                completion: @escaping ([String: Any], String?) -> Void) {
        switch command {
        case "media_capture_photo":
            capturePhoto(payload: payload, completion: completion)
        case "media_capture_permissions_prepare":
            prepareCapturePermissions(payload: payload, completion: completion)
        case "media_video_record_start":
            startVideoRecording(payload: payload, completion: completion)
        case "media_video_record_stop":
            stopVideoRecording(payload: payload, completion: completion)
        case "media_video_record_state":
            readVideoRecordingState(completion: completion)
        case "media_video_preview_frame":
            readVideoPreviewFrame(completion: completion)
        case "media_video_record_cancel":
            cancelVideoRecording(payload: payload, completion: completion)
        case "media_video_record_ack":
            acknowledgeVideoRecording(payload: payload, completion: completion)
        case "media_camera_switch":
            switchCamera(payload: payload, completion: completion)
        default:
            completion(["success": false], "Unsupported native media command: \(command)")
        }
    }

}
