import CoreBluetooth
import ExpoModulesCore
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// Live heart rate over Bluetooth's standard Heart Rate profile: WHOOP's "Heart Rate Broadcast",
/// chest straps, most gym monitors. Emits each reading with its beat-to-beat (RR) intervals.
public class SelfMirrorHeartModule: Module {
  private var monitor: HeartMonitor?
  /// Overnight smart alarm: staging runs here, natively, so it works with the phone locked.
  private var sleep: SleepStager?
  private var sleepTarget = 4
  private var smartAlarmAt: Date?
  private var fallbackId: UUID?
  private var fallbackAt: Date?
  private var smartId: UUID?

  private func ensureMonitor() {
    guard monitor == nil else { return }
    monitor = HeartMonitor(
      onRate: { [weak self] bpm, rr, device in
        self?.sleep?.add(bpm: bpm, rr: rr)
        self?.sendEvent("onHeartRate", ["bpm": bpm, "rr": rr, "device": device])
      },
      onStatus: { [weak self] status, device in
        self?.sendEvent("onStatus", ["status": status, "device": device ?? ""])
      }
    )
  }

  public func definition() -> ModuleDefinition {
    Name("SelfMirrorHeart")
    Events("onHeartRate", "onStatus", "onSleep")

    Function("start") { () in
      self.ensureMonitor()
      self.monitor?.start()
    }

    Function("stop") { () in
      // Overnight tracking keeps the connection; only an explicit stop of sleep ends it.
      if self.sleep == nil { self.monitor?.stop() }
    }

    /// Starts overnight tracking: wakes you 10 minutes into REM period `remCycle`, or at `latestWake` (epoch s) at the latest.
    AsyncFunction("startSleep") { (remCycle: Int, latestWake: Double) async -> String in
      self.sleepTarget = max(1, remCycle)
      self.smartAlarmAt = nil
      self.smartId = nil
      let stager = SleepStager()
      stager.onRemPeriod = { [weak self] n in self?.remPeriodBegan(n) }
      self.sleep = stager
      self.ensureMonitor()
      self.monitor?.start()
      // The safety net: an alarm at the latest wake time, in case the chosen REM never comes.
      let id = UUID()
      let latest = Date(timeIntervalSince1970: latestWake)
      let result = await scheduleAlarm(id: id, at: latest, title: "Time to wake up")
      if result == "ok" {
        self.fallbackId = id
        self.fallbackAt = latest
      }
      return result
    }

    AsyncFunction("stopSleep") { () async -> Void in
      // Alarms that haven't rung yet go with the session; ones that already rang are done anyway.
      if let id = self.fallbackId, let at = self.fallbackAt, at > Date() { cancelAlarm(id) }
      if let id = self.smartId, let at = self.smartAlarmAt, at > Date() { cancelAlarm(id) }
      self.fallbackId = nil
      self.fallbackAt = nil
      self.smartId = nil
      self.sleep = nil
      self.monitor?.stop()
    }

    Function("sleepStatus") { () -> [String: Any] in
      guard let s = self.sleep else { return ["active": false] }
      var out: [String: Any] = [
        "active": true,
        "started": s.started.timeIntervalSince1970,
        "target": self.sleepTarget,
        "remPeriods": s.remPeriods.map { $0.timeIntervalSince1970 },
        "epochs": s.epochs.suffix(720).map { ["t": $0.t.timeIntervalSince1970, "hr": $0.hr, "stage": $0.stage.rawValue] },
      ]
      if let o = s.onset { out["onset"] = o.timeIntervalSince1970 }
      if let st = s.currentStage { out["stage"] = st.rawValue }
      if let a = self.smartAlarmAt { out["alarmAt"] = a.timeIntervalSince1970 }
      if let f = self.fallbackAt { out["latestWake"] = f.timeIntervalSince1970 }
      return out
    }
  }

  /// The chosen REM period has begun: ring in 10 minutes, and drop the safety-net alarm.
  private func remPeriodBegan(_ n: Int) {
    sendEvent("onSleep", ["remPeriod": n])
    guard n == sleepTarget, smartAlarmAt == nil else { return }
    let at = Date().addingTimeInterval(10 * 60)
    smartAlarmAt = at
    let id = UUID()
    smartId = id
    Task {
      let result = await scheduleAlarm(id: id, at: at, title: "Waking you from REM")
      // The REM alarm replaces the safety net only when it comes first.
      if result == "ok", let fallback = self.fallbackId, let latest = self.fallbackAt, at < latest {
        cancelAlarm(fallback)
        self.fallbackId = nil
        self.fallbackAt = nil
      }
    }
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct SleepAlarmMetadata: AlarmMetadata {}
#endif

/// A plain AlarmKit alarm (rings like the Clock app's, even in Silent mode). "ok" or iOS's reason.
func scheduleAlarm(id: UUID, at date: Date, title: String) async -> String {
  #if canImport(AlarmKit)
  if #available(iOS 26.0, *) {
    do {
      let manager = AlarmManager.shared
      if manager.authorizationState == .notDetermined { _ = try await manager.requestAuthorization() }
      guard manager.authorizationState == .authorized else { return "denied" }
      let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
      let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop, secondaryButton: nil, secondaryButtonBehavior: nil)
      let attributes = AlarmAttributes<SleepAlarmMetadata>(
        presentation: AlarmPresentation(alert: alert),
        metadata: SleepAlarmMetadata(),
        tintColor: Color(red: 0.357, green: 0.557, blue: 0.490)
      )
      let config = AlarmManager.AlarmConfiguration<SleepAlarmMetadata>(
        countdownDuration: nil,
        schedule: .fixed(date),
        attributes: attributes,
        stopIntent: nil,
        secondaryIntent: nil,
        sound: .default
      )
      _ = try await manager.schedule(id: id, configuration: config)
      return "ok"
    } catch {
      return error.localizedDescription
    }
  }
  #endif
  return "unavailable"
}

