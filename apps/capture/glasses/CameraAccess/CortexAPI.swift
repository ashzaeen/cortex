import Foundation

private struct PrivacyResponse: Decodable {
    let state: String
}

private struct MomentIngest: Encodable {
    let ts: String
    let source: String
    let snapshotBase64: String

    enum CodingKeys: String, CodingKey {
        case ts
        case source
        case snapshotBase64 = "snapshot_base64"
    }
}

struct CortexMoment: Decodable {
    let id: String
    let caption: String?
    let snapshotURL: String?

    enum CodingKeys: String, CodingKey {
        case id
        case caption
        case snapshotURL = "snapshot_url"
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
    private static let requestTimeout: TimeInterval = 60

    private static var apiBaseURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "CortexAPIBaseURL") as? String else {
            return nil
        }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedValue.isEmpty,
              let url = URL(string: trimmedValue),
              url.scheme != nil,
              url.host != nil else {
            return nil
        }

        return url
    }

    static func captureMoment(imageData: Data) async throws -> CortexMoment {
        guard let apiBaseURL else {
            throw CortexError.invalidURL
        }

        let privacy = try await privacyState(baseURL: apiBaseURL)
        guard privacy == "capturing" else {
            throw CortexError.captureDisabled(privacy)
        }

        let body = MomentIngest(
            ts: Date.ISO8601FormatStyle().format(Date()),
            source: "glasses",
            snapshotBase64: imageData.base64EncodedString()
        )

        var request = URLRequest(url: apiBaseURL.appending(path: "moments"))
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

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
            return "Cortex did not finish processing the image in time."

        case .network(let error):
            return "Could not reach the Cortex API: \(error.localizedDescription)"

        case .serverError(let code, let message):
            return "Cortex API error \(code): \(message)"
        }
    }
}
