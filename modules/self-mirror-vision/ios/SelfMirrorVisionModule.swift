import ExpoModulesCore
import Vision

/// Looks at a photo on device (nothing is uploaded) and says what's in it, so a memory can caption itself.
public class SelfMirrorVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SelfMirrorVision")

    // Runs on the module's background queue; Vision's perform is synchronous.
    AsyncFunction("describe") { (uri: String) throws -> [String: Any] in
      guard let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri) else {
        return ["labels": [], "faces": 0]
      }
      let classify = VNClassifyImageRequest()
      let faces = VNDetectFaceRectanglesRequest()
      let handler = VNImageRequestHandler(url: url, options: [:])
      try handler.perform([classify, faces])

      let labels = (classify.results ?? [])
        .filter { $0.confidence >= 0.3 }
        .prefix(10)
        .map { ["id": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }
      return ["labels": Array(labels), "faces": faces.results?.count ?? 0]
    }
  }
}
