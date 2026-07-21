import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        extractAndOpen()
    }

    private func extractAndOpen() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let provider = item.attachments?.first
        else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        let finish: (String) -> Void = { [weak self] text in
            DispatchQueue.main.async { self?.openHost(text: text) }
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
                finish((data as? String) ?? "")
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                finish((data as? URL)?.absoluteString ?? "")
            }
            return
        }

        extensionContext?.completeRequest(returningItems: nil)
    }

    private func openHost(text: String) {
        var comps = URLComponents()
        comps.scheme = "privateai"
        comps.host = "share"
        comps.queryItems = [URLQueryItem(name: "sharedText", value: text)]
        guard let url = comps.url else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        extensionContext?.open(url, completionHandler: { [weak self] _ in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
    }
}
