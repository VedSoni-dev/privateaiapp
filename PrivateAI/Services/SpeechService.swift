import AVFoundation
import Observation

/// On-device spoken replies — Siri-like read-aloud for assistant (and user) messages.
@MainActor
@Observable
final class SpeechService: NSObject {
    private(set) var isSpeaking = false
    private(set) var speakingMessageId: UUID?

    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String, messageId: UUID? = nil) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if isSpeaking, speakingMessageId == messageId {
            stop()
            return
        }

        stop()
        speakingMessageId = messageId

        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.language.languageCode?.identifier ?? "en-US")
            ?? AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        utterance.pitchMultiplier = 1.02
        utterance.preUtteranceDelay = 0.05

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            // Still attempt speak if session configuration fails.
        }

        isSpeaking = true
        synthesizer.speak(utterance)
        Haptics.light()
    }

    func stop() {
        guard synthesizer.isSpeaking || isSpeaking else {
            speakingMessageId = nil
            isSpeaking = false
            return
        }
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
        speakingMessageId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func toggle(_ text: String, messageId: UUID) {
        if isSpeaking, speakingMessageId == messageId {
            stop()
        } else {
            speak(text, messageId: messageId)
        }
    }
}

extension SpeechService: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.isSpeaking = false
            self.speakingMessageId = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.isSpeaking = false
            self.speakingMessageId = nil
        }
    }
}
