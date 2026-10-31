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
        let library = LibraryModel(store: store)
        #if DEBUG
        // UI tests: `-importPDF <path>` opens the app on a notebook made from that PDF
        // (the system file picker can't be driven from a test).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-importPDF"), args.indices.contains(i + 1),
           let nb = try? library.importPDF(at: URL(fileURLWithPath: args[i + 1]), folderID: nil) {
            library.path = [nb.id]
        }
        #endif
        _library = State(initialValue: library)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                // "Open in Notebook" from Files, WhatsApp, Mail…: the PDF becomes a new notebook.
                .onOpenURL { url in
                    guard url.isFileURL, let nb = try? library.importPDF(at: url, folderID: nil) else { return }
                    library.path = [nb.id]
                }
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
