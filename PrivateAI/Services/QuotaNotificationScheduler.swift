import Foundation
import UserNotifications

@MainActor
enum QuotaNotificationScheduler {
    static let id = "quota-reset-daily"

    static func requestAndSchedule() async {
        let center = UNUserNotificationCenter.current()
        do {
            let ok = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            guard ok else { return }
        } catch {
            return
        }
        schedule()
    }

    static func schedule() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])

        var date = DateComponents()
        date.hour = 9
        date.minute = 0

        let content = UNMutableNotificationContent()
        content.title = "Private AI"
        content.body = "Your \(NetworkConfig.freeDailyLimit) free messages just refreshed. Ask something privately."
        content.sound = .default

        let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        center.add(request)
    }
}
