// Copyright (c) 2026 Apolotary. MIT License.
// An application-owned MIDI source. Other apps explicitly choose whether to receive it.
import Foundation
import CoreMIDI
import Darwin

func report(_ value: [String: Any]) {
    guard var data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
    data.append(10)
    // A closed parent pipe must not throw before native note cleanup runs.
    data.withUnsafeBytes { buffer in
        var offset = 0
        while offset < buffer.count {
            let written = Darwin.write(STDOUT_FILENO, buffer.baseAddress!.advanced(by: offset), buffer.count - offset)
            if written < 0 && errno == EINTR { continue }
            guard written > 0 else { break }
            offset += written
        }
    }
}

final class PacketRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var packets: [[UInt8]] = []
    func receive(_ list: UnsafePointer<MIDIPacketList>) {
        // CoreMIDI may coalesce several sends into one callback packet list.
        let offset = MemoryLayout<MIDIPacketList>.offset(of: \.packet)!
        var pointer = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
        var received: [[UInt8]] = []
        for _ in 0..<list.pointee.numPackets {
            let packet = pointer.pointee
            let bytes = withUnsafeBytes(of: packet.data) { Array($0.prefix(Int(packet.length))) }
            // Running status is not used by this bridge; a callback packet may
            // nevertheless contain multiple complete three-byte messages.
            for start in stride(from: 0, to: bytes.count, by: 3) {
                received.append(Array(bytes[start..<min(start + 3, bytes.count)]))
            }
            pointer = UnsafePointer(MIDIPacketNext(pointer))
        }
        lock.lock()
        packets.append(contentsOf: received)
        lock.unlock()
    }
    func snapshot() -> [[UInt8]] {
        lock.lock()
        defer { lock.unlock() }
        return packets
    }
}

final class MidiBridge: @unchecked Sendable {
    let queue = DispatchQueue(label: "AbletonFly.MIDI")
    private var client = MIDIClientRef()
    private var source = MIDIEndpointRef()
    private var testPort = MIDIPortRef()
    private var active: [UInt8: UInt64] = [:]
    private var sequence: UInt64 = 0
    private var quitting = false
    private var signalSources: [DispatchSourceSignal] = []
    private let testing: Bool
    private let recorder = PacketRecorder()

    init(testing: Bool) { self.testing = testing }

    func open() -> Bool {
        let name = testing ? "Ableton Fly Test" : "Ableton Fly"
        let clientStatus = MIDIClientCreate(name as CFString, nil, nil, &client)
        guard clientStatus == noErr else {
            report(["type": "error", "message": "MIDI service is unavailable", "code": clientStatus])
            return false
        }
        let sourceStatus = MIDISourceCreate(client, name as CFString, &source)
        guard sourceStatus == noErr else {
            MIDIClientDispose(client)
            client = 0
            report(["type": "error", "message": "Could not create MIDI source", "code": sourceStatus])
            return false
        }
        if testing {
            // Hide the self-test endpoint from other applications.
            MIDIObjectSetIntegerProperty(source, kMIDIPropertyPrivate, 1)
            let status = MIDIInputPortCreateWithBlock(client, "Loopback test" as CFString, &testPort) { [recorder] list, _ in
                recorder.receive(list)
            }
            guard status == noErr, MIDIPortConnectSource(testPort, source, nil) == noErr else {
                report(["type": "error", "message": "Could not create MIDI loopback test"])
                dispose()
                return false
            }
        } else {
            // Stable ID helps Live retain its routing when the bridge is restarted.
            // A collision is harmless: CoreMIDI keeps its automatically assigned ID.
            MIDIObjectSetIntegerProperty(source, kMIDIPropertyUniqueID, 0x41464C59)
            MIDIObjectSetStringProperty(source, kMIDIPropertyManufacturer, "Ableton Fly" as CFString)
        }
        for number in [SIGINT, SIGTERM, SIGHUP] {
            signal(number, SIG_IGN)
            let signalSource = DispatchSource.makeSignalSource(signal: number, queue: queue)
            signalSource.setEventHandler { [weak self] in self?.shutdown() }
            signalSource.resume()
            signalSources.append(signalSource)
        }
        // Broken stdout must not bypass note cleanup.
        signal(SIGPIPE, SIG_IGN)
        report(["type": "ready", "name": name])
        return true
    }

    @discardableResult
    private func send(_ bytes: [UInt8]) -> Bool {
        guard source != 0 else { return false }
        var list = MIDIPacketList()
        let status: OSStatus = withUnsafeMutablePointer(to: &list) { listPointer in
            let first = MIDIPacketListInit(listPointer)
            return bytes.withUnsafeBufferPointer { buffer in
                // Three bytes always fit in the stack-allocated packet list.
                _ = MIDIPacketListAdd(listPointer, MemoryLayout<MIDIPacketList>.size, first,
                                     mach_absolute_time(), buffer.count, buffer.baseAddress!)
                return MIDIReceived(source, listPointer)
            }
        }
        if status != noErr {
            report(["type": "error", "message": "MIDI delivery failed", "code": status])
        }
        return status == noErr
    }

