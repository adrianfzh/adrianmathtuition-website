import SwiftUI

@main
struct NotebookAppMain: App {
    @State private var library: LibraryModel

    init() {
        let store = FileNotebookStore.makeDefault()
        // UI tests start from an empty library.
        if ProcessInfo.processInfo.arguments.contains("-resetStore") {
            try? FileManager.default.removeItem(at: store.root)
        }
        _library = State(initialValue: LibraryModel(store: store))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
        }
    }
}

struct RootView: View {
    @Environment(LibraryModel.self) private var library

    var body: some View {
        @Bindable var library = library
        NavigationStack(path: $library.path) {
            LibraryView()
                .navigationDestination(for: UUID.self) { id in
                    EditorView(notebookID: id)
                }
        }
    }
}
