import Foundation

/// Layered agent pipeline: plan → memory → live lookup → answer.
enum AgentService {
    struct PreparedTurn {
        var messages: [ChatMessage]
        var toolCalls: [ToolCallInfo]
    }

    static func prepareTurn(
        history: [ChatMessage],
        userText: String,
        memoryBlock: String?,
        deviceId: String,
        onStatus: @MainActor @escaping (String) -> Void
    ) async -> PreparedTurn {
        let system = AgentPromptBuilder.systemPrompt(memoryBlock: memoryBlock)
        let historyMessages = AgentPromptBuilder.trimHistory(
            history.filter { !$0.isError && ($0.role == .user || $0.role == .assistant) }
        )
        var toolCalls: [ToolCallInfo] = []
        var finalMessages: [ChatMessage] = [
            ChatMessage(role: .system, content: system),
        ] + historyMessages + [
            ChatMessage(role: .user, content: userText),
        ]

        // Always-on live lookup when the turn needs fresh facts — invisible to the user as a "mode".
        if WebSearchService.shouldConsiderLookup(userText: userText) {
            await onStatus("Planning…")
            var query: String? = WebSearchService.planSearch(userText: userText)
            do {
                let decision = try await BackendClient.shared.chatComplete(
                    messages: [
                        ChatMessage(role: .system, content: AgentPromptBuilder.lookupDecisionSystem),
                        ChatMessage(role: .user, content: userText),
                    ],
                    deviceId: deviceId,
                    maxTokens: 250,
                    temperature: 0.1
                )
                if let decided = AgentPromptBuilder.parseSearchDecision(decision) {
                    query = decided
                } else if decision.uppercased().contains("NONE") {
                    query = nil
                }
            } catch {
                // Keep heuristic query if the planner call fails.
            }

            if let query, !query.isEmpty {
                await onStatus("Checking latest info…")
                let results = await WebSearchService.search(query: query)
                // Optional second pass for multi-part questions (agentic research).
                var merged = results
                if userText.lowercased().contains(" and ") || userText.contains(";") || userText.lowercased().contains("then ") {
                    await onStatus("Digging deeper…")
                    if let secondQ = AgentPromptBuilder.secondaryQuery(from: userText, primary: query) {
                        if let more = await WebSearchService.search(query: secondQ),
                           let existing = merged {
                            merged = SearchResult(
                                text: existing.text + "\n\n" + more.text,
                                items: Array((existing.items + more.items).prefix(6))
                            )
                        } else if merged == nil {
                            merged = await WebSearchService.search(query: secondQ)
                        }
                    }
                }
                let call: ToolCallInfo
                if let merged, !merged.items.isEmpty || !merged.text.isEmpty {
                    call = ToolCallInfo(
                        tool: "live_lookup",
                        query: query,
                        result: merged.text,
                        found: true,
                        sources: merged.items
                    )
                    let lookup = AgentPromptBuilder.lookupResultsBlock(
                        query: query,
                        body: merged.text,
                        found: true
                    )
                    finalMessages = [
                        ChatMessage(role: .system, content: system + lookup),
                    ] + historyMessages + [
                        ChatMessage(role: .user, content: userText),
                    ]
                } else {
                    call = ToolCallInfo(
                        tool: "live_lookup",
                        query: query,
                        result: "No results found.",
                        found: false,
                        sources: []
                    )
                    let lookup = AgentPromptBuilder.lookupResultsBlock(
                        query: query,
                        body: nil,
                        found: false
                    )
                    finalMessages = [
                        ChatMessage(role: .system, content: system + lookup),
                    ] + historyMessages + [
                        ChatMessage(role: .user, content: userText),
                    ]
                }
                toolCalls.append(call)
            }
        }

        return PreparedTurn(messages: finalMessages, toolCalls: toolCalls)
    }
}

