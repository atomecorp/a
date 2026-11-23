import Foundation
import UIKit

// The screen's CSS px (points) per millimetre, published with the viewport (`cssPxPerMm`) so eVe lays every tool, tile
// and text at the iPhone's physical size on every device (R-280, eVe/elements/system_ui_physical_scale.js). iOS gives no
// physical density: it is read from the model, whose screen is known — points per inch, the ppi over the screen's scale.
enum DisplayDensity {
    private static let millimetresPerInch = 25.4
    // 326 ppi at 2× (163 points per inch): the iPad minis.
    private static let iPadMinis: Set<String> = ["iPad4,4", "iPad4,5", "iPad4,6", "iPad4,7", "iPad4,8", "iPad4,9",
                                                 "iPad5,1", "iPad5,2", "iPad11,1", "iPad11,2", "iPad14,1", "iPad14,2",
                                                 "iPad16,1", "iPad16,2"]
    // 326 ppi at 2×: the iPhones drawn at 2× (6s, SE, 7, 8, XR, 11, SE 2 and 3) and the last iPod touch.
    private static let twoTimesPhones: Set<String> = ["iPhone8,1", "iPhone8,4", "iPhone9,1", "iPhone9,3", "iPhone10,1",
                                                      "iPhone10,4", "iPhone11,8", "iPhone12,1", "iPhone12,8",
                                                      "iPhone14,6", "iPod9,1"]
    // 476 ppi at 3×: the iPhone minis.
    private static let miniPhones: Set<String> = ["iPhone13,1", "iPhone14,4"]

    private static var modelIdentifier: String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    // nil on a Mac running the iPad app: its display is not the model's, and the page keeps its own px.
    static func cssPxPerMillimetre() -> Double? {
        if ProcessInfo.processInfo.isiOSAppOnMac { return nil }
        let model = modelIdentifier
        let pointsPerInch: Double
        if iPadMinis.contains(model) || twoTimesPhones.contains(model) {
            pointsPerInch = 326.0 / 2.0
        } else if miniPhones.contains(model) {
            pointsPerInch = 476.0 / 3.0
        } else if model.hasPrefix("iPad") || UIDevice.current.userInterfaceIdiom == .pad {
            // Every other iPad: 264 ppi at 2×.
            pointsPerInch = 264.0 / 2.0
        } else {
            // Every other iPhone: 458–460 ppi at 3× (the Plus models' 401 ppi at 2.61× give the same 153.7).
            pointsPerInch = 460.0 / 3.0
        }
        return pointsPerInch / millimetresPerInch
    }
}
