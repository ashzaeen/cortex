
import Foundation

private struct CortexErrorResponse: Decodable {
    let detail: String
}

struct CortexResponse: Decodable {
    let success: Bool
    let description: String
    let imageBytes: Int

    enum CodingKeys: String, CodingKey {
        case success
        case description
        case imageBytes = "image_bytes"
    }
}

enum CortexAPI {
    private static let requestTimeout: TimeInterval = 45

    private static var serverURL: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "CortexServerURL") as? String else {
            return nil
        }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? nil : trimmedValue
    }

    static func analyze(imageData: Data) async throws -> String {

        guard let serverURL, let url = URL(string: serverURL) else {
            throw CortexError.invalidURL
        }

        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        // On-device image analysis can legitimately take longer than URLSession's default timeout.
        request.timeoutInterval = requestTimeout

        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        var body = Data()

        body.append(Data("--\(boundary)\r\n".utf8))

        body.append(Data(
            "Content-Disposition: form-data; name=\"file\"; filename=\"frame.jpg\"\r\n".utf8
        ))

        body.append(Data(
            "Content-Type: image/jpeg\r\n\r\n".utf8
        ))

        body.append(imageData)

        body.append(Data(
            "\r\n--\(boundary)--\r\n".utf8
        ))

        request.httpBody = body

        print("CORTEX: Sending image to \(serverURL)")
        print("CORTEX: JPEG size = \(imageData.count) bytes")

        do {
            let (data, response) = try await URLSession.shared.data(
                for: request
            )

            print("CORTEX: Received server response")

            guard let httpResponse = response as? HTTPURLResponse else {
                throw CortexError.invalidResponse
            }

            print("CORTEX: HTTP status = \(httpResponse.statusCode)")

            guard (200...299).contains(httpResponse.statusCode) else {
                let details = (try? JSONDecoder().decode(CortexErrorResponse.self, from: data).detail)
                    ?? String(data: data, encoding: .utf8)
                    ?? "Unknown server error"

                if httpResponse.statusCode == 502 {
                    throw CortexError.analysisFailed(details)
                }

                throw CortexError.serverError(httpResponse.statusCode, details)
            }

            let result = try JSONDecoder().decode(
                CortexResponse.self,
                from: data
            )

            print("CORTEX: AI description received")

            return result.description

        } catch let urlError as URLError where urlError.code == .timedOut {
            print("CORTEX: Request timed out after \(Int(requestTimeout)) seconds")
            throw CortexError.requestTimedOut(requestTimeout)
        } catch let urlError as URLError {
            print("CORTEX: Request failed: \(urlError)")
            throw CortexError.network(urlError)
        } catch {
            print("CORTEX: Request failed: \(error)")
            throw error
        }
    }
}

enum CortexError: LocalizedError {
    case invalidURL
    case invalidResponse
    case requestTimedOut(TimeInterval)
    case network(URLError)
    case analysisFailed(String)
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Set CORTEX_SERVER_URL in the CameraAccess target's build settings."

        case .invalidResponse:
            return "Invalid Cortex server response"

        case .requestTimedOut(let timeout):
            return "Cortex did not respond within \(Int(timeout)) seconds. Verify the server is running and reachable."

        case .network(let error):
            return "Could not reach the Cortex server: \(error.localizedDescription)"

        case .analysisFailed(let details):
            return "The Cortex backend could not analyze the image: \(details)"

        case .serverError(let code, let details):
            return "Server error \(code): \(details)"
        }
    }
}
