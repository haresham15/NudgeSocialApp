import Foundation
import UserNotifications
import UIKit

/// Manages APNs registration and handling of rich Category pushes (Vibe Checks).
public class PushNotificationManager: NSObject, UNUserNotificationCenterDelegate {
    public static let shared = PushNotificationManager()
    
    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }
    
    public func registerForPushNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            print("Permission granted: \(granted)")
            guard granted else { return }
            
            self.setupNotificationCategories()
            
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }
    
    private func setupNotificationCategories() {
        // Define Vibe Check actions
        let yesAction = UNNotificationAction(identifier: "ACTION_YES", title: "Yes!", options: .foreground)
        let maybeAction = UNNotificationAction(identifier: "ACTION_MAYBE_LATER", title: "Maybe Later", options: .foreground)
        let noAction = UNNotificationAction(identifier: "ACTION_NOT_TODAY", title: "Not Today", options: .destructive)
        
        let vibeCheckCategory = UNNotificationCategory(
            identifier: "NUDGE_VIBE_CHECK",
            actions: [yesAction, maybeAction, noAction],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "",
            options: .customDismissAction
        )
        
        UNUserNotificationCenter.current().setNotificationCategories([vibeCheckCategory])
    }
    
    // Delegate method called when user taps an action in a push notification
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        
        guard response.notification.request.content.categoryIdentifier == "NUDGE_VIBE_CHECK" else {
            completionHandler()
            return
        }
        
        let userInfo = response.notification.request.content.userInfo
        guard let nudgeId = userInfo["nudgeId"] as? String else {
            completionHandler()
            return
        }
        
        var vibeVal = ""
        switch response.actionIdentifier {
        case "ACTION_YES": vibeVal = "yes"
        case "ACTION_MAYBE_LATER": vibeVal = "maybe_later"
        case "ACTION_NOT_TODAY": vibeVal = "not_today"
        default:
            completionHandler()
            return
        }
        
        // POST to backend
        Task {
            let bodyJson = ["response": vibeVal]
            let data = try? JSONSerialization.data(withJSONObject: bodyJson)
            let _: EmptyResponse? = try? await APIClient.shared.request(
                path: "/nudges/\(nudgeId)/vibe",
                method: "POST",
                body: data
            )
            completionHandler()
        }
    }
}
