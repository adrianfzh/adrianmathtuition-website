import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @Environment(LibraryModel.self) private var library
    @Environment(StudentAccount.self) private var account
    @Environment(NotebookBackup.self) private var backup
    @State private var signingIn = false
    @State private var backupMessage: String?
    @State private var showingNew = false
    @State private var editing: Notebook?
    @State private var renaming: Notebook?
    @State private var renameText = ""
    @State private var deleting: Notebook?
    @State private var newSubjectAlert = false
    @State private var subjectText = ""
    @State private var renamingFolder: Folder?
    @State private var deletingFolder: Folder?
    @State private var importingPDF = false
    @State private var importError: String?

    private let columns = [GridItem(.adaptive(minimum: 150, maximum: 210), spacing: 22, alignment: .top)]

    var body: some View {
        @Bindable var library = library
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                subjectBar
                if library.visibleNotebooks.isEmpty && library.notebooks.isEmpty {
                    emptyState
                } else {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 28) {
                        NewNotebookTile { showingNew = true }
                        ForEach(library.visibleNotebooks) { nb in
                            Button { library.path.append(nb.id) } label: {
                                NotebookCard(notebook: nb, subject: library.folder(id: nb.folderID)?.name)
                            }
                            .buttonStyle(.plain)
                            .contextMenu { menu(for: nb) }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top, 4)
            .padding(.bottom, 40)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(library.folder(id: library.selectedFolderID)?.name ?? "Notebooks")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { backupButton }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort By", selection: $library.sort) {
                        ForEach(LibrarySort.allCases) { Text($0.title).tag($0) }
                    }
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { importingPDF = true } label: {
                    Label("Import PDF", systemImage: "square.and.arrow.down")
                }
                .accessibilityIdentifier("importPDF")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingNew = true } label: {
                    Label("New Notebook", systemImage: "plus")
                }
                .accessibilityIdentifier("newNotebook")
            }
        }
        // Coming back from a notebook (or opening the app): back up what changed.
        .onAppear { backup.sync() }
        .sheet(isPresented: $signingIn) {
            SignInSheet(account: account) { backup.sync() }
        }
        .alert("Backup", isPresented: Binding(get: { backupMessage != nil }, set: { if !$0 { backupMessage = nil } })) {
            Button("Try Again") { backup.sync() }
            Button("OK", role: .cancel) {}
        } message: {
            Text(backupMessage ?? "")
        }
        .fileImporter(isPresented: $importingPDF, allowedContentTypes: [.pdf]) { result in
            do {
                let nb = try library.importPDF(at: result.get(), folderID: library.selectedFolderID)
                library.path.append(nb.id)
            } catch {
                importError = error.localizedDescription
            }
        }
        .alert("Couldn’t Import PDF", isPresented: Binding(get: { importError != nil }, set: { if !$0 { importError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(importError ?? "")
        }
        .sheet(isPresented: $showingNew) {
            NotebookFormSheet(mode: .create(folderID: library.selectedFolderID)) { form in
                let nb = library.createNotebook(title: form.title, cover: form.cover, paper: form.paper, folderID: form.folderID)
                library.path.append(nb.id)
            }
        }
        .sheet(item: $editing) { nb in
            NotebookFormSheet(mode: .edit(nb)) { form in
                var changed = nb
                changed.title = form.title.isEmpty ? nb.title : form.title
                changed.cover = form.cover
                changed.paper = form.paper
                changed.folderID = form.folderID
                library.update(changed)
            }
        }
        .alert("Rename Notebook", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Title", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Rename") {
                if var nb = renaming, !renameText.trimmingCharacters(in: .whitespaces).isEmpty {
                    nb.title = renameText.trimmingCharacters(in: .whitespaces)
                    library.update(nb)
                }
            }
        }
        .alert("Delete “\(deleting?.title ?? "")”?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { if let nb = deleting { library.delete(nb) } }
        } message: {
            Text("All of its pages and writing will be deleted. This can’t be undone.")
        }
        .alert(renamingFolder == nil ? "New Subject" : "Rename Subject", isPresented: $newSubjectAlert) {
            TextField("e.g. A Math, Physics", text: $subjectText)
            Button("Cancel", role: .cancel) { renamingFolder = nil }
            Button(renamingFolder == nil ? "Add" : "Rename") {
                if let f = renamingFolder { library.renameFolder(f, to: subjectText) } else { library.createFolder(name: subjectText) }
                renamingFolder = nil
            }
        }
        .alert("Delete subject “\(deletingFolder?.name ?? "")”?", isPresented: Binding(get: { deletingFolder != nil }, set: { if !$0 { deletingFolder = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { if let f = deletingFolder { library.deleteFolder(f) } }
        } message: {
            Text("Its notebooks are kept and move to All.")
        }
    }

    // MARK: Pieces

    /// The cloud at the top left: signed out → tap to sign in; otherwise how the backup stands.
    @ViewBuilder private var backupButton: some View {
        if !account.isSignedIn {
            Button { signingIn = true } label: {
                Label("Back Up", systemImage: "icloud.slash")
            }
            .accessibilityIdentifier("backupSignIn")
        } else {
            switch backup.state {
            case .working:
                HStack(spacing: 6) {
                    ProgressView()
                    Text("Backing up…").font(.subheadline).foregroundStyle(.secondary)
                }
                .accessibilityIdentifier("backupWorking")
            case .done:
                Label("Backed Up", systemImage: "checkmark.icloud")
                    .labelStyle(.titleAndIcon)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("backupDone")
            case .failed(let message):
                Button { backupMessage = message } label: {
                    Label("Not Backed Up", systemImage: "exclamationmark.icloud")
                        .labelStyle(.titleAndIcon)
                }
                .tint(.orange)
                .accessibilityIdentifier("backupFailed")
            case .off:
                EmptyView()
            }
        }
    }

    private var subjectBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                SubjectChip(title: "All", selected: library.selectedFolderID == nil) { library.selectedFolderID = nil }
                ForEach(library.folders) { folder in
                    SubjectChip(title: folder.name, selected: library.selectedFolderID == folder.id) {
                        library.selectedFolderID = folder.id
                    }
                    .contextMenu {
                        Button { renamingFolder = folder; subjectText = folder.name; newSubjectAlert = true } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        Button(role: .destructive) { deletingFolder = folder } label: {
                            Label("Delete Subject", systemImage: "trash")
                        }
                    }
                }
                Button { renamingFolder = nil; subjectText = ""; newSubjectAlert = true } label: {
                    Label("Subject", systemImage: "plus")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .foregroundStyle(.secondary)
                        .overlay(Capsule().strokeBorder(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Notebooks Yet", systemImage: "book.closed")
        } description: {
            Text("Make a notebook for each subject and start writing, or bring in a worksheet to write on.")
        } actions: {
            Button("New Notebook") { showingNew = true }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
            Button("Import a PDF") { importingPDF = true }
                .buttonBorderShape(.capsule)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    @ViewBuilder
    private func menu(for nb: Notebook) -> some View {
        Button { renameText = nb.title; renaming = nb } label: { Label("Rename", systemImage: "pencil") }
        Button { editing = nb } label: { Label(FeatureFlags.paperStyles ? "Cover & Paper…" : "Cover…", systemImage: "paintpalette") }
        if !library.folders.isEmpty {
            Menu {
                Button("None") { var m = nb; m.folderID = nil; library.update(m, touch: false) }
                ForEach(library.folders) { f in
                    Button(f.name) { var m = nb; m.folderID = f.id; library.update(m, touch: false) }
                }
            } label: { Label("Move to Subject", systemImage: "folder") }
        }
        Divider()
        Button(role: .destructive) { deleting = nb } label: { Label("Delete", systemImage: "trash") }
    }
}

struct SubjectChip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 16).padding(.vertical, 8)
                .foregroundStyle(selected ? Color.white : Color.primary)
                .background(selected ? Color.accentColor : Color(.secondarySystemGroupedBackground), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct NewNotebookTile: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                    .background(Color(.secondarySystemGroupedBackground).opacity(0.5), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .aspectRatio(0.75, contentMode: .fit)
                    .overlay {
                        VStack(spacing: 8) {
                            Image(systemName: "plus")
                                .font(.system(size: 28, weight: .medium))
                                .foregroundStyle(Color.accentColor)
                            Text("New Notebook")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                Text(" ").font(.subheadline).accessibilityHidden(true)
                Text(" ").font(.caption).accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New Notebook")
    }
}
