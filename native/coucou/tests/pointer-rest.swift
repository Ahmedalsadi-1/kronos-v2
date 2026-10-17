@main struct PointerRestRegression {
    static func main() {
        var gate = KronTermPointerRest()
        precondition(!gate.update(inside: true, x: 0, y: 0, time: 0))
        precondition(!gate.update(inside: true, x: 1, y: 1, time: 0.19))
        precondition(gate.update(inside: true, x: 1, y: 1, time: 0.21))
        precondition(!gate.update(inside: true, x: 1, y: 1, time: 1))
        precondition(!gate.update(inside: false, x: 1, y: 1, time: 2))
        precondition(!gate.update(inside: true, x: 0, y: 0, time: 3))
        precondition(!gate.update(inside: true, x: 10, y: 0, time: 3.19))
        precondition(!gate.update(inside: true, x: 10, y: 0, time: 3.3))
        precondition(gate.update(inside: true, x: 10, y: 0, time: 3.4))
        print("Native pointer rest regression passed")
    }
}
