import Foundation

private struct PrivacyResponse: Decodable {
    let state: String
}

private struct MomentIngest: Encodable, Sendable {
    let ts: String
    let source: String
    let snapshotBase64: String?
    let videoBase64: String?

    enum CodingKeys: String, CodingKey {
        case ts
        case source
        case snapshotBase64 = "snapshot_base64"
        case videoBase64 = "video_base64"
    }
}

struct CortexMoment: Decodable {
    let id: String
    let caption: String?
    let snapshotURL: String?
    let videoURL: String?

    enum CodingKeys: String, CodingKey {
        case id
        case caption
        case snapshotURL = "snapshot_url"
        case videoURL = "video_url"
    }
}

private struct CortexErrorEnvelope: Decodable {
    let error: CortexServerError
}

private struct CortexServerError: Decodable {
    let code: String
    let message: String
}

enum CortexAPI {
    private static let requestTimeout: TimeInterval = 120
    private static let hostedAPIBaseURL = URL(string: "https://api-production-47227cba.up.railway.app")

    private static var apiBaseURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "CortexAPIBaseURL") as? String else {
            return hostedAPIBaseURL
        }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedValue.isEmpty {
            return hostedAPIBaseURL
        }
        guard !trimmedValue.isEmpty,
              let url = URL(string: trimmedValue),
              url.scheme != nil,
              url.host != nil else {
            return nil
        }

        return url
    }

    /// The shared key the backend requires on every route but /health (CORTEX_API_KEY build setting).
    /// Nil when it is empty or still the unexpanded "$(CORTEX_API_KEY)" placeholder, so a local build
    /// against an open backend sends no header.
    private static var apiKey: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "CortexAPIKey") as? String else {
            return nil
        }
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedValue.isEmpty || trimmedValue.hasPrefix("$(") {
            return nil
        }
        return trimmedValue
    }

    static func capturePhoto(imageData: Data) async throws -> CortexMoment {
        try await captureMoment(snapshotData: imageData, videoData: nil)
    }

    static func captureVideo(videoData: Data) async throws -> CortexMoment {
        try await captureMoment(snapshotData: nil, videoData: videoData)
    }

    private static func captureMoment(snapshotData: Data?, videoData: Data?) async throws -> CortexMoment {
        guard let apiBaseURL else {
            throw CortexError.invalidURL
        }

        let privacy = try await privacyState(baseURL: apiBaseURL)
        guard privacy == "capturing" else {
            throw CortexError.captureDisabled(privacy)
        }

        let timestamp = Date.ISO8601FormatStyle().format(Date())
        let encodedBody = try await Task.detached(priority: .userInitiated) {
            let body = MomentIngest(
                ts: timestamp,
                source: "glasses",
                snapshotBase64: snapshotData?.base64EncodedString(),
                videoBase64: videoData?.base64EncodedString()
            )
            return try JSONEncoder().encode(body)
        }.value

        var request = URLRequest(url: apiBaseURL.appending(path: "moments"))
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = encodedBody

        let data = try await perform(request)
        return try JSONDecoder().decode(CortexMoment.self, from: data)
    }

    private static func privacyState(baseURL: URL) async throws -> String {
        var request = URLRequest(url: baseURL.appending(path: "privacy"))
        request.timeoutInterval = 10

        let data = try await perform(request)
        return try JSONDecoder().decode(PrivacyResponse.self, from: data).state
    }

    private static func perform(_ request: URLRequest) async throws -> Data {
        var request = request
        if let apiKey {
            request.setValue(apiKey, forHTTPHeaderField: "X-Cortex-Key")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw CortexError.invalidResponse
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                let serverError = try? JSONDecoder().decode(CortexErrorEnvelope.self, from: data).error
                let message = serverError?.message
                    ?? String(data: data, encoding: .utf8)
                    ?? "Unknown server error"
                throw CortexError.serverError(httpResponse.statusCode, message)
            }

            return data
        } catch let urlError as URLError where urlError.code == .timedOut {
            throw CortexError.requestTimedOut
        } catch let urlError as URLError {
            throw CortexError.network(urlError)
        }
    }
}

enum CortexError: LocalizedError {
    case invalidURL
    case invalidResponse
    case captureDisabled(String)
    case requestTimedOut
    case network(URLError)
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Set CORTEX_API_URL in the CameraAccess target's build settings."

        case .invalidResponse:
            return "The Cortex API returned an invalid response."

        case .captureDisabled(let state):
            return "Capture is \(state.replacingOccurrences(of: "_", with: "-")); nothing was stored."

        case .requestTimedOut:
            return "Cortex did not finish processing the captured media in time."

        case .network(let error):
            return "Could not reach the Cortex API: \(error.localizedDescription)"

        case .serverError(401, _):
            return "Cortex rejected the app's key. Set CORTEX_API_KEY in the CameraAccess target's build settings."

        case .serverError(let code, let message):
            return "Cortex API error \(code): \(message)"
        }
    }
}
