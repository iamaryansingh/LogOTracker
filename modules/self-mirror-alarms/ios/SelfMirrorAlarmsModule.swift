import ExpoModulesCore
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// A small bridge to AlarmKit: real alarms that ring like the Clock app's, even in Silent mode.
public class SelfMirrorAlarmsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SelfMirrorAlarms")

    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return true }
      #endif
      return false
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let manager = AlarmManager.shared
        let state = manager.authorizationState == .notDetermined
          ? try await manager.requestAuthorization()
          : manager.authorizationState
        switch state {
        case .authorized: return "authorized"
        case .denied: return "denied"
        default: return "notDetermined"
        }
      }
      #endif
      return "unavailable"
    }

    // Returns "ok", or iOS's reason when it refuses, so the app can say what went wrong.
    AsyncFunction("schedule") { (id: String, epochSeconds: Double, title: String) async -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else { return "bad id" }
        let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
        // A plain alarm: a snooze countdown would need a Live Activity widget extension.
        let alert = AlarmPresentation.Alert(
          title: LocalizedStringResource(stringLiteral: title),
          stopButton: stop,
          secondaryButton: nil,
          secondaryButtonBehavior: nil
        )
        let attributes = AlarmAttributes<SelfMirrorAlarmMetadata>(
          presentation: AlarmPresentation(alert: alert),
          metadata: SelfMirrorAlarmMetadata(),
          tintColor: Color(red: 0.357, green: 0.557, blue: 0.490)
        )
        let configuration = AlarmManager.AlarmConfiguration<SelfMirrorAlarmMetadata>(
          countdownDuration: nil,
          schedule: .fixed(Date(timeIntervalSince1970: epochSeconds)),
          attributes: attributes,
          stopIntent: nil,
          secondaryIntent: nil,
          sound: .default
        )
        do {
          _ = try await AlarmManager.shared.schedule(id: uuid, configuration: configuration)
          return "ok"
        } catch {
          return error.localizedDescription
        }
      }
      #endif
      return "unavailable"
    }

    // Alarms this app has scheduled, straight from AlarmKit (iOS keeps them out of the Clock app).
    Function("list") { () -> [[String: Any]] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let alarms = (try? AlarmManager.shared.alarms) ?? []
        return alarms.map { alarm in
          var out: [String: Any] = ["id": alarm.id.uuidString, "state": String(describing: alarm.state)]
          if case .fixed(let date)? = alarm.schedule { out["time"] = date.timeIntervalSince1970 }
          return out
        }
      }
      #endif
      return []
    }

    AsyncFunction("cancel") { (id: String) throws -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else { return false }
        try AlarmManager.shared.cancel(id: uuid)
        return true
      }
      #endif
      return false
    }
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct SelfMirrorAlarmMetadata: AlarmMetadata {}
#endif
