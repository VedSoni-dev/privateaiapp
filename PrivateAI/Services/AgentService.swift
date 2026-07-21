import Foundation

/// Layered agent pipeline: persona → clock → memory → search → answer stream.
enum AgentService {
    struct PreparedTurn {
        var messages: [ChatMessage]
        var toolCalls: [ToolCallInfo]
    }

    static func prepareTurn(
        history: [ChatMessage],
        userText: String,
        webEnabled: Bool,
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

        if webEnabled, let heuristic = WebSearchService.planSearch(userText: userText) {
            await onStatus("Deciding…")
            var query: String? = nil
            do {
                let decision = try await BackendClient.shared.chatComplete(
                    messages: [
                        ChatMessage(role: .system, content: AgentPromptBuilder.searchDecisionSystem),
                        ChatMessage(role: .user, content: userText),
                    ],
                    deviceId: deviceId,
                    maxTokens: 250,
                    temperature: 0.1
                )
                query = AgentPromptBuilder.parseSearchDecision(decision) ?? nil
            } catch {
                query = heuristic
            }

            if let query, !query.isEmpty {
                await onStatus("Searching: \(query)")
                let results = await WebSearchService.search(query: query)
                let call: ToolCallInfo
                if let results, !results.items.isEmpty || !results.text.isEmpty {
                    call = ToolCallInfo(
                        tool: "web_search",
                        query: query,
                        result: results.text,
                        found: true,
                        sources: results.items
                    )
                    let searchSystem = AgentPromptBuilder.searchResultsBlock(
                        query: query,
                        body: results.text,
                        found: true
                    )
                    finalMessages = [
                        ChatMessage(role: .system, content: system + searchSystem),
                    ] + historyMessages + [
                        ChatMessage(role: .user, content: userText),
                    ]
                } else {
                    call = ToolCallInfo(
                        tool: "web_search",
                        query: query,
                        result: "No results found.",
                        found: false,
                        sources: []
                    )
                    let searchSystem = AgentPromptBuilder.searchResultsBlock(
                        query: query,
                        body: nil,
                        found: false
                    )
                    finalMessages = [
                        ChatMessage(role: .system, content: system + searchSystem),
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

/// Prompt architecture — keep persona / memory / tools as separate composable layers.
enum AgentPromptBuilder {
    static let persona = """
        Reasoning: low

        You are Private AI — a fast, direct assistant with a confidential-compute posture. \
        Answer like a sharp friend: confident, specific, no fluff. Sound natural on iPhone — \
        clear spoken cadence, short paragraphs, scannable structure.

        HARD RULES (never break these):
        1. NEVER say "visit ESPN", "check the website", "go to X for details", "see their site", or any variant. You ARE the answer.
        2. When web_search results are in the context: pull out the specific facts and state them directly.
        3. If search ran but results lack specific data: say what you know, cite sources, note what's missing.
        4. Never fabricate scores, fixture times, or prices. Make clear what is confirmed vs uncertain.
        5. Format: tight and scannable. Bullets for lists, bold for key facts. No preamble, no sign-off.
        6. Memory: use remembered facts silently when relevant. Do not recite the memory list unless asked.
        7. Respect constraints first (allergies, hard preferences, "never do X").
        """

    static let searchDecisionSystem = """
        Reasoning: low

        Decide if answering the user's message needs a web search for real-time info \
        (news, prices, scores, weather, current events, anything that changes day to day). \
        Reply with ONLY one line, no other text:
        SEARCH: <search query>
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
            Use only when it improves the answer. Prefer constraints and identity over trivia.
            \(memoryBlock)
            """
        }
        return system
    }

    static func searchResultsBlock(query: String, body: String?, found: Bool) -> String {
        if found, let body {
            return """


            ## WEB SEARCH RESULTS ("\(query)", fetched \(BackendClient.todayString()))
            \(body)

            You MUST use the above content to answer. Extract names, scores, times, prices directly from the text. NEVER tell the user to visit any website.
            """
        }
        return """


        ## Tool: web_search ("\(query)")
        Search returned no usable results. Tell the user you searched but got nothing, in one sentence.
        """
    }

    static func trimHistory(_ messages: [ChatMessage]) -> [ChatMessage] {
        var body = messages
        func size() -> Int { body.reduce(0) { $0 + $1.content.count } }

        // Keep recent turns dense; drop oldest pairs first.
        while body.count > 2 && size() > 20_000 {
            body.removeFirst()
        }
        // Soft cap on turn count for latency.
        while body.count > 24 {
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
}

struct ToolCallInfo: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var tool: String
    var query: String?
    var result: String
    var found: Bool
    var sources: [SearchItem]
}
