import Foundation

enum Legal {
    static let privacyURL = URL(string: "https://github.com/VedSoni-dev/privateaiapp/blob/main/PRIVACY.md")!
    static let termsURL = URL(string: "https://github.com/VedSoni-dev/privateaiapp/blob/main/TERMS.md")!
    static let appStoreURL = URL(string: "https://apps.apple.com/app/id6785089361")!
    static let appStoreDisplay = "apps.apple.com/app/id6785089361"

    static func reportContentURL(messageText: String) -> URL {
        let title = "Reported AI response"
        let snippet = messageText.count > 500 ? String(messageText.prefix(500)) + "…" : messageText
        let body = "Flagged from the app — please review:\n\n---\n\(snippet)\n---\n\n(What was wrong with it?)"
        var comps = URLComponents(string: "https://github.com/VedSoni-dev/privateaiapp/issues/new")!
        comps.queryItems = [
            URLQueryItem(name: "title", value: title),
            URLQueryItem(name: "body", value: body),
        ]
        return comps.url!
    }
}
