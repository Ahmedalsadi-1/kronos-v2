import Foundation
import SwiftUI

struct KronTermPalette: Identifiable, Decodable, Sendable {
    var id: String { name }
    let name: String
    let label: String
    let accent: String

    static let all: [KronTermPalette] = {
        guard let url = Bundle.main.url(forResource: "coucou-palettes", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let palettes = try? JSONDecoder().decode([KronTermPalette].self, from: data),
              !palettes.isEmpty else {
            return [KronTermPalette(name: "coucou", label: "Coucou", accent: "#967AFF")]
        }
        return palettes
    }()
}
