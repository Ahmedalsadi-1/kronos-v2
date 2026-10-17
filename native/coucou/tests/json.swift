import Foundation

@main struct JSONRegression {
    struct Row: Decodable { let id: String }

    static func main() {
        for value: Any in [NSNull(), "invalid", 42, true] {
            precondition(KronTermJSON.decode(Row.self, from: value) == nil)
        }
        precondition(KronTermJSON.decode(Row.self, from: nil) == nil)
        precondition(KronTermJSON.decode(Row.self, from: ["id": NSNull()]) == nil)
        precondition(KronTermJSON.decode(Row.self, from: ["id": "widget"])?.id == "widget")
        precondition(KronTermJSON.decode([Row].self, from: [["id": "widget"]])?.count == 1)
        precondition(KronTermJSON.decode([Row].self, from: [])?.isEmpty == true)
        print("Native JSON payload regression passed")
    }
}
