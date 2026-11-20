import AppIntents
import SwiftUI

struct Todo: Codable, Identifiable {
    var id = UUID()
    var title: String
    var done = false
}

@MainActor
final class TodoStore: ObservableObject {
    static let shared = TodoStore()
    private static let key = "daylist.tasks"

    @Published private(set) var tasks: [Todo] {
        didSet {
            UserDefaults.standard.set(try? JSONEncoder().encode(tasks), forKey: Self.key)
        }
    }

    private init() {
        tasks = UserDefaults.standard.data(forKey: Self.key)
            .flatMap { try? JSONDecoder().decode([Todo].self, from: $0) } ?? []
    }

    func add(_ title: String) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        tasks.append(Todo(title: trimmed))
        return true
    }

    func toggle(_ id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].done.toggle()
    }

    func delete(at offsets: IndexSet) {
        tasks.remove(atOffsets: offsets)
    }
}

struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Task"

    @Parameter(title: "Task")
    var task: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        if TodoStore.shared.add(task) {
            return .result(dialog: "Task added.")
        }
        return .result(dialog: "Enter a task title.")
    }
}

struct DaylistShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: ["Add a task in \(.applicationName)"],
            shortTitle: "Add Task",
            systemImageName: "plus.circle"
        )
    }
}

@main
struct DaylistApp: App {
    var body: some Scene {
        WindowGroup {
            DaylistView(store: .shared)
        }
    }
}

struct DaylistView: View {
    @ObservedObject var store: TodoStore
    @State private var draft = ""
    @FocusState private var composing: Bool

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("New task", text: $draft)
                            .focused($composing)
                            .submitLabel(.done)
                            .onSubmit(addTask)
                        Button(action: addTask) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Add task")
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                Section {
                    if store.tasks.isEmpty {
                        ContentUnavailableView(
                            "No tasks yet",
                            systemImage: "checklist",
                            description: Text("Add something you want to get done.")
                        )
                    }
                    ForEach(store.tasks) { task in
                        Button {
                            store.toggle(task.id)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(task.done ? Color.accentColor : Color.secondary)
                                    .accessibilityHidden(true)
                                Text(task.title)
                                    .strikethrough(task.done)
                                    .foregroundStyle(task.done ? Color.secondary : Color.primary)
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(task.done ? "Completed" : "Open")
                    }
                    .onDelete(perform: store.delete)
                } header: {
                    Text("\(store.tasks.filter(\.done).count) of \(store.tasks.count) complete")
                }
            }
            .navigationTitle("Daylist")
            .tint(.teal)
        }
    }

    private func addTask() {
        guard store.add(draft) else { return }
        draft = ""
        composing = false
    }
}
