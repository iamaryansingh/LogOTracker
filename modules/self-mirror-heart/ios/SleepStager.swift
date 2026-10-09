import Foundation

/// Live sleep staging from heart rate and beat-to-beat (RR) intervals, in the spirit of WHOOP's
/// HR/HRV-based staging. Runs natively on every Bluetooth reading, so it keeps going overnight
/// with the phone locked.
///
/// Each minute becomes an epoch (mean HR, HR spread, RMSSD). Against the night's own baselines:
/// - Awake: heart rate well above the sleeping baseline.
/// - Deep (slow-wave): lowest, steadiest heart rate (unless HRV is clearly depressed).
/// - REM: heart rate lifted above baseline and irregular (unless HRV is clearly calm).
/// - Light: everything in between.
/// Stages are smoothed over three minutes. A REM *period* starts after three REM minutes in a row,
/// no earlier than an hour into sleep, and at least an hour after the previous one began, matching
/// the ~90-minute rhythm of sleep cycles.
final class SleepStager {
  enum Stage: String { case awake, light, deep, rem }

  struct Epoch {
    let t: Date
    let hr: Double
    let spread: Double
    let rmssd: Double?
    /// This minute on its own, before smoothing.
    var raw: Stage
    var stage: Stage
  }

  private(set) var epochs: [Epoch] = []
  private(set) var onset: Date?
  private(set) var remPeriods: [Date] = []
  private var minuteStart: Date?
  private var minuteHR: [Double] = []
  private var minuteRR: [Double] = []
  private var remRun = 0
  let started = Date()

  /// Called when a new REM period begins, with its number (1 = first REM of the night).
  var onRemPeriod: ((Int) -> Void)?

  func add(bpm: Int, rr: [Double], at now: Date = Date()) {
    if minuteStart == nil { minuteStart = now }
    if bpm > 25 && bpm < 220 { minuteHR.append(Double(bpm)) }
    minuteRR.append(contentsOf: rr.filter { $0 >= 300 && $0 <= 2000 })
    if let start = minuteStart, now.timeIntervalSince(start) >= 60 { closeEpoch(at: start) }
  }

  var currentStage: Stage? { epochs.last?.stage }

  // MARK: - Epochs

  private func closeEpoch(at t: Date) {
    defer {
      minuteStart = nil
      minuteHR = []
      minuteRR = []
    }
    guard minuteHR.count >= 5 else { return }
    let hr = minuteHR.reduce(0, +) / Double(minuteHR.count)
    let spread = sqrt(minuteHR.map { ($0 - hr) * ($0 - hr) }.reduce(0, +) / Double(minuteHR.count))
    epochs.append(Epoch(t: t, hr: hr, spread: spread, rmssd: Self.rmssd(minuteRR), raw: .awake, stage: .awake))
    detectOnset()
    if onset != nil { classifyLatest() }
  }

  static func rmssd(_ rr: [Double]) -> Double? {
    guard rr.count > 1 else { return nil }
    var diffs: [Double] = []
    for i in 1..<rr.count {
      let d = rr[i] - rr[i - 1]
      if abs(d) <= 0.2 * rr[i - 1] { diffs.append(d) }
    }
    guard diffs.count >= 10 else { return nil }
    return sqrt(diffs.map { $0 * $0 }.reduce(0, +) / Double(diffs.count))
  }

  private static func median(_ xs: [Double]) -> Double? {
    guard !xs.isEmpty else { return nil }
    let s = xs.sorted()
    return s[s.count / 2]
  }

  private static func percentile(_ xs: [Double], _ p: Double) -> Double? {
    guard !xs.isEmpty else { return nil }
    let s = xs.sorted()
    return s[min(s.count - 1, Int(Double(s.count) * p))]
  }

  /// Asleep once the 10-minute average heart rate settles ~8% under the in-bed awake level and
  /// stays steady. Falls back to 25 minutes after tracking began.
  private func detectOnset() {
    guard onset == nil, epochs.count >= 10 else { return }
    let awakeRef = Self.median(epochs.prefix(5).map(\.hr)) ?? 70
    let window = epochs.suffix(10)
    let mean = window.map(\.hr).reduce(0, +) / Double(window.count)
    let calm = window.allSatisfy { $0.hr < awakeRef * 1.02 }
    if mean <= awakeRef * 0.92 && calm {
      // Asleep from the first minute the heart rate actually dropped.
      onset = window.first(where: { $0.hr <= awakeRef * 0.92 })?.t ?? window.first?.t
    } else if Date().timeIntervalSince(started) > 25 * 60 && epochs.count >= 25 {
      onset = epochs[epochs.count - 10].t
    }
  }

  private func classifyLatest() {
    guard let onset else { return }
    let asleep = epochs.filter { $0.t >= onset }
    guard let latest = asleep.last else { return }
    // Baselines from the night so far: the sleeping heart rate is a low percentile, not the mean.
    let baseline = Self.percentile(asleep.map(\.hr), 0.2) ?? latest.hr
    let typicalSpread = Self.median(asleep.map(\.spread)) ?? 1
    let typicalRmssd = Self.median(asleep.compactMap(\.rmssd))

    let window = Array(asleep.suffix(3))
    let rel = (window.map(\.hr).reduce(0, +) / Double(window.count)) / baseline
    var swing = 0.0
    if window.count > 1 { for i in 1..<window.count { swing += abs(window[i].hr - window[i - 1].hr) } }
    let irregular = (window.map(\.spread).reduce(0, +) / Double(window.count)) + swing / Double(max(window.count - 1, 1))
    let hrvRel = (latest.rmssd != nil && typicalRmssd != nil) ? latest.rmssd! / typicalRmssd! : nil

    let raw: Stage
    if rel > 1.25 || (latest.spread > 6 && rel > 1.15) {
      raw = .awake
    } else if rel >= 1.06 && irregular >= 1.3 * typicalSpread && (hrvRel ?? 1) < 1.4 {
      // Heart rate lifted and erratic. HRV only vetoes when it's clearly calm (parasympathetic).
      raw = .rem
    } else if rel <= 1.03 && irregular <= 0.8 * typicalSpread && (hrvRel ?? 1) > 0.75 {
      raw = .deep
    } else {
      raw = .light
    }
    epochs[epochs.count - 1].raw = raw

    // Smooth: the stage is the majority of the last three raw minutes (this one breaks ties).
    let recent = epochs.suffix(3).filter { $0.t >= onset }.map(\.raw)
    var votes: [Stage: Int] = [:]
    for st in recent { votes[st, default: 0] += 1 }
    let stage = (votes.first { $0.value >= 2 }?.key) ?? raw
    epochs[epochs.count - 1].stage = stage
    trackRem(stage: stage, at: latest.t, onset: onset)
  }

  private func trackRem(stage: Stage, at t: Date, onset: Date) {
    guard stage == .rem else {
      remRun = 0
      return
    }
    remRun += 1
    let intoSleep = t.timeIntervalSince(onset)
    let sinceLast = remPeriods.last.map { t.timeIntervalSince($0) } ?? .infinity
    // A new REM period: three REM minutes in a row, an hour into sleep, an hour after the last began.
    if remRun == 3 && intoSleep >= 60 * 60 && sinceLast >= 60 * 60 {
      remPeriods.append(t.addingTimeInterval(-2 * 60))
      onRemPeriod?(remPeriods.count)
    }
  }
}
