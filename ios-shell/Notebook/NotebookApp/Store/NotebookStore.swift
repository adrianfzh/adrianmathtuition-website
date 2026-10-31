import Foundation

/// Where notebooks are kept. v1 = files on the device (`FileNotebookStore`).
/// A later version adds a syncing store (same calls, plus upload/download) without
/// touching the screens. Ink is passed as opaque `Data` (PKDrawing's own format),
/// so a store never needs PencilKit.
protocol NotebookStore: Sendable {
    func loadNotebooks() throws -> [Notebook]
    /// Saves the notebook's details and page list. Page files no longer in the list are removed.
    func saveNotebook(_ notebook: Notebook) throws
    func deleteNotebook(id: UUID) throws

    func loadPageData(notebookID: UUID, pageID: UUID) throws -> Data?
    func savePageData(_ data: Data, notebookID: UUID, pageID: UUID) throws
    func deletePageData(notebookID: UUID, pageID: UUID) throws

    /// Imported PDFs: kept whole, once per notebook. Removed when no page uses them.
    func saveDocument(_ data: Data, notebookID: UUID, documentID: UUID) throws
    func documentURL(notebookID: UUID, documentID: UUID) -> URL

    func loadFolders() throws -> [Folder]
    func saveFolders(_ folders: [Folder]) throws
}

/// Layout on disk:
///   <root>/folders.json
///   <root>/Notebooks/<notebook-id>/notebook.json
///   <root>/Notebooks/<notebook-id>/pages/<page-id>.drawing   (PKDrawing.dataRepresentation())
///   <root>/Notebooks/<notebook-id>/documents/<document-id>.pdf   (imported PDFs, as given)
final class FileNotebookStore: NotebookStore {
    let root: URL

    init(root: URL) {
        self.root = root
    }

    static func makeDefault() -> FileNotebookStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return FileNotebookStore(root: base.appendingPathComponent("Notebooks", isDirectory: true))
    }

    private var fm: FileManager { .default }
    private var notebooksDir: URL { root.appendingPathComponent("Notebooks", isDirectory: true) }
    /// A notebook's folder (backup reads and replaces it whole).
    func folderURL(notebookID: UUID) -> URL { dir(notebookID) }
    private func dir(_ id: UUID) -> URL { notebooksDir.appendingPathComponent(id.uuidString, isDirectory: true) }
    private func pagesDir(_ id: UUID) -> URL { dir(id).appendingPathComponent("pages", isDirectory: true) }
    private func documentsDir(_ id: UUID) -> URL { dir(id).appendingPathComponent("documents", isDirectory: true) }
    private func pageURL(_ nb: UUID, _ page: UUID) -> URL {
        pagesDir(nb).appendingPathComponent("\(page.uuidString).drawing")
    }

    private static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .secondsSince1970
        return e
    }

    private static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        return d
    }

    func loadNotebooks() throws -> [Notebook] {
        guard fm.fileExists(atPath: notebooksDir.path) else { return [] }
        let dirs = try fm.contentsOfDirectory(at: notebooksDir, includingPropertiesForKeys: nil)
        return dirs.compactMap { d in
            let url = d.appendingPathComponent("notebook.json")
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? Self.decoder().decode(Notebook.self, from: data)
        }
    }

    func saveNotebook(_ notebook: Notebook) throws {
        try fm.createDirectory(at: pagesDir(notebook.id), withIntermediateDirectories: true)
        let data = try Self.encoder().encode(notebook)
        try data.write(to: dir(notebook.id).appendingPathComponent("notebook.json"), options: .atomic)
        // Remove ink files for pages that were deleted.
        let keep = Set(notebook.pages.map { "\($0.id.uuidString).drawing" })
        for file in (try? fm.contentsOfDirectory(atPath: pagesDir(notebook.id).path)) ?? []
        where !keep.contains(file) {
            try? fm.removeItem(at: pagesDir(notebook.id).appendingPathComponent(file))
        }
        // …and PDFs no page uses any more.
        let docs = Set(notebook.documentIDs.map { "\($0.uuidString).pdf" })
        for file in (try? fm.contentsOfDirectory(atPath: documentsDir(notebook.id).path)) ?? []
        where !docs.contains(file) {
            try? fm.removeItem(at: documentsDir(notebook.id).appendingPathComponent(file))
        }
    }

    func saveDocument(_ data: Data, notebookID: UUID, documentID: UUID) throws {
        try fm.createDirectory(at: documentsDir(notebookID), withIntermediateDirectories: true)
        try data.write(to: documentURL(notebookID: notebookID, documentID: documentID), options: .atomic)
    }

    func documentURL(notebookID: UUID, documentID: UUID) -> URL {
        documentsDir(notebookID).appendingPathComponent("\(documentID.uuidString).pdf")
    }

    func deleteNotebook(id: UUID) throws {
        if fm.fileExists(atPath: dir(id).path) { try fm.removeItem(at: dir(id)) }
    }

    func loadPageData(notebookID: UUID, pageID: UUID) throws -> Data? {
        let url = pageURL(notebookID, pageID)
        guard fm.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    func savePageData(_ data: Data, notebookID: UUID, pageID: UUID) throws {
        try fm.createDirectory(at: pagesDir(notebookID), withIntermediateDirectories: true)
        try data.write(to: pageURL(notebookID, pageID), options: .atomic)
    }

    func deletePageData(notebookID: UUID, pageID: UUID) throws {
        let url = pageURL(notebookID, pageID)
        if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
    }

    func loadFolders() throws -> [Folder] {
        let url = root.appendingPathComponent("folders.json")
        guard let data = try? Data(contentsOf: url) else { return [] }
        return try Self.decoder().decode([Folder].self, from: data)
    }

    func saveFolders(_ folders: [Folder]) throws {
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        try Self.encoder().encode(folders).write(to: root.appendingPathComponent("folders.json"), options: .atomic)
    }
}
