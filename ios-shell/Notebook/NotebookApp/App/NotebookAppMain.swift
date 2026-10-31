import SwiftUI

@main
struct NotebookAppMain: App {
    @State private var library: LibraryModel
    @State private var account: StudentAccount
    @State private var backup: NotebookBackup

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
            // `-seedHandwriting "line|line"`: working already written on page 1, under Q1(a).
            if let j = args.firstIndex(of: "-seedHandwriting"), args.indices.contains(j + 1) {
                let ink = DebugHandwriting.drawing(args[j + 1].components(separatedBy: "|"),
                                                   origin: CGPoint(x: 120, y: 250), lineHeight: 52)
                try? store.savePageData(ink.dataRepresentation(), notebookID: nb.id, pageID: nb.pages[0].id)
            }
        }
        #endif
        _library = State(initialValue: library)
        let account = StudentAccount()
        _account = State(initialValue: account)
        _backup = State(initialValue: NotebookBackup(store: store, library: library, account: account))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                .environment(account)
                .environment(backup)
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
    @Environment(NotebookBackup.self) private var backup
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var library = library
        NavigationStack(path: $library.path) {
            LibraryView()
                .navigationDestination(for: UUID.self) { id in
                    EditorView(notebookID: id)
                }
        }
        // Back to the front: fetch what changed on another device, send what changed here.
        .onChange(of: scenePhase) { _, phase in if phase == .active { backup.sync() } }
    }
}
