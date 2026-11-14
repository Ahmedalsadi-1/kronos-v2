import Foundation

@main struct AppearanceRegression {
    static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: "frontend/types/system-materials.json"))
        let palettes = try JSONSerialization.jsonObject(with: data) as! [String: [String: String]]
        for scheme in ["light", "dark"] {
            let payload: [String: Any] = ["colorScheme": scheme, "contrast": "high",
                "reducedTransparency": true, "reducedMotion": true, "materials": palettes[scheme]!]
            let appearance = KronTermJSON.decode(KronTermSystemAppearance.self, from: payload)
            precondition(appearance?.colorScheme == scheme)
            precondition(appearance?.materials.content == palettes[scheme]?["content"])
            precondition(appearance?.reducedTransparency == true)
            precondition(appearance?.reducedMotion == true)
        }
        precondition(KronTermJSON.decode(KronTermSystemAppearance.self, from: ["materials": NSNull()]) == nil)
        print("Native system appearance regression passed")
    }
}
