import PencilKit
import SwiftUI

struct EditorView: View {
    let notebookID: UUID
    @Environment(LibraryModel.self) private var library
    @State private var controller: EditorController?

    var body: some View {
        Group {
            if let controller {
                EditorScreen(controller: controller)
            } else {
                Color(.systemGroupedBackground)
            }
        }
        .onAppear {
            if controller == nil, let nb = library.notebook(id: notebookID) {
                controller = EditorController(notebook: nb, store: library.store, library: library)
            }
        }
    }
}

private struct EditorScreen: View {
    @Bindable var controller: EditorController
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("drawWithFinger") private var drawWithFinger = UIDevice.current.userInterfaceIdiom == .phone
    @State private var showingPages = false
    @State private var title = ""
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var compact: Bool { sizeClass == .compact }

    var body: some View {
        CanvasHost(controller: controller, drawWithFinger: drawWithFinger)
            .ignoresSafeArea(edges: .bottom)
            .background(Color(.systemGroupedBackground))
            .navigationTitle($title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbar { toolbar }
            .overlay(alignment: .topTrailing) { pageBadge }
            .sheet(isPresented: $showingPages, onDismiss: { controller.canvasView?.showToolPicker() }) {
                PageOverviewSheet(controller: controller)
            }
            .onChange(of: showingPages) { _, showing in
                if showing { controller.canvasView?.canvas.resignFirstResponder() }
            }
            .onAppear { title = controller.notebook.title }
            .onChange(of: title) { _, new in controller.rename(new) }
            .onDisappear { controller.saveNow() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { controller.saveNow() } }
    }

    private var pageBadge: some View {
        Text("\(controller.currentPage + 1) of \(controller.notebook.pages.count)")
            .font(.caption.weight(.medium).monospacedDigit())
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(.regularMaterial, in: Capsule())
            .padding(.trailing, 14)
            .padding(.top, 10)
            .allowsHitTesting(false)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button { controller.undo() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                .disabled(!controller.canUndo)
            if !compact {
                Button { controller.redo() } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
                    .disabled(!controller.canRedo)
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if FeatureFlags.checkPage {
                // Later version: sends the current page to the marking service.
                Button {} label: { Label("Check This Page", systemImage: "checkmark.seal") }
                    .disabled(true)
            }
            if !compact {
                Button { showingPages = true } label: { Label("Pages", systemImage: "square.grid.2x2") }
                    .accessibilityIdentifier("pages")
            }
            Menu {
                if compact {
                    Button { controller.redo() } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
                        .disabled(!controller.canRedo)
                    Button { showingPages = true } label: { Label("Pages", systemImage: "square.grid.2x2") }
                }
                Button { controller.addPage() } label: { Label("Add Page", systemImage: "plus.rectangle.portrait") }
                if FeatureFlags.paperStyles {
                Picker(selection: Binding(get: { controller.notebook.paper }, set: { controller.setPaper($0) })) {
                    ForEach(PaperStyle.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                } label: {
                    Label("Paper", systemImage: "doc.plaintext")
                }
                .pickerStyle(.menu)
                }
                Toggle(isOn: $drawWithFinger) { Label("Draw with Finger", systemImage: "hand.draw") }
                Divider()
                Button { share(pages: [controller.currentPage]) } label: {
                    Label("Export This Page as PDF", systemImage: "doc.richtext")
                }
                Button { share(pages: Array(controller.notebook.pages.indices)) } label: {
                    Label("Export Notebook as PDF", systemImage: "square.and.arrow.up")
                }
            } label: {
                Label("More", systemImage: "ellipsis")
            }
            .accessibilityIdentifier("more")
        }
    }

    private func share(pages: [Int]) {
        controller.saveNow()
        guard let url = controller.exportPDF(pages: pages) else { return }
        ShareSheet.present(url)
    }
}

private struct CanvasHost: UIViewRepresentable {
    let controller: EditorController
    let drawWithFinger: Bool

    func makeUIView(context: Context) -> PaperCanvasView {
        let v = PaperCanvasView(frame: .zero)
        v.allowsFingerDrawing = drawWithFinger
        controller.attach(v)
        return v
    }

    func updateUIView(_ v: PaperCanvasView, context: Context) {
        if v.allowsFingerDrawing != drawWithFinger { v.allowsFingerDrawing = drawWithFinger }
    }
}
