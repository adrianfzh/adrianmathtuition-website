import SwiftUI
import UniformTypeIdentifiers

/// Every page as a thumbnail: tap to jump, drag to reorder, long-press to move or delete.
struct PageOverviewSheet: View {
    let controller: EditorController
    @Environment(\.dismiss) private var dismiss
    @State private var deleting: Int?
    @State private var dragging: UUID?

    private let columns = [GridItem(.adaptive(minimum: 130, maximum: 180), spacing: 20, alignment: .top)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 24) {
                    ForEach(Array(controller.notebook.pages.enumerated()), id: \.element.id) { index, page in
                        PageThumb(image: controller.thumbnail(page: index, width: 180),
                                  number: index + 1,
                                  current: index == controller.currentPage)
                            .onTapGesture {
                                controller.goToPage(index)
                                dismiss()
                            }
                            .contextMenu { menu(index) }
                            .onDrag {
                                dragging = page.id
                                return NSItemProvider(object: page.id.uuidString as NSString)
                            }
                            .onDrop(of: [UTType.text], delegate: PageDropDelegate(
                                target: index, controller: controller, dragging: $dragging))
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) {
                    Button { controller.addPage(scroll: false) } label: {
                        Label("Add Page", systemImage: "plus")
                    }
                }
            }
            .alert("Delete page \((deleting ?? 0) + 1)?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) { if let i = deleting { controller.deletePage(at: i) } }
            } message: {
                Text("The writing on this page will be deleted.")
            }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder
    private func menu(_ index: Int) -> some View {
        let count = controller.notebook.pages.count
        Button { controller.addPage(scroll: false, after: index) } label: { Label("Insert Page After", systemImage: "plus.rectangle.portrait") }
        if index > 0 {
            Button { controller.movePage(from: index, to: index - 1) } label: { Label("Move Earlier", systemImage: "arrow.left") }
        }
        if index < count - 1 {
            Button { controller.movePage(from: index, to: index + 1) } label: { Label("Move Later", systemImage: "arrow.right") }
        }
        Divider()
        Button(role: .destructive) {
            if controller.pageHasInk(index) { deleting = index } else { controller.deletePage(at: index) }
        } label: { Label("Delete Page", systemImage: "trash") }
    }
}

private struct PageThumb: View {
    let image: UIImage
    let number: Int
    let current: Bool

    var body: some View {
        VStack(spacing: 8) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(current ? Color.accentColor : Color.black.opacity(0.1), lineWidth: current ? 3 : 0.5))
                .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
            Text("\(number)")
                .font(.caption.weight(current ? .semibold : .regular).monospacedDigit())
                .foregroundStyle(current ? Color.accentColor : .secondary)
        }
        .contentShape(Rectangle())
    }
}

private struct PageDropDelegate: DropDelegate {
    let target: Int
    let controller: EditorController
    @Binding var dragging: UUID?

    func dropEntered(info: DropInfo) {
        MainActor.assumeIsolated {
            guard let id = dragging,
                  let from = controller.notebook.pages.firstIndex(where: { $0.id == id }),
                  from != target else { return }
            withAnimation(.snappy) { controller.movePage(from: from, to: target) }
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }

    func performDrop(info: DropInfo) -> Bool {
        MainActor.assumeIsolated { dragging = nil }
        return true
    }
}
