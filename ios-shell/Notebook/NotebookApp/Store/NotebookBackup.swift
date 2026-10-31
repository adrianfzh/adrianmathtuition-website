import CryptoKit
import Foundation
import PencilKit
import os

/// Keeps the student's notebooks on our server, under their website account
/// (SPEC-STUDENT-APP.md §0d). A lost or new iPad signs in and gets everything back;
/// a second device opens the same notebooks.
///
/// How it works, on every library visit and when the app comes back to the front:
///   1. notebooks deleted here are deleted on the server (kept in a list until that works);
///   2. the server's list is compared with the iPad's, notebook by notebook, by when each last
///      changed: newer on the server → fetched; newer here, or not on the server → sent;
///      deleted on the server and not touched here since → deleted here;
///   3. subjects (folders) the same way, as one list.
/// Sending sends only the files that changed (each file's SHA-256 is compared on the server);
/// fetching copies unchanged files from the iPad and downloads the rest.
/// The notebook open in the editor is never replaced underneath it.
@MainActor
@Observable
final class NotebookBackup {
    enum State: Equatable {
        /// Not signed in, or backup isn't open to this account.
        case off
        case working
        case done(Date)
        case failed(String)
    }

    private(set) var state: State = .off

    @ObservationIgnored private let store: FileNotebookStore
    @ObservationIgnored private let library: LibraryModel
    @ObservationIgnored private let account: StudentAccount
    @ObservationIgnored private var record: Record
    @ObservationIgnored private var running = false
    @ObservationIgnored private var again = false
    @ObservationIgnored private let log = Logger(subsystem: "com.adrianmath.notebook", category: "backup")

    /// What the iPad remembers between runs (`<root>/backup.json`).
    struct Record: Codable {
        var pendingDeletes: [UUID] = []
        /// When the subjects last changed here, and the server's time for the list we last agreed on.
        var foldersChangedAt: Double = 0
        var foldersAgreedAt: Double = 0
    }

    init(store: FileNotebookStore, library: LibraryModel, account: StudentAccount) {
        self.store = store
        self.library = library
        self.account = account
        record = (try? Data(contentsOf: store.root.appendingPathComponent("backup.json")))
            .flatMap { try? JSONDecoder().decode(Record.self, from: $0) } ?? Record()
        library.onDeleted = { [weak self] id in self?.notebookDeleted(id) }
        library.onFoldersChanged = { [weak self] in self?.foldersChanged() }
    }

    func notebookDeleted(_ id: UUID) {
        if !record.pendingDeletes.contains(id) { record.pendingDeletes.append(id) }
        saveRecord()
        sync()
    }

    func foldersChanged() {
        record.foldersChangedAt = Date().timeIntervalSince1970
        saveRecord()
        sync()
    }

    /// Starts a run (or queues one more if a run is going).
    func sync() {
        guard account.isSignedIn else { state = .off; return }
        if running { again = true; return }
        running = true
        Task {
            repeat {
                again = false
                await run()
            } while again
            running = false
        }
    }

    // MARK: One run

    private struct ListReply: Decodable {
        struct Item: Decodable { var id: String; var title: String; var updatedAt: Double; var deleted: Bool }
        var notebooks: [Item]
        struct Subject: Decodable { var id: String; var name: String; var createdAt: Double }
        var folders: [Subject]?
        var foldersUpdatedAt: Double?
    }
    private struct OK: Decodable {}
    private struct FoldersSaved: Decodable { var updatedAt: Double }

