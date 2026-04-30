import Foundation

// Shared control surface for iPlug-style AU parameters without depending on concrete AU class
public protocol IPlugAUControl: AnyObject {
    func setMasterGain(_ g: Float)
    func setPlayActive(_ on: Bool)
    func loadLocalFile(_ path: String)
    func loadLocalFile(_ path: String, startPositionNormalized: Float?)
    func setTestToneActive(_ on: Bool)
    func setDebugCaptureEnabled(_ on: Bool)
    func dumpDebugCapture()
    /// 0..1 normalized seek within currently loaded file (ignored if no file)
    func setPlaybackPositionNormalized(_ pos: Float)
    /// Short host-routed preview used while scrubbing the timeline.
    func scrubLocalFile(_ path: String, positionNormalized: Float, durationSeconds: Double)
    func recordStart(sessionId: String, fileName: String, source: String, sampleRate: Double?, channels: UInt32?)
    func recordStop(sessionId: String)
    /// Stop a specific audio slot by its ID (removes aux slot or stops main if matching)
    func stopAudioSlot(_ slotId: String)
    /// Remove all auxiliary audio slots (keeps main slot)
    func clearAuxSlots()
}
