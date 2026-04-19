import Foundation
import CoreLocation
import Combine

/// Privacy-first location client wrapping CLLocationManager.
/// Uses ONLY significant-change monitoring.
public class LocationService: NSObject, CLLocationManagerDelegate {
    public static let shared = LocationService()
    
    private let manager = CLLocationManager()
    
    // Publishers
    public let authorizationStatus = CurrentValueSubject<CLAuthorizationStatus, Never>(.notDetermined)
    public let locationUpdates = PassthroughSubject<CLLocation, Never>()
    
    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters // Save battery
        manager.distanceFilter = 500 // Only notify if moved 500m
        manager.pausesLocationUpdatesAutomatically = true
        manager.allowsBackgroundLocationUpdates = true
    }
    
    public func requestAuthorization() {
        manager.requestAlwaysAuthorization() // Needed for background proximity alerts
    }
    
    public func startMonitoring() {
        // As per PRD: Only use significant-change location service to preserve battery
        // and minimize GPS tracking.
        manager.startMonitoringSignificantLocationChanges()
    }
    
    public func stopMonitoring() {
        manager.stopMonitoringSignificantLocationChanges()
    }
    
    // MARK: - Delegate Methods
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus.send(manager.authorizationStatus)
    }
    
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        locationUpdates.send(location)
        
        // As soon as we get a significant location change, we ping the backend.
        // Nudge Backend will store this briefly (30s) and run proximity math.
        Task {
            do {
                let request = LocationCheckRequest(lat: location.coordinate.latitude, lng: location.coordinate.longitude)
                let encoder = JSONEncoder()
                let body = try encoder.encode(request)
                
                let response: LocationCheckResponse = try await APIClient.shared.request(
                    path: "/location/check",
                    method: "POST",
                    body: body
                )
                
                // Usually the backend pushes an APNs notification if there's a match.
                // We can also post the matches via local notification here if desired.
                print("Location Check Sent. Matches found: \(response.matches.count)")
            } catch {
                print("Failed to sync location to Nudge engine: \(error)")
            }
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("CLLocationManager Error: \(error.localizedDescription)")
    }
}
