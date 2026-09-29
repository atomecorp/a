import PhotosUI
import UIKit

// Apple Photos import.
//
// The Photo library is not a folder of the Files provider: a document picker
// cannot browse it, which is why a picture import used to open a file dialog
// that never showed the library. A picture request now presents
// `PHPickerViewController`, the system photo picker, and answers the file
// bridge with the very same (name, data) contract as the document picker so
// the web layer keeps parsing a single shape.
//
// The picker runs out of process and needs no photo-library authorization, so
// no permission prompt is added to the import path.
final class PhotoLibraryImportPicker: NSObject, PHPickerViewControllerDelegate {
    // The file-type token the web layer sends to ask for the photo library.
    static let fileTypeToken = "photos"
    private static let associationKey = "PhotoLibraryImportPickerRetainer"
    private let completion: (Bool, [(String, Data)]?, Error?) -> Void

    private init(completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void) {
        self.completion = completion
    }

    // `selectionLimit` 0 keeps the multi-selection contract of the bridge;
    // single-picture flows (a contact face, a background) ask for 1.
    static func loadImages(
        selectionLimit: Int,
        from viewController: UIViewController,
        completion: @escaping (Bool, [(String, Data)]?, Error?) -> Void
    ) {
        let picker = PhotoLibraryImportPicker(completion: completion)
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = max(0, selectionLimit)
        let controller = PHPickerViewController(configuration: configuration)
        controller.delegate = picker
        // PHPicker holds its delegate weakly: the presenting controller keeps
        // the reader alive until the answer is delivered.
        objc_setAssociatedObject(viewController, Self.associationKey, picker, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        DispatchQueue.main.async { viewController.present(controller, animated: true) }
    }

    private static func release(_ viewController: UIViewController?) {
        guard let viewController else { return }
        objc_setAssociatedObject(viewController, associationKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        let host = picker.presentingViewController
        picker.dismiss(animated: true) { [weak self] in
            guard let self else { return }
            defer { Self.release(host) }
            guard !results.isEmpty else {
                self.completion(false, nil, NSError(
                    domain: "PhotoLibraryImport", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "User cancelled"]
                ))
                return
            }
            self.read(results, index: 1, collected: [])
        }
    }

    private func read(_ results: [PHPickerResult], index: Int, collected: [(String, Data)]) {
        guard let result = results.first else {
            if collected.isEmpty {
                completion(false, nil, NSError(
                    domain: "PhotoLibraryImport", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "No readable picture"]
                ))
            } else {
                completion(true, collected, nil)
            }
            return
        }
        let rest = Array(results.dropFirst())
        let position = index
        let provider = result.itemProvider
        guard provider.canLoadObject(ofClass: UIImage.self) else {
            read(rest, index: position + 1, collected: collected)
            return
        }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self else { return }
            var next = collected
            if let image = object as? UIImage, let encoded = Self.encode(image) {
                next.append((Self.fileName(provider: provider, index: position, fileExtension: encoded.fileExtension), encoded.data))
            }
            self.read(rest, index: position + 1, collected: next)
        }
    }

    // Orientation is baked into the pixels: importers store the bytes as they
    // receive them, and an EXIF flag only some readers honour would show a
    // rotated picture. Transparency selects PNG, everything else JPEG.
    private static func encode(_ image: UIImage) -> (data: Data, fileExtension: String)? {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        let flattened = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        if let cgImage = flattened.cgImage, hasAlpha(cgImage), let png = flattened.pngData() {
            return (png, "png")
        }
        return flattened.jpegData(compressionQuality: 0.92).map { ($0, "jpg") }
    }

    private static func hasAlpha(_ image: CGImage) -> Bool {
        switch image.alphaInfo {
        case .first, .last, .premultipliedFirst, .premultipliedLast: return true
        default: return false
        }
    }

    private static func fileName(provider: NSItemProvider, index: Int, fileExtension: String) -> String {
        let suggested = String(provider.suggestedName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let stem = (suggested as NSString).deletingPathExtension
        return "\(stem.isEmpty ? "photo_\(index)" : stem).\(fileExtension)"
    }
}
