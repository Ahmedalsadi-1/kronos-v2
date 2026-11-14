import Foundation

struct KronTermSystemMaterials: Decodable {
    let content: String
    let window: String
    let bar: String
    let sidebar: String
    let popover: String
    let label: String
    let secondary: String
    let tertiary: String
    let separator: String
    let focus: String
    let danger: String
}

struct KronTermSystemAppearance: Decodable {
    let colorScheme: String
    let contrast: String
    let reducedTransparency: Bool
    let reducedMotion: Bool
    let materials: KronTermSystemMaterials
}
