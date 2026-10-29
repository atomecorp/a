import Foundation
import Compression

// Writer of the sensor recording format v1 (atome/documentations/sensor_recording_format.md),
// shared by the iPhone recorder (HealthSensorRecorder.swift) and the Apple Watch app. Lossless:
// times in ns, values as float64 bits XOR the previous sample, each block raw-DEFLATE compressed.
// Not thread-safe: one owner queue calls every method.
final class SensorRecordingWriter {
    struct Stream {
        let id: String
        let sensor: String
        let axes: [String]
        let unit: String
        let rateHz: Double
    }

    enum Failure: Error { case create, compress }

    static let blockSamples = 512

    let url: URL
    let streams: [Stream]
    private let handle: FileHandle
    private var times: [[Int64]]
    private var values: [[[Double]]]
    private(set) var counts: [Int]

    init(url: URL, header: [String: Any], streams: [Stream]) throws {
        self.url = url
        self.streams = streams
        var full = header
        full["streams"] = streams.enumerated().map { index, stream in
            ["index": index, "id": stream.id, "sensor": stream.sensor, "axes": stream.axes, "unit": stream.unit, "rate_hz": stream.rateHz] as [String: Any]
        }
        let json = try JSONSerialization.data(withJSONObject: full, options: [.sortedKeys])
        var data = Data("ASR1".utf8)
        Self.put(UInt32(json.count), into: &data)
        data.append(json)
        #if os(iOS) || os(watchOS)
        let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.completeUnlessOpen]
        #else
        let attributes: [FileAttributeKey: Any] = [:]
        #endif
        guard FileManager.default.createFile(atPath: url.path, contents: data, attributes: attributes) else { throw Failure.create }
        handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        times = Array(repeating: [], count: streams.count)
        values = streams.map { Array(repeating: [], count: $0.axes.count) }
        counts = Array(repeating: 0, count: streams.count)
    }

    func append(_ stream: Int, timeNs: Int64, _ sample: [Double]) throws {
        precondition(sample.count == streams[stream].axes.count, "sensor_recording_axes_mismatch")
        times[stream].append(timeNs)
        for (axis, value) in sample.enumerated() { values[stream][axis].append(value) }
        counts[stream] += 1
        if times[stream].count >= Self.blockSamples { try flush(stream) }
    }

    // Writes what is buffered and closes the file; returns its size in bytes.
    func finish() throws -> Int {
        for stream in streams.indices { try flush(stream) }
        let size = try handle.seekToEnd()
        try handle.close()
        return Int(size)
    }

    private func flush(_ stream: Int) throws {
        let count = times[stream].count
        guard count > 0 else { return }
        var raw = Data(capacity: count * 8 * (1 + streams[stream].axes.count))
        var previous: Int64 = 0
        for (index, time) in times[stream].enumerated() {
            Self.put(UInt64(bitPattern: index == 0 ? time : time &- previous), into: &raw)
            previous = time
        }
        for axis in values[stream] {
            var last: UInt64 = 0
            for value in axis {
                Self.put(value.bitPattern ^ last, into: &raw)
                last = value.bitPattern
            }
        }
        let packed = try Self.deflate(raw)
        var block = Data([1, UInt8(stream)])
        Self.put(UInt32(count), into: &block)
        Self.put(UInt32(packed.count), into: &block)
        block.append(packed)
        try handle.write(contentsOf: block)
        times[stream].removeAll(keepingCapacity: true)
        for axis in values[stream].indices { values[stream][axis].removeAll(keepingCapacity: true) }
    }

    // COMPRESSION_ZLIB is raw DEFLATE (RFC 1951), as the format requires.
    private static func deflate(_ input: Data) throws -> Data {
        let capacity = input.count + 65_536
        var output = Data(count: capacity)
        let written = output.withUnsafeMutableBytes { target in
            input.withUnsafeBytes { source in
                compression_encode_buffer(target.bindMemory(to: UInt8.self).baseAddress!, capacity,
                                          source.bindMemory(to: UInt8.self).baseAddress!, input.count, nil, COMPRESSION_ZLIB)
            }
        }
        guard written > 0 else { throw Failure.compress }
        return output.prefix(written)
    }

    private static func put<T: FixedWidthInteger>(_ value: T, into data: inout Data) {
        withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }

    // The JSON header of a recording, read without loading its blocks.
    static func readHeader(_ url: URL) -> [String: Any]? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let prefix = try? handle.read(upToCount: 8), prefix.count == 8, prefix.prefix(4) == Data("ASR1".utf8) else { return nil }
        let length = prefix.suffix(4).enumerated().reduce(0) { $0 | (Int($1.element) << (8 * $1.offset)) }
        guard length > 0, length <= 65_536, let json = try? handle.read(upToCount: length), json.count == length else { return nil }
        return (try? JSONSerialization.jsonObject(with: json)) as? [String: Any]
    }
}
