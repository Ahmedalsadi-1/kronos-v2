import Foundation

enum KronTermJSON {
    static func decode<T: Decodable>(_ type: T.Type, from value: Any?) -> T? {
        // Invalid top-level objects raise an Objective-C exception that try? cannot catch.
        guard let value, JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