/// Prompt architecture — persona / memory / tools as composable layers.
enum AgentPromptBuilder {
    static let persona = """
        Reasoning: medium

        You are Private AI — a private, agentic assistant on the user's iPhone. \
        You plan briefly, act (look up live facts when needed), then deliver a finished answer. \
        Sound like a sharp friend: confident, specific, warm, zero corporate fluff.

        AGENCY
        - Prefer doing the work over asking permission. If a clarifying question is needed, ask ONE sharp question — then still give your best draft.
        - For multi-step asks (research + draft + plan): silently outline 2–4 steps, then execute them in one reply with clear headings.
        - When live lookup results are present, treat them as ground truth for changing facts.
        - Use remembered user facts silently to personalize tone, examples, and priorities.
        - If the user asks to "do X then Y", structure the answer as Step 1 / Step 2 with the finished artifacts.

        FORMATTING (always)
        - Use Markdown: **bold** for key facts, short headings when useful, bullet lists for steps.
        - Use fenced code blocks with a language tag for code (` ```swift ` etc.).
        - Keep paragraphs short for phone reading. No preamble ("Sure!", "Great question"). No sign-off.

        HARD RULES
        1. NEVER say "visit this website", "check ESPN", "go to their site", or any variant. YOU are the answer.
        2. Never fabricate scores, prices, fixture times, or breaking news. Mark uncertainty clearly.
        3. Never mention "web search", "browsing", "Google", or that you used a tool — just answer with the facts.
        4. Memory: use it; don't recite it unless asked. Constraints beat preferences.
        5. Privacy posture: the product is confidential-compute private. Don't scare users about "leaving the device" for lookups.
        """

    static let lookupDecisionSystem = """
        Reasoning: low

        Decide if answering needs fresh/real-time facts (news, prices, scores, weather, schedules, \
        current events, anything that changes day to day). \
        Reply with ONLY one line:
        SEARCH: <tight search query>
        or
        NONE
        """

    static func datetimeBlock() -> String {
        let now = Date()
        let date = now.formatted(.dateTime.weekday(.wide).month(.wide).day().year())
        let time = now.formatted(.dateTime.hour().minute())
        return "\(date), \(time)"
    }

    static func systemPrompt(memoryBlock: String?) -> String {
        var system = persona + "\n\n## Current date and time\n\(datetimeBlock())"
        if let memoryBlock, !memoryBlock.isEmpty {
            system += """


            ## What I remember about this user
            Personalize silently. Prefer constraints and identity over trivia.
            \(memoryBlock)
            """
        }
        return system
    }

    static func lookupResultsBlock(query: String, body: String?, found: Bool) -> String {
        if found, let body {
            return """


            ## LIVE CONTEXT ("\(query)", fetched \(BackendClient.todayString()))
            \(body)

            Use this to answer directly. Extract names, scores, times, prices. Never tell the user to visit a website. Never mention that you looked this up.
            """
        }
        return """


            ## LIVE CONTEXT ("\(query)")
            No usable results. Answer from knowledge and say what's uncertain — one calm sentence if needed. Never mention a failed lookup.
            """
    }

    static func trimHistory(_ messages: [ChatMessage]) -> [ChatMessage] {
        var body = messages
        func size() -> Int { body.reduce(0) { $0 + $1.content.count } }

        while body.count > 2 && size() > 20_000 {
            body.removeFirst()
        }
        while body.count > 28 {
            body.removeFirst()
        }
        return body
    }

    static func parseSearchDecision(_ text: String) -> String? {
        for line in text.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.uppercased().hasPrefix("SEARCH:") {
                let q = trimmed.dropFirst(7).trimmingCharacters(in: .whitespacesAndNewlines)
                if !q.isEmpty { return String(q.prefix(200)) }
            }
            if trimmed.uppercased() == "NONE" { return nil }
        }
        return nil
    }

    /// Second lookup query for multi-part asks.
    static func secondaryQuery(from userText: String, primary: String) -> String? {
        let parts = userText
            .components(separatedBy: CharacterSet(charactersIn: ";"))
            .flatMap { $0.components(separatedBy: " and ") }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.count >= 12 }
        guard parts.count >= 2 else { return nil }
        let candidate = String(parts[1].prefix(160))
        if candidate.caseInsensitiveCompare(primary) == .orderedSame { return nil }
        return candidate
    }
}

struct ToolCallInfo: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var tool: String
    var query: String?
    var result: String
    var found: Bool
    var sources: [SearchItem]
}
