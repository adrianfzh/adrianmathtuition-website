import SwiftUI
import os

@MainActor
@Observable
final class LibraryModel {
    let store: NotebookStore
    private(set) var notebooks: [Notebook] = []
    private(set) var folders: [Folder] = []
    var selectedFolderID: UUID?
    var path: [UUID] = []
    var sort: LibrarySort {
        didSet { UserDefaults.standard.set(sort.rawValue, forKey: "librarySort") }
    }

    private let log = Logger(subsystem: "com.adrianmath.notebook", category: "library")

    init(store: NotebookStore) {
        self.store = store
        sort = LibrarySort(rawValue: UserDefaults.standard.string(forKey: "librarySort") ?? "") ?? .recent
        reload()
    }

    func reload() {
        do {
            notebooks = try store.loadNotebooks()
            folders = try store.loadFolders().sorted { $0.createdAt < $1.createdAt }
        } catch {
            log.error("load failed: \(error.localizedDescription)")
        }
    }

    var visibleNotebooks: [Notebook] {
        let list = notebooks.filter { selectedFolderID == nil || $0.folderID == selectedFolderID }
        switch sort {
        case .recent: return list.sorted { $0.updatedAt > $1.updatedAt }
        case .title: return list.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .created: return list.sorted { $0.createdAt > $1.createdAt }
        }
    }

    func notebook(id: UUID) -> Notebook? { notebooks.first { $0.id == id } }

    func folder(id: UUID?) -> Folder? { folders.first { $0.id == id } }

    // MARK: Notebooks

    @discardableResult
    func createNotebook(title: String, cover: CoverColor, paper: PaperStyle, folderID: UUID?) -> Notebook {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let nb = Notebook(title: clean.isEmpty ? "Untitled" : clean, cover: cover, paper: paper, folderID: folderID)
        persist(nb)
        return nb
    }

    /// A new notebook made from a PDF (a worksheet, a past paper): one page per PDF page,
    /// named after the file. Used by the Import button and by "Open in Notebook" from other apps.
    @discardableResult
    func importPDF(at url: URL, folderID: UUID?) throws -> Notebook {
        let name = url.deletingPathExtension().lastPathComponent
        var nb = Notebook(title: name.isEmpty ? "Untitled" : name, folderID: folderID)
        nb.pages = try PDFPages.importPDF(at: url, notebookID: nb.id, store: store)
        try store.saveNotebook(nb)
        didSave(nb)
        return nb
    }

    func update(_ notebook: Notebook, touch: Bool = true) {
        var nb = notebook
        if touch { nb.updatedAt = Date() }
        persist(nb)
    }

    /// Called by the editor after it saved; keeps the grid's details current.
    func didSave(_ notebook: Notebook) {
        if let i = notebooks.firstIndex(where: { $0.id == notebook.id }) {
            notebooks[i] = notebook
        } else {
            notebooks.append(notebook)
        }
    }

    func delete(_ notebook: Notebook) {
        do {
            try store.deleteNotebook(id: notebook.id)
            notebooks.removeAll { $0.id == notebook.id }
        } catch {
            log.error("delete failed: \(error.localizedDescription)")
        }
    }

    private func persist(_ nb: Notebook) {
        do {
            try store.saveNotebook(nb)
            didSave(nb)
        } catch {
            log.error("save failed: \(error.localizedDescription)")
        }
    }

    // MARK: Subjects (folders)

    func createFolder(name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        folders.append(Folder(name: clean))
        saveFolders()
    }

    func renameFolder(_ folder: Folder, to name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let i = folders.firstIndex(of: folder) else { return }
        folders[i].name = clean
        saveFolders()
    }

    /// Deleting a subject keeps its notebooks; they move back to "All".
    func deleteFolder(_ folder: Folder) {
        folders.removeAll { $0.id == folder.id }
        for nb in notebooks where nb.folderID == folder.id {
            var moved = nb
            moved.folderID = nil
            update(moved, touch: false)
        }
        if selectedFolderID == folder.id { selectedFolderID = nil }
        saveFolders()
    }

    private func saveFolders() {
        do { try store.saveFolders(folders) } catch {
            log.error("folders save failed: \(error.localizedDescription)")
        }
    }
}
