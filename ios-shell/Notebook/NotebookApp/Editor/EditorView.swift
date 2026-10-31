import PencilKit
import SwiftUI
import UniformTypeIdentifiers

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
    @State private var importingPDF = false
    @State private var importError: String?
    @Environment(StudentAccount.self) private var account
    @State private var signingIn = false
    @State private var shownCheck: PageCheck?
    @State private var checkError: String?
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
            .overlay(alignment: .top) { checkingBanner }
            .sheet(isPresented: $signingIn, onDismiss: { controller.canvasView?.showToolPicker() }) {
                SignInSheet(account: account) { Task { await check() } }
            }
            .sheet(item: Binding(get: { shownCheck.map(IdentifiedCheck.init) }, set: { shownCheck = $0?.check }),
                   onDismiss: { controller.canvasView?.showToolPicker() }) { item in
                CheckResultSheet(check: item.check) {
                    controller.setCheck(nil, pageID: controller.notebook.pages[controller.currentPage].id)
                }
            }
            .alert("Couldn’t Check This Page", isPresented: Binding(get: { checkError != nil }, set: { if !$0 { checkError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(checkError ?? "")
            }
            .sheet(isPresented: $showingPages, onDismiss: { controller.canvasView?.showToolPicker() }) {
                PageOverviewSheet(controller: controller)
            }
            .onChange(of: showingPages) { _, showing in
                if showing { controller.canvasView?.canvas.resignFirstResponder() }
            }
            .fileImporter(isPresented: $importingPDF, allowedContentTypes: [.pdf]) { result in
                do { try controller.insertPDF(at: result.get()) } catch { importError = error.localizedDescription }
                controller.canvasView?.showToolPicker()
            }
            .alert("Couldn’t Insert PDF", isPresented: Binding(get: { importError != nil }, set: { if !$0 { importError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(importError ?? "")
            }
            .onAppear { title = controller.notebook.title }
            .onChange(of: title) { _, new in controller.rename(new) }
            .onDisappear { controller.saveNow() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { controller.saveNow() } }
    }

    @ViewBuilder
    private var checkingBanner: some View {
        if controller.checkingPage != nil {
            HStack(spacing: 10) {
                ProgressView()
                Text("Checking this page…").font(.subheadline.weight(.medium))
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
            .padding(.top, 10)
            .accessibilityIdentifier("checking")
        }
    }

    private func check() async {
        guard account.isSignedIn else { signingIn = true; return }
        controller.saveNow()
        do {
            shownCheck = try await controller.checkPage(controller.currentPage, account: account)
            controller.canvasView?.canvas.resignFirstResponder()
        } catch StudentAccount.CheckError.signedOut {
            signingIn = true
        } catch {
            checkError = error.localizedDescription
        }
    }

    private var currentCheck: PageCheck? {
        let pages = controller.notebook.pages
        return pages.indices.contains(controller.currentPage) ? pages[controller.currentPage].check : nil
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
                if let currentCheck {
                    Button { shownCheck = currentCheck } label: {
                        Label("What Went Wrong", systemImage: "list.bullet.clipboard")
                    }
                    .accessibilityIdentifier("checkResult")
                }
                Button { Task { await check() } } label: {
                    Label("Check This Page", systemImage: "checkmark.seal")
                }
                .disabled(controller.checkingPage != nil)
                .accessibilityIdentifier("checkPage")
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
                Button { importingPDF = true } label: { Label("Insert PDF…", systemImage: "doc.badge.plus") }
                if FeatureFlags.paperStyles {
                Picker(selection: Binding(get: { controller.notebook.paper }, set: { controller.setPaper($0) })) {
                    ForEach(PaperStyle.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                } label: {
                    Label("Paper", systemImage: "doc.plaintext")
                }
                .pickerStyle(.menu)
                }
                if FeatureFlags.checkPage && account.isSignedIn {
                    Button(role: .destructive) { account.signOut() } label: {
                        Label("Sign Out\(account.name.isEmpty ? "" : " (\(account.name))")", systemImage: "person.crop.circle.badge.xmark")
                    }
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

private struct IdentifiedCheck: Identifiable {
    let check: PageCheck
    var id: Date { check.checkedAt }
}
