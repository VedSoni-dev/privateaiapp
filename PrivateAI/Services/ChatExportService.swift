import Foundation
import CryptoKit
import UniformTypeIdentifiers

enum ChatExportService {
    struct Payload: Codable {
        var exportedAt: Date
        var sessions: [ChatSession]
    }

    /// Encrypts chat JSON with a passphrase (AES-GCM, key from SHA256).
    static func exportEncrypted(sessions: [ChatSession], passphrase: String) throws -> Data {
        let payload = Payload(exportedAt: .now, sessions: sessions.filter { !$0.isGhost })
        let json = try JSONEncoder().encode(payload)
        let key = SymmetricKey(data: SHA256.hash(data: Data(passphrase.utf8)))
        let sealed = try AES.GCM.seal(json, using: key)
        guard let combined = sealed.combined else {
            throw ExportError.sealFailed
        }
        return combined
    }

    static func decrypt(data: Data, passphrase: String) throws -> Payload {
        let key = SymmetricKey(data: SHA256.hash(data: Data(passphrase.utf8)))
        let box = try AES.GCM.SealedBox(combined: data)
        let plain = try AES.GCM.open(box, using: key)
        return try JSONDecoder().decode(Payload.self, from: plain)
    }

    enum ExportError: LocalizedError {
        case sealFailed
        var errorDescription: String? { "Couldn’t encrypt the archive." }
    }
}
