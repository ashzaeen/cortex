import AVFoundation
import Observation
import Speech

enum VoiceAssistantState: Equatable {
  case idle
  case requestingPermission
  case listening
  case processing
  case speaking
  case unavailable(String)
}

@Observable
@MainActor
final class VoiceAssistant {
  private(set) var state: VoiceAssistantState = .idle
  private(set) var transcript = ""

  private let audioEngine = AVAudioEngine()
  private let speechRecognizer = SFSpeechRecognizer(locale: Locale.current)
  private let synthesizer = AVSpeechSynthesizer()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var silenceTask: Task<Void, Never>?
  private var onCommand: ((String) -> Void)?
  private var isTapInstalled = false

  var isListening: Bool { state == .listening }

  func start(onCommand: @escaping (String) -> Void) async {
    guard state == .idle || isUnavailable else { return }
    state = .requestingPermission
    transcript = ""

    guard await requestSpeechPermission() else {
      state = .unavailable("Allow Speech Recognition in Settings to use voice commands.")
      return
    }
    guard await requestMicrophonePermission() else {
      state = .unavailable("Allow Microphone access in Settings to use voice commands.")
      return
    }
    guard let speechRecognizer, speechRecognizer.isAvailable else {
      state = .unavailable("Speech recognition is temporarily unavailable.")
      return
    }

    do {
      try configureAudioSession()
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.shouldReportPartialResults = true
      request.contextualStrings = [
        "Cornea", "capture a photo", "take a picture", "what do you see", "analyze this",
      ]
      recognitionRequest = request
      self.onCommand = onCommand

      let inputNode = audioEngine.inputNode
      let format = inputNode.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        throw VoiceAssistantError.noAudioInput
      }
      removeAudioTapIfNeeded()
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
      }
      isTapInstalled = true
      audioEngine.prepare()
      try audioEngine.start()
      state = .listening

      recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
        Task { @MainActor in
          guard let self else { return }
          if let result {
            self.transcript = result.bestTranscription.formattedString
            self.scheduleSubmission()
            if result.isFinal {
              self.submitTranscript()
            }
          } else if error != nil {
            self.stop(submit: false)
            self.state = .unavailable("I couldn't understand that. Tap Ask Cornea and try again.")
          }
        }
      }
    } catch {
      stop(submit: false)
      state = .unavailable("Voice input could not start: \(error.localizedDescription)")
    }
  }

  func stop(submit: Bool = true) {
    if submit, !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      submitTranscript()
      return
    }
    teardownRecognition()
    state = .idle
  }

  func markProcessing() {
    state = .processing
  }

  func speak(_ text: String) {
    let spokenText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !spokenText.isEmpty else {
      state = .idle
      return
    }
    teardownRecognition()
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .spokenAudio,
        options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
      )
      try session.setActive(true)
    } catch {
      // AVSpeechSynthesizer can still use the system-selected output route.
    }

    state = .speaking
    let utterance = AVSpeechUtterance(string: spokenText)
    utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.language.languageCode?.identifier ?? "en-US")
    utterance.rate = 0.5
    synthesizer.stopSpeaking(at: .immediate)
    synthesizer.speak(utterance)

    let approximateDuration = max(1.2, min(12, Double(spokenText.count) / 14))
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(approximateDuration))
      guard let self, self.state == .speaking else { return }
      self.state = .idle
    }
  }

  private var isUnavailable: Bool {
    if case .unavailable = state { return true }
    return false
  }

  private func scheduleSubmission() {
    silenceTask?.cancel()
    silenceTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(1.3))
      guard !Task.isCancelled else { return }
      self?.submitTranscript()
    }
  }

  private func submitTranscript() {
    let command = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !command.isEmpty else {
      stop(submit: false)
      return
    }
    let handler = onCommand
    teardownRecognition()
    state = .processing
    handler?(command)
  }

  private func teardownRecognition() {
    silenceTask?.cancel()
    silenceTask = nil
    if audioEngine.isRunning {
      audioEngine.stop()
    }
    removeAudioTapIfNeeded()
    recognitionRequest?.endAudio()
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest = nil
    onCommand = nil
  }

  private func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
    )
    if let bluetoothInput = session.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
      try session.setPreferredInput(bluetoothInput)
    }
    try session.setActive(true)
  }

  private func removeAudioTapIfNeeded() {
    guard isTapInstalled else { return }
    audioEngine.inputNode.removeTap(onBus: 0)
    isTapInstalled = false
  }

  private func requestSpeechPermission() async -> Bool {
    await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status == .authorized)
      }
    }
  }

  private func requestMicrophonePermission() async -> Bool {
    if AVAudioApplication.shared.recordPermission == .granted { return true }
    return await withCheckedContinuation { continuation in
      AVAudioApplication.requestRecordPermission { granted in
        continuation.resume(returning: granted)
      }
    }
  }
}

private enum VoiceAssistantError: LocalizedError {
  case noAudioInput

  var errorDescription: String? {
    switch self {
    case .noAudioInput:
      "No microphone input is available. Reconnect the Ray-Bans or select an iPhone microphone."
    }
  }
}
