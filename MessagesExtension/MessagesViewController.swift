import UIKit
import Messages
import SwiftUI

@objc(MessagesViewController)
final class MessagesViewController: MSMessagesAppViewController {
    private let model = MessagesComposeModel()
    private var hosting: UIHostingController<MessagesRootView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        embedRoot()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        refresh(conversation: conversation)
    }

    override func didBecomeActive(with conversation: MSConversation) {
        super.didBecomeActive(with: conversation)
        refresh(conversation: conversation)
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        super.didSelect(message, conversation: conversation)
        refresh(conversation: conversation)
    }

    private func embedRoot() {
        let root = MessagesRootView(
            model: model,
            onSend: { [weak self] question, context, answer in
                self?.insertBubble(question: question, context: context, answer: answer)
            },
            onExpand: { [weak self] in
                self?.requestPresentationStyle(.expanded)
            }
        )
        let host = UIHostingController(rootView: root)
        hosting = host
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
    }

    private func refresh(conversation: MSConversation) {
        var contextBits: [String] = []
        if let selected = conversation.selectedMessage,
           let url = selected.url,
           let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems {
            if let q = items.first(where: { $0.name == "q" })?.value {
                contextBits.append("Earlier ask: \(q.removingPercentEncoding ?? q)")
            }
            if let a = items.first(where: { $0.name == "a" })?.value {
                contextBits.append("Earlier answer: \(a.removingPercentEncoding ?? a)")
            }
        }
        model.selectedContext = contextBits.joined(separator: "\n")
        model.participantCount = conversation.remoteParticipantIdentifiers.count + 1
    }

    private func insertBubble(question: String, context: String?, answer: String) {
        guard let conversation = activeConversation else { return }
        let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
        let layout = MSMessageTemplateLayout()
        layout.caption = "Private AI"
        layout.subcaption = String(question.prefix(80))
        layout.trailingCaption = "Answer"
        layout.trailingSubcaption = String(answer.prefix(120))
        message.layout = layout
        message.summaryText = "Private AI: \(String(question.prefix(40)))"

        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = "privateai.app"
        comps.path = "/i"
        comps.queryItems = [
            URLQueryItem(name: "q", value: String(question.prefix(500))),
            URLQueryItem(name: "a", value: String(answer.prefix(1500))),
        ]
        if let ctx = context, !ctx.isEmpty {
            comps.queryItems?.append(URLQueryItem(name: "c", value: String(ctx.prefix(400))))
        }
        message.url = comps.url

        conversation.insert(message) { [weak self] error in
            if error == nil {
                self?.dismiss()
                self?.requestPresentationStyle(.compact)
            }
        }
    }
}