    func note(pitch: UInt8, velocity: UInt8, duration: Double) {
        guard !quitting else { return }
        if active[pitch] != nil { send([0x80, pitch, 0]) }
        sequence &+= 1
        let generation = sequence
        active[pitch] = generation
        send([0x90, pitch, velocity])
        queue.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self, !self.quitting, self.active[pitch] == generation else { return }
            self.send([0x80, pitch, 0])
            self.active.removeValue(forKey: pitch)
        }
    }

    func panic() {
        for pitch in active.keys.sorted() { send([0x80, pitch, 0]) }
        active.removeAll()
        send([0xB0, 64, 0])   // Sustain off.
        send([0xB0, 123, 0])  // All notes off.
        send([0xB0, 120, 0])  // All sound off.
    }

    func command(_ line: String) {
        guard !quitting else { return }
        guard line.utf8.count <= 2048,
              let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            report(["type": "error", "message": "Invalid MIDI command"])
            return
        }
        switch type {
        case "note":
            guard let pitch = number(object["pitch"]), let velocity = number(object["velocity"]),
                  let duration = number(object["duration"]), let channel = number(object["channel"]),
                  pitch.rounded() == pitch, velocity.rounded() == velocity,
                  (48...84).contains(pitch), (1...100).contains(velocity),
                  (0.1...3.0).contains(duration), channel == 0 else {
                report(["type": "error", "message": "MIDI note is outside the piano limits"])
                return
            }
            note(pitch: UInt8(pitch), velocity: UInt8(velocity), duration: duration)
        case "panic":
            panic()
            report(["type": "panic"])
        case "quit": shutdown()
        default: report(["type": "error", "message": "Unknown MIDI command"])
        }
    }

    private func number(_ value: Any?) -> Double? {
        guard let value = value as? NSNumber,
              CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { return nil }
        return value.doubleValue
    }

    func shutdown() {
        guard !quitting else { return }
        quitting = true
        panic()
        // Leave enough time for CoreMIDI to deliver cleanup before removing the endpoint.
        queue.asyncAfter(deadline: .now() + 0.04) { [self] in
            dispose()
            report(["type": "closed"])
            exit(EXIT_SUCCESS)
        }
    }

    private func dispose() {
        if testPort != 0 { MIDIPortDispose(testPort); testPort = 0 }
        if source != 0 { MIDIEndpointDispose(source); source = 0 }
        if client != 0 { MIDIClientDispose(client); client = 0 }
    }

    func selfTest() {
        queue.asyncAfter(deadline: .now() + 0.08) { [self] in
            note(pitch: 60, velocity: 70, duration: 0.1)
            queue.asyncAfter(deadline: .now() + 0.05) { [self] in
                note(pitch: 60, velocity: 80, duration: 0.3)
            }
            queue.asyncAfter(deadline: .now() + 0.14) { [self] in
                // The first timer must not end the replacement note.
                let prefix: [[UInt8]] = [[0x90, 60, 70], [0x80, 60, 0], [0x90, 60, 80]]
                guard recorder.snapshot() == prefix else { testFailure(); return }
                panic()
            }
            queue.asyncAfter(deadline: .now() + 0.4) { [self] in
                let expected: [[UInt8]] = [[0x90, 60, 70], [0x80, 60, 0], [0x90, 60, 80],
                    [0x80, 60, 0], [0xB0, 64, 0], [0xB0, 123, 0], [0xB0, 120, 0]]
                guard recorder.snapshot() == expected else { testFailure(); return }
                // Also verify an ordinary scheduled note-off, without a panic.
                note(pitch: 64, velocity: 65, duration: 0.1)
                queue.asyncAfter(deadline: .now() + 0.18) { [self] in
                    guard recorder.snapshot() == expected + [[0x90, 64, 65], [0x80, 64, 0]] else { testFailure(); return }
                    report(["type": "self-test", "passed": true, "packets": 9])
                    shutdown()
                }
            }
        }
    }

    private func testFailure() {
        panic()
        report(["type": "self-test", "passed": false, "received": recorder.snapshot()])
        dispose()
        exit(EXIT_FAILURE)
    }
}

let isSelfTest = CommandLine.arguments.dropFirst().contains("--self-test")
let bridge = MidiBridge(testing: isSelfTest)
guard bridge.open() else { exit(EXIT_FAILURE) }
if isSelfTest {
    bridge.selfTest()
} else {
    DispatchQueue.global(qos: .userInitiated).async {
        while let line = readLine() {
            bridge.queue.async { bridge.command(line) }
        }
        bridge.queue.async { bridge.shutdown() }
    }
}
dispatchMain()
