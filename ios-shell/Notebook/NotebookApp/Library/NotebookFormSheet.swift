import SwiftUI

struct NotebookForm {
    var title: String = ""
    var cover: CoverColor = .blue
    var paper: PaperStyle = .blank
    var folderID: UUID?
}

struct NotebookFormSheet: View {
    enum Mode {
        case create(folderID: UUID?)
        case edit(Notebook)
    }

    let mode: Mode
    let onDone: (NotebookForm) -> Void
    @Environment(LibraryModel.self) private var library
    @Environment(\.dismiss) private var dismiss
    @State private var form = NotebookForm()
    @FocusState private var titleFocused: Bool

    private var isCreate: Bool { if case .create = mode { true } else { false } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        NotebookCover(cover: form.cover, title: form.title.isEmpty ? "Untitled" : form.title)
                            .frame(width: 64)
                        TextField("Title", text: $form.title)
                            .font(.title3.weight(.semibold))
                            .focused($titleFocused)
                            .submitLabel(.done)
                    }
                    .padding(.vertical, 6)
                }
                Section("Cover") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 5), spacing: 12) {
                        ForEach(CoverColor.allCases) { c in
                            Button { form.cover = c } label: {
                                Circle()
                                    .fill(c.color)
                                    .frame(width: 34, height: 34)
                                    .overlay {
                                        if form.cover == c {
                                            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(.white)
                                        }
                                    }
                                    .padding(3)
                                    .overlay(Circle().strokeBorder(form.cover == c ? c.color : .clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(c.name)
                        }
                    }
                    .padding(.vertical, 6)
                }
                Section("Paper") {
                    HStack(spacing: 12) {
                        ForEach(PaperStyle.allCases) { style in
                            Button { form.paper = style } label: {
                                VStack(spacing: 6) {
                                    PaperSwatch(style: style)
                                        .frame(height: 74)
                                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .strokeBorder(form.paper == style ? Color.accentColor : Color.secondary.opacity(0.25),
                                                          lineWidth: form.paper == style ? 2.5 : 1))
                                    Text(style.title).font(.caption.weight(form.paper == style ? .semibold : .regular))
                                        .foregroundStyle(form.paper == style ? Color.accentColor : .secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }
                if !library.folders.isEmpty {
                    Section("Subject") {
                        Picker("Subject", selection: $form.folderID) {
                            Text("None").tag(UUID?.none)
                            ForEach(library.folders) { f in Text(f.name).tag(UUID?.some(f.id)) }
                        }
                    }
                }
            }
            .navigationTitle(isCreate ? "New Notebook" : "Notebook")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isCreate ? "Create" : "Done") {
                        onDone(form)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("createNotebook")
                }
            }
        }
        .presentationDetents([.large])
        .onAppear {
            switch mode {
            case .create(let folderID):
                form.folderID = folderID
                titleFocused = true
            case .edit(let nb):
                form = NotebookForm(title: nb.title, cover: nb.cover, paper: nb.paper, folderID: nb.folderID)
            }
        }
    }
}

/// A small picture of a paper style.
struct PaperSwatch: View {
    let style: PaperStyle
    var body: some View {
        Canvas { ctx, size in
            let scale = size.width / 240
            ctx.withCGContext { cg in
                cg.scaleBy(x: scale, y: scale)
                PaperPattern.draw(style, in: cg, size: CGSize(width: 240, height: size.height / scale))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .aspectRatio(0.72, contentMode: .fit)
    }
}
