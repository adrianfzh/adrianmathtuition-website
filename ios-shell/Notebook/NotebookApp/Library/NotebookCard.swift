import SwiftUI

struct NotebookCover: View {
    let cover: CoverColor
    let title: String

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: w * 0.08, style: .continuous)
                    .fill(cover.color)
                // Spine
                Rectangle()
                    .fill(.black.opacity(0.12))
                    .frame(width: w * 0.07)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: w * 0.08, bottomLeadingRadius: w * 0.08, style: .continuous))
                Rectangle()
                    .fill(.white.opacity(0.18))
                    .frame(width: 1)
                    .offset(x: w * 0.07)
                // Label
                RoundedRectangle(cornerRadius: w * 0.035, style: .continuous)
                    .fill(.white.opacity(0.92))
                    .frame(width: w * 0.66, height: w * 0.26)
                    .overlay(alignment: .leading) {
                        Text(title)
                            .font(.system(size: max(9, w * 0.085), weight: .semibold))
                            .foregroundStyle(Color(white: 0.2))
                            .lineLimit(2)
                            .padding(.horizontal, w * 0.05)
                    }
                    .offset(x: w * 0.2, y: w * 0.22)
            }
        }
        .aspectRatio(0.75, contentMode: .fit)
        .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
        .accessibilityHidden(true)
    }
}

struct NotebookCard: View {
    let notebook: Notebook
    let subject: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NotebookCover(cover: notebook.cover, title: notebook.title)
            VStack(alignment: .leading, spacing: 2) {
                Text(notebook.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                Text("\(notebook.pageCountLabel) · \(notebook.updatedAt.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