    private func run() async {
        state = .working
        do {
            for id in record.pendingDeletes {
                let _: OK = try await account.call("DELETE", "/api/app/notebooks/\(id.uuidString)")
                record.pendingDeletes.removeAll { $0 == id }
                saveRecord()
            }

            let list: ListReply = try await account.call("GET", "/api/app/notebooks")
            let local = Dictionary(uniqueKeysWithValues: try store.loadNotebooks().map { ($0.id, $0) })
            let open = Set(library.path)
            var changedHere = false
            var onServer = Set<UUID>()

            for item in list.notebooks {
                guard let id = UUID(uuidString: item.id) else { continue }
                onServer.insert(id)
                if open.contains(id) { continue }
                let here = local[id]?.updatedAt.timeIntervalSince1970
                if item.deleted {
                    guard let here else { continue }
                    if here <= item.updatedAt + 1 {
                        try store.deleteNotebook(id: id)
                        changedHere = true
                    } else if let nb = local[id] {
                        try await send(nb) // written on here after it was deleted elsewhere: keep it
                    }
                } else if here == nil || item.updatedAt > here! + 0.5 {
                    try await fetch(id)
                    changedHere = true
                } else if here! > item.updatedAt + 0.5, let nb = local[id] {
                    try await send(nb)
                }
            }
            for nb in local.values where !onServer.contains(nb.id) && !open.contains(nb.id) {
                try await send(nb)
            }

            // Subjects: an unsent change here wins; otherwise a newer list on the server is taken.
            let serverAt = list.foldersUpdatedAt ?? 0
            if record.foldersChangedAt > record.foldersAgreedAt || (list.folders == nil && !library.folders.isEmpty) {
                let saved: FoldersSaved = try await account.call("PUT", "/api/app/notebooks", [
                    "folders": library.folders.map { ["id": $0.id.uuidString, "name": $0.name, "createdAt": $0.createdAt.timeIntervalSince1970] },
                ])
                record.foldersAgreedAt = max(saved.updatedAt, record.foldersChangedAt)
                saveRecord()
            } else if let folders = list.folders, serverAt > record.foldersAgreedAt {
                try store.saveFolders(folders.compactMap { f in
                    UUID(uuidString: f.id).map { Folder(id: $0, name: f.name, createdAt: Date(timeIntervalSince1970: f.createdAt)) }
                })
                record.foldersAgreedAt = serverAt
                saveRecord()
                changedHere = true
            }

            if changedHere { library.reload() }
            state = .done(Date())
        } catch StudentAccount.CheckError.forbidden {
            state = .off // backup isn't open to this account yet
        } catch StudentAccount.CheckError.signedOut {
            state = .off
        } catch {
            log.error("backup failed: \(error.localizedDescription)")
            state = .failed(error.localizedDescription)
        }
    }

    // MARK: Sending and fetching one notebook

    private struct FileEntry { var path: String; var url: URL; var size: Int; var sha256: String }

    /// The files that make up a notebook now: its details, each page's writing, each PDF it uses,
    /// and a picture of each written page for the website (made again when the page changed).
    private func files(of nb: Notebook) throws -> [FileEntry] {
        let dir = store.folderURL(notebookID: nb.id)
        try refreshPictures(nb, dir: dir)
        var paths = ["notebook.json"]
        for page in nb.pages {
            paths.append("pages/\(page.id.uuidString).drawing")
            paths.append("previews/\(page.id.uuidString).jpg")
        }
        paths += nb.documentIDs.map { "documents/\($0.uuidString).pdf" }
        return try paths.compactMap { path in
            let url = dir.appendingPathComponent(path)
            guard FileManager.default.fileExists(atPath: url.path) else { return nil } // a page never written on
            let data = try Data(contentsOf: url)
            return FileEntry(path: path, url: url, size: data.count, sha256: Self.sha256(data))
        }
    }

