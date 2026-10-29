package one.atome.health

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.Deflater

// Writer of the sensor recording format v1 (atome/documentations/sensor_recording_format.md),
// byte-compatible with the Swift writer (platforms/ios/atome-auv3/sensors/SensorRecordingWriter.swift).
// Shared by the phone recorder (tauri-plugin-health) and the Wear OS recorder (gen/android/wear).
// Lossless: times in ns, values as float64 bits XOR the previous sample, each block raw-DEFLATE
// compressed. Not thread-safe: one owner thread calls every method.
internal class SensorRecordingWriter(val file: File, header: JSONObject, val streams: List<Stream>) {
    class Stream(val id: String, val sensor: String, val axes: List<String>, val unit: String, val rateHz: Double)

    private val output: FileOutputStream
    private val times = streams.map { LongArray(BLOCK_SAMPLES) }
    private val values = streams.map { stream -> List(stream.axes.size) { LongArray(BLOCK_SAMPLES) } }
    private val buffered = IntArray(streams.size)
    val counts = IntArray(streams.size)

    init {
        val described = JSONArray()
        streams.forEachIndexed { index, stream ->
            described.put(JSONObject().put("index", index).put("id", stream.id).put("sensor", stream.sensor)
                .put("axes", JSONArray(stream.axes)).put("unit", stream.unit).put("rate_hz", stream.rateHz))
        }
        val json = JSONObject(header.toString()).put("streams", described).toString().toByteArray(Charsets.UTF_8)
        output = FileOutputStream(file)
        output.write(MAGIC)
        output.write(le32(json.size))
        output.write(json)
    }

    fun append(stream: Int, timeNs: Long, sample: DoubleArray) {
        require(sample.size == streams[stream].axes.size) { "sensor_recording_axes_mismatch" }
        val at = buffered[stream]
        times[stream][at] = timeNs
        sample.forEachIndexed { axis, value -> values[stream][axis][at] = java.lang.Double.doubleToRawLongBits(value) }
        buffered[stream] = at + 1
        counts[stream] += 1
        if (buffered[stream] >= BLOCK_SAMPLES) flush(stream)
    }

    // Writes what is buffered and closes the file; returns its size in bytes.
    fun finish(): Long {
        streams.indices.forEach { flush(it) }
        output.fd.sync()
        output.close()
        return file.length()
    }

    private fun flush(stream: Int) {
        val count = buffered[stream]
        if (count == 0) return
        val raw = ByteBuffer.allocate(count * 8 * (1 + streams[stream].axes.size)).order(ByteOrder.LITTLE_ENDIAN)
        for (index in 0 until count) raw.putLong(if (index == 0) times[stream][0] else times[stream][index] - times[stream][index - 1])
        for (axis in values[stream]) {
            var last = 0L
            for (index in 0 until count) { raw.putLong(axis[index] xor last); last = axis[index] }
        }
        val packed = deflate(raw.array())
        output.write(byteArrayOf(1, stream.toByte()))
        output.write(le32(count))
        output.write(le32(packed.size))
        output.write(packed)
        buffered[stream] = 0
    }

    companion object {
        const val BLOCK_SAMPLES = 512
        private val MAGIC = "ASR1".toByteArray(Charsets.US_ASCII)

        private fun le32(value: Int): ByteArray = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()

        // nowrap = raw DEFLATE (RFC 1951), as the format requires.
        private fun deflate(input: ByteArray): ByteArray {
            val deflater = Deflater(Deflater.DEFAULT_COMPRESSION, true)
            try {
                deflater.setInput(input)
                deflater.finish()
                val out = java.io.ByteArrayOutputStream(input.size / 2 + 64)
                val chunk = ByteArray(65_536)
                while (!deflater.finished()) out.write(chunk, 0, deflater.deflate(chunk))
                return out.toByteArray()
            } finally {
                deflater.end()
            }
        }

        // The JSON header of a recording, read without loading its blocks.
        fun readHeader(file: File): JSONObject? = try {
            RandomAccessFile(file, "r").use { input ->
                val prefix = ByteArray(8)
                input.readFully(prefix)
                if (!prefix.copyOfRange(0, 4).contentEquals(MAGIC)) return null
                val length = ByteBuffer.wrap(prefix, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
                if (length <= 0 || length > 65_536) return null
                val json = ByteArray(length)
                input.readFully(json)
                JSONObject(String(json, Charsets.UTF_8))
            }
        } catch (_: Exception) { null }
    }
}
