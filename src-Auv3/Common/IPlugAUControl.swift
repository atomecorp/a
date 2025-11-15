import Foundation

// Shared control surface for iPlug-style AU parameters without depending on concrete AU class
public protocol IPlugAUControl: AnyObject {
    func setMasterGain(_ g: Float)
    func setPlayActive(_ on: Bool)
    func loadLocalFile(_ path: String)
    func setTestToneActive(_ on: Bool)
    func setDebugCaptureEnabled(_ on: Bool)
    func dumpDebugCapture()
    /// 0..1 normalized seek within currently loaded file (ignored if no file)
    func setPlaybackPositionNormalized(_ pos: Float)
}