    /// previews/<page>.jpg for every page with writing, redrawn when the writing (or, for a checked
    /// page, the notebook's details, which hold the red pen) is newer than the picture.
    private func refreshPictures(_ nb: Notebook, dir: URL) throws {
        let fm = FileManager.default
        let previews = dir.appendingPathComponent("previews", isDirectory: true)
        try fm.createDirectory(at: previews, withIntermediateDirectories: true)
        func modified(_ url: URL) -> Date? { (try? fm.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date }
        let detailsChanged = modified(dir.appendingPathComponent("notebook.json")) ?? .distantPast
        let documents = PDFDocuments(notebookID: nb.id, store: store)
        var keep = Set<String>()
        for page in nb.pages {
            let ink = dir.appendingPathComponent("pages/\(page.id.uuidString).drawing")
            let pic = previews.appendingPathComponent("\(page.id.uuidString).jpg")
            guard let inkChanged = modified(ink) else { continue }
            keep.insert(pic.lastPathComponent)
            let picMade = modified(pic) ?? .distantPast
            guard picMade < inkChanged || (page.check != nil && picMade < detailsChanged) else { continue }
            let drawing = (try? PKDrawing(data: Data(contentsOf: ink))) ?? PKDrawing()
            let jpeg = PagePicture.jpeg(drawing: drawing, paper: nb.paper,
                                        pdfPage: page.background.flatMap(documents.page), check: page.check)
            try jpeg?.write(to: pic, options: .atomic)
        }
        for file in (try? fm.contentsOfDirectory(atPath: previews.path)) ?? [] where !keep.contains(file) {
            try? fm.removeItem(at: previews.appendingPathComponent(file))
        }
    }

    private struct Prepared: Decodable {
        struct Target: Decodable { var path: String; var url: String }
        var send: [Target]
    }

    private func send(_ nb: Notebook) async throws {
        let entries = try files(of: nb)
        let manifest = entries.map { ["path": $0.path, "size": $0.size, "sha256": $0.sha256] as [String: Any] }
        let id = nb.id.uuidString
        let prepared: Prepared = try await account.call("POST", "/api/app/notebooks/\(id)", ["step": "prepare", "files": manifest])
        let byPath = Dictionary(uniqueKeysWithValues: entries.map { ($0.path, $0) })
        for target in prepared.send {
            guard let entry = byPath[target.path], let url = URL(string: target.url) else { continue }
            var req = URLRequest(url: url)
            req.httpMethod = "PUT"
            req.timeoutInterval = 300
            let type = entry.path.hasSuffix(".pdf") ? "application/pdf" : entry.path.hasSuffix(".jpg") ? "image/jpeg" : "application/octet-stream"
            req.setValue(type, forHTTPHeaderField: "Content-Type")
            req.setValue("true", forHTTPHeaderField: "x-upsert")
            let (_, response) = try await Self.network { try await URLSession.shared.upload(for: req, fromFile: entry.url) }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else { throw StudentAccount.CheckError.server("Couldn’t back up “\(nb.title)”. Try again.") }
        }
        let _: OK = try await account.call("POST", "/api/app/notebooks/\(id)", [
            "step": "commit", "files": manifest, "title": nb.title, "updatedAt": nb.updatedAt.timeIntervalSince1970,
        ])
        log.info("sent \(nb.title, privacy: .private): \(prepared.send.count) of \(entries.count) files")
    }

    private struct Remote: Decodable {
        struct File: Decodable { var path: String; var size: Int; var sha256: String; var url: String? }
        var deleted: Bool
        var files: [File]
    }

    private func fetch(_ id: UUID) async throws {
        let remote: Remote = try await account.call("GET", "/api/app/notebooks/\(id.uuidString)")
        guard !remote.deleted, !remote.files.isEmpty else { return }
        let fm = FileManager.default
        let dir = store.folderURL(notebookID: id)
        let incoming = store.root.appendingPathComponent(".incoming/\(id.uuidString)", isDirectory: true)
        try? fm.removeItem(at: incoming)
        for sub in ["pages", "documents", "previews"] {
            try fm.createDirectory(at: incoming.appendingPathComponent(sub), withIntermediateDirectories: true)
        }
        var fetched = 0
        for file in remote.files {
            let target = incoming.appendingPathComponent(file.path)
            let mine = dir.appendingPathComponent(file.path)
            if let have = try? Data(contentsOf: mine), Self.sha256(have) == file.sha256 {
                try fm.copyItem(at: mine, to: target)
                continue
            }
            guard let s = file.url, let url = URL(string: s) else { throw StudentAccount.CheckError.server("A page is missing on the server.") }
            let (data, response) = try await Self.network { try await URLSession.shared.data(from: url) }
            guard (response as? HTTPURLResponse)?.statusCode == 200, Self.sha256(data) == file.sha256 else {
                throw StudentAccount.CheckError.server("A page didn’t download properly. Try again.")
            }
            try data.write(to: target, options: .atomic)
            fetched += 1
        }
        if fm.fileExists(atPath: dir.path) {
            _ = try fm.replaceItemAt(dir, withItemAt: incoming)
        } else {
            try fm.createDirectory(at: dir.deletingLastPathComponent(), withIntermediateDirectories: true)
            try fm.moveItem(at: incoming, to: dir)
        }
        log.info("fetched notebook: \(fetched) of \(remote.files.count) files downloaded")
    }

    // MARK: Helpers

    private func saveRecord() {
        try? FileManager.default.createDirectory(at: store.root, withIntermediateDirectories: true)
        try? JSONEncoder().encode(record).write(to: store.root.appendingPathComponent("backup.json"), options: .atomic)
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func network<T>(_ body: () async throws -> T) async throws -> T {
        do { return try await body() } catch { throw StudentAccount.CheckError.network }
    }
}
