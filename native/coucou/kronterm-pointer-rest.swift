struct KronTermPointerRest {
    private var anchorX = 0.0
    private var anchorY = 0.0
    private var restingSince: Double?
    private var activated = false

    mutating func update(inside: Bool, x: Double, y: Double, time: Double) -> Bool {
        guard inside else {
            restingSince = nil
            activated = false
            return false
        }
        guard !activated else { return false }
        if restingSince == nil || (x - anchorX) * (x - anchorX) + (y - anchorY) * (y - anchorY) > 16 {
            anchorX = x
            anchorY = y
            restingSince = time
            return false
        }
        guard time - restingSince! >= 0.2 else { return false }
        activated = true
        return true
    }
}
