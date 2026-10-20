import UIKit
import UniformTypeIdentifiers

// System camera import.
//
// The inline photo sources of a person's card ask for the camera by name
// (`sources: ["camera"]`): the bridge presents the system camera directly, the
// person frames, shoots and keeps the still, and the bridge answers with the
// same (name, data) contract as the document and photo pickers, so the web
// layer keeps parsing a single shape. Nothing is filed: the still is handed
// back, and the caller decides what it becomes.
final class CameraImportPicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private static let associationKey = "CameraImportPickerRetainer"
    private let completion: (Bool, [(String, Data)]?, Error?) -> Void

    private init(completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) {
        self.completion = completion
    }

    static func takePhoto(
        from viewController: UIViewController,
        completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void
    ) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            completion(false, nil, NSError(domain: "CameraImport", code: -2,
                                           userInfo: [NSLocalizedDescriptionKey: "camera_unavailable"]))
            return
        }
        let picker = CameraImportPicker(completion: completion)
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.mediaTypes = [UTType.image.identifier]
        controller.cameraCaptureMode = .photo
        if UIImagePickerController.isCameraDeviceAvailable(.front) {
            controller.cameraDevice = .front
        }
        controller.delegate = picker
        // The picker holds its delegate weakly: the presenting controller keeps
        // the reader alive until the answer is delivered.
        objc_setAssociatedObject(viewController, Self.associationKey, picker, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        DispatchQueue.main.async { viewController.present(controller, animated: true) }
    }

    private static func release(_ viewController: UIViewController?) {
        guard let viewController else { return }
        objc_setAssociatedObject(viewController, associationKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let host = picker.presentingViewController
        let image = info[.originalImage] as? UIImage
        picker.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            defer { Self.release(host) }
            guard let data = image?.jpegData(compressionQuality: 0.9) else {
                self.completion(false, nil, NSError(domain: "CameraImport", code: -3,
                                                    userInfo: [NSLocalizedDescriptionKey: "photo_data_unavailable"]))
                return
            }
            self.completion(true, [("photo_\(Int(Date().timeIntervalSince1970)).jpg", data)], nil)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let host = picker.presentingViewController
        picker.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            defer { Self.release(host) }
            self.completion(false, nil, NSError(domain: "CameraImport", code: -1,
                                                userInfo: [NSLocalizedDescriptionKey: "User cancelled"]))
        }
    }
}