func cancelAlarm(_ id: UUID) {
  #if canImport(AlarmKit)
  if #available(iOS 26.0, *) { try? AlarmManager.shared.cancel(id: id) }
  #endif
}

final class HeartMonitor: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  private static let hrService = CBUUID(string: "180D")
  private static let hrMeasurement = CBUUID(string: "2A37")

  private let onRate: (Int, [Double], String) -> Void
  private let onStatus: (String, String?) -> Void
  private let queue = DispatchQueue(label: "selfmirror.heart")
  private var central: CBCentralManager!
  private var peripheral: CBPeripheral?
  private var fallback: CBPeripheral?
  private var wanted = false

  init(onRate: @escaping (Int, [Double], String) -> Void, onStatus: @escaping (String, String?) -> Void) {
    self.onRate = onRate
    self.onStatus = onStatus
    super.init()
    central = CBCentralManager(delegate: self, queue: queue)
  }

  func start() {
    queue.async {
      self.wanted = true
      if self.central.state == .poweredOn { self.scan() } else { self.report(self.central.state) }
    }
  }

  func stop() {
    queue.async {
      self.wanted = false
      self.central.stopScan()
      if let p = self.peripheral { self.central.cancelPeripheralConnection(p) }
      self.peripheral = nil
      self.fallback = nil
      self.onStatus("stopped", nil)
    }
  }

  private func isWhoop(_ p: CBPeripheral) -> Bool { (p.name ?? "").lowercased().contains("whoop") }

  private func scan() {
    // A monitor already connected to this phone is used straight away.
    let connected = central.retrieveConnectedPeripherals(withServices: [Self.hrService])
    if let p = connected.first(where: isWhoop) ?? connected.first { connect(p); return }
    onStatus("scanning", nil)
    central.scanForPeripherals(withServices: [Self.hrService], options: nil)
    // Prefer a WHOOP; if none shows up soon, take whichever heart rate monitor was seen.
    queue.asyncAfter(deadline: .now() + 4) { [weak self] in
      guard let self, self.wanted, self.peripheral == nil, let p = self.fallback else { return }
      self.central.stopScan()
      self.connect(p)
    }
  }

  private func connect(_ p: CBPeripheral) {
    peripheral = p
    p.delegate = self
    onStatus("connecting", p.name)
    central.connect(p, options: nil)
  }

  private func report(_ state: CBManagerState) {
    switch state {
    case .poweredOff: onStatus("bluetooth-off", nil)
    case .unauthorized: onStatus("unauthorized", nil)
    case .unsupported: onStatus("unsupported", nil)
    default: onStatus("waiting", nil)
    }
  }

  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    if c.state == .poweredOn { if wanted && peripheral == nil { scan() } } else { report(c.state) }
  }

  func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    guard peripheral == nil else { return }
    if isWhoop(p) {
      c.stopScan()
      connect(p)
    } else if fallback == nil {
      fallback = p
    }
  }

  func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
    onStatus("connected", p.name)
    p.discoverServices([Self.hrService])
  }

  func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
    peripheral = nil
    onStatus("failed", p.name)
    if wanted { scan() }
  }

  func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
    peripheral = nil
    onStatus("disconnected", p.name)
    if wanted { scan() }
  }

  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    for s in p.services ?? [] where s.uuid == Self.hrService {
      p.discoverCharacteristics([Self.hrMeasurement], for: s)
    }
  }

  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    for ch in s.characteristics ?? [] where ch.uuid == Self.hrMeasurement {
      p.setNotifyValue(true, for: ch)
    }
  }

  /// Heart Rate Measurement (0x2A37): flags, bpm (8 or 16 bit), optional energy, optional RR intervals (1/1024 s).
  func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
    guard let data = ch.value, data.count >= 2 else { return }
    let b = [UInt8](data)
    let flags = b[0]
    var i = 1
    let bpm: Int
    if flags & 0x01 != 0, b.count >= 3 {
      bpm = Int(b[1]) | Int(b[2]) << 8
      i = 3
    } else {
      bpm = Int(b[1])
      i = 2
    }
    if flags & 0x08 != 0 { i += 2 }
    var rr: [Double] = []
    if flags & 0x10 != 0 {
      while i + 1 < b.count {
        rr.append(Double(Int(b[i]) | Int(b[i + 1]) << 8) / 1024.0 * 1000.0)
        i += 2
      }
    }
    onRate(bpm, rr, p.name ?? "Heart rate monitor")
  }
}
