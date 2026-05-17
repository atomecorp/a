//
//  AUv3Diagnostics.swift
//  auv3
//

import Foundation

enum AUv3Diagnostics {
#if DEBUG
    private static let enabled = ProcessInfo.processInfo.environment["ATOME_AUV3_DIAGNOSTICS"] == "1"
#else
    private static let enabled = false
#endif

    static func log(_ message: @autoclosure () -> String) {
        guard enabled else { return }
        fputs(message() + "\n", stderr)
    }
}
