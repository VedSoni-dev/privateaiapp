import SwiftUI

/// Renders assistant markdown with headings, lists, and fenced code blocks.
struct MarkdownMessageView: View {
    let text: String
    let colors: AppColors
    var isError: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(Self.parseBlocks(text).enumerated()), id: \.offset) { _, block in
                switch block {
                case .markdown(let md):
                    markdownText(md)
                case .code(let language, let code):
                    CodeFenceView(language: language, code: code, colors: colors)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func markdownText(_ md: String) -> some View {
        let trimmed = md.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            EmptyView()
        } else if let attributed = try? AttributedString(
            markdown: trimmed,
            options: AttributedString.MarkdownParsingOptions(
                interpretedSyntax: .full,
                failurePolicy: .returnPartiallyParsedIfPossible
            )
        ) {
            Text(Self.styled(attributed, colors: colors, isError: isError))
                .font(.body)
                .foregroundStyle(isError ? colors.error : colors.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(trimmed)
                .font(.body)
                .foregroundStyle(isError ? colors.error : colors.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private enum Block {
        case markdown(String)
        case code(language: String?, code: String)
    }

    private static func parseBlocks(_ raw: String) -> [Block] {
        var blocks: [Block] = []
        var markdownBuffer: [String] = []
        var inCode = false
        var codeLanguage: String?
        var codeLines: [String] = []

        func flushMarkdown() {
            let joined = markdownBuffer.joined(separator: "\n")
            if !joined.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                blocks.append(.markdown(joined))
            }
            markdownBuffer = []
        }

        for line in raw.components(separatedBy: .newlines) {
            if line.hasPrefix("```") {
                if inCode {
                    blocks.append(.code(language: codeLanguage, code: codeLines.joined(separator: "\n")))
                    inCode = false
                    codeLanguage = nil
                    codeLines = []
                } else {
                    flushMarkdown()
                    inCode = true
                    let lang = String(line.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
                    codeLanguage = lang.isEmpty ? nil : lang
                }
                continue
            }
            if inCode {
                codeLines.append(line)
            } else {
                markdownBuffer.append(line)
            }
        }

        if inCode {
            // Unclosed fence — treat remainder as code.
            blocks.append(.code(language: codeLanguage, code: codeLines.joined(separator: "\n")))
        } else {
            flushMarkdown()
        }

        return blocks.isEmpty ? [.markdown(raw)] : blocks
    }

    private static func styled(
        _ attributed: AttributedString,
        colors: AppColors,
        isError: Bool
    ) -> AttributedString {
        var result = attributed
        let base = isError ? colors.error : colors.textPrimary
        for run in result.runs {
            var attrs = AttributeContainer()
            attrs.foregroundColor = base
            if run.inlinePresentationIntent?.contains(.code) == true {
                attrs.backgroundColor = colors.elevated
                attrs.font = .body.monospaced()
            }
            result[run.range].mergeAttributes(attrs)
        }
        return result
    }
}

private struct CodeFenceView: View {
    let language: String?
    let code: String
    let colors: AppColors

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(language?.isEmpty == false ? language! : "Code")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(colors.textMuted)
                Spacer()
                Button {
                    UIPasteboard.general.string = code
                    Haptics.success()
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(colors.accent)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Copy code")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(colors.textPrimary)
                    .textSelection(.enabled)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colors.elevated.opacity(0.95), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(colors.border.opacity(0.7), lineWidth: 1)
        }
    }
}
