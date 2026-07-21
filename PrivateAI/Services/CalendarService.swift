import Foundation
import EventKit
import UIKit

enum CalendarService {
    @MainActor
    static func presentAddEvent(from text: String) {
        let store = EKEventStore()
        Task {
            let granted: Bool
            if #available(iOS 17.0, *) {
                granted = (try? await store.requestWriteOnlyAccessToEvents()) ?? false
            } else {
                granted = await withCheckedContinuation { cont in
                    store.requestAccess(to: .event) { ok, _ in cont.resume(returning: ok) }
                }
            }
            guard granted else { return }
            let event = EKEvent(eventStore: store)
            event.title = String(text.prefix(80))
            event.notes = text
            event.startDate = Date().addingTimeInterval(3600)
            event.endDate = event.startDate.addingTimeInterval(3600)
            event.calendar = store.defaultCalendarForNewEvents
            // Write-only path: save a draft-like event the user can edit in Calendar.
            try? store.save(event, span: .thisEvent, commit: true)
            if let url = URL(string: "calshow:\(event.startDate.timeIntervalSinceReferenceDate)") {
                await UIApplication.shared.open(url)
            }
        }
    }
}
