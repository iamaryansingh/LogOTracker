import CoreLocation
import ExpoModulesCore
import MapKit

private let categoryPrefix = "MKPOICategory"

private func describe(_ item: MKMapItem, from origin: CLLocation? = nil) -> [String: Any] {
  let mark = item.placemark
  var out: [String: Any] = [
    "name": item.name ?? mark.name ?? "Unnamed place",
    "latitude": mark.coordinate.latitude,
    "longitude": mark.coordinate.longitude,
  ]
  if let raw = item.pointOfInterestCategory?.rawValue {
    out["category"] = raw.hasPrefix(categoryPrefix) ? String(raw.dropFirst(categoryPrefix.count)) : raw
  }
  if let title = mark.title { out["address"] = title }
  if let area = mark.subLocality ?? mark.locality { out["locality"] = area }
  if let city = mark.locality ?? mark.subAdministrativeArea { out["city"] = city }
  if let origin, let here = mark.location { out["distance"] = here.distance(from: origin) }
  return out
}

/// Apple Maps lookups for memories: search by name, and what's around a spot (to tell a restaurant from a parking garage).
public class SelfMirrorPlacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SelfMirrorPlaces")

    AsyncFunction("search") { (query: String, latitude: Double?, longitude: Double?, promise: Promise) in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = [.pointOfInterest, .address]
      if let latitude, let longitude {
        request.region = MKCoordinateRegion(
          center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
          latitudinalMeters: 40_000,
          longitudinalMeters: 40_000
        )
      }
      let origin = latitude.flatMap { lat in longitude.map { CLLocation(latitude: lat, longitude: $0) } }
      DispatchQueue.main.async {
        MKLocalSearch(request: request).start { response, _ in
          promise.resolve((response?.mapItems ?? []).prefix(15).map { describe($0, from: origin) })
        }
      }
    }

    AsyncFunction("nearby") { (latitude: Double, longitude: Double, radius: Double, categories: [String]?, promise: Promise) in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let request = MKLocalPointsOfInterestRequest(center: center, radius: max(radius, 10))
      if let categories, !categories.isEmpty {
        request.pointOfInterestFilter = MKPointOfInterestFilter(
          including: categories.map { MKPointOfInterestCategory(rawValue: categoryPrefix + $0) }
        )
      }
      let origin = CLLocation(latitude: latitude, longitude: longitude)
      DispatchQueue.main.async {
        MKLocalSearch(request: request).start { response, _ in
          let items = (response?.mapItems ?? [])
            .map { describe($0, from: origin) }
            .sorted { ($0["distance"] as? Double ?? .infinity) < ($1["distance"] as? Double ?? .infinity) }
          promise.resolve(Array(items.prefix(10)))
        }
      }
    }
  }
}
