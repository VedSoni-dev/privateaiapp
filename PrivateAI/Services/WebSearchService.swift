import Foundation

struct SearchItem: Identifiable, Codable, Equatable {
    var id: String { url }
    let title: String
    let url: String
    let snippet: String
}

struct SearchResult: Equatable {
    let text: String
    let items: [SearchItem]
}

enum WebSearchService {
    static let workerURL = URL(string: "https://private-ai-search.vedantn06soni.workers.dev")!
    static let searchToken = "pai-search-v2-8f3a1c6d"

    private static let recencyPatterns: [NSRegularExpression] = {
        let patterns = [
            #"\b(latest|recent|recently|current|currently|today|tonight|now|nowadays|this (week|month|year)|yesterday|tomorrow|upcoming|just announced)\b"#,
            #"\b(news|headline|breaking|weather|temperature|forecast|price|cost|stock|market|score|standings|schedule|fixtures|release date)\b"#,
            #"\bworld cup\b|\belection\b|\bsuper bowl\b|\bolympics?\b|\bplayoffs?\b|\bchampionship\b|\bgame (score|result|today)\b"#,
            #"\b20(2[5-9]|[3-9]\d)\b"#,
        ]
        return patterns.compactMap { try? NSRegularExpression(pattern: $0, options: .caseInsensitive) }
    }()

    private static let conversational = try! NSRegularExpression(
        pattern: #"^(yes|no|yeah|nah|yep|nope|ok|okay|sure|right|exactly|same|definitely|actually|wait|but|oh|hmm|lol|haha|i know|i see|i think|got it|understood|fair|true|agreed)\b"#,
        options: .caseInsensitive
    )

    static func search(query: String) async -> SearchResult? {
        var request = URLRequest(url: workerURL.appendingPathComponent("search"))
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(searchToken, forHTTPHeaderField: "x-search-token")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["query": query])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            let text = String((json["text"] as? String ?? "").prefix(6500))
            let rawItems = json["items"] as? [[String: Any]] ?? []
            let items: [SearchItem] = rawItems.prefix(4).compactMap { item in
                guard let title = item["title"] as? String,
                      let url = item["url"] as? String else { return nil }
                return SearchItem(title: title, url: url, snippet: item["snippet"] as? String ?? "")
            }
            if text.isEmpty && items.isEmpty { return nil }
            return SearchResult(text: text, items: items)
        } catch {
            return nil
        }
    }

    /// Local recency heuristic — returns a query if search is worth trying.
    static func planSearch(userText: String) -> String? {
        let q = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 5 else { return nil }
        let words = q.split(separator: " ").count
        let range = NSRange(q.startIndex..., in: q)
        if words <= 10, !q.contains("?"), conversational.firstMatch(in: q, range: range) != nil {
            return nil
        }
        let needs = recencyPatterns.contains { $0.firstMatch(in: q, range: range) != nil }
        return needs ? String(q.prefix(200)) : nil
    }
}
