import PDFKit
import PencilKit
import UIKit

/// A picture of one notebook page as the student sees it — paper or the imported PDF page,
/// the writing, the red pen — sent with the backup so the website can show the page
/// (it can't read the pen format itself). SPEC-STUDENT-APP.md §0e.
enum PagePicture {
    static let width: CGFloat = 1200

    @MainActor
    static func jpeg(drawing: PKDrawing, paper: PaperStyle, pdfPage: PDFPage?, check: PageCheck?) -> Data? {
        let scale = width / PageGeometry.width
        let rect = CGRect(origin: .zero, size: PageGeometry.pageSize)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        var data: Data?
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            let ink = drawing.image(from: rect, scale: scale)
            let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: PageGeometry.height * scale), format: format).image { ctx in
                ctx.cgContext.scaleBy(x: scale, y: scale)
                UIColor.white.setFill()
                ctx.cgContext.fill(rect)
                if let pdfPage {
                    PDFPages.draw(pdfPage, in: PDFPages.placement(for: PDFPages.displaySize(pdfPage)), context: ctx.cgContext)
                } else {
                    PaperPattern.draw(paper, in: ctx.cgContext)
                }
                ink.draw(in: rect)
                RedPen.render(check, in: ctx.cgContext)
            }
            data = image.jpegData(compressionQuality: 0.72)
        }
        return data
    }
}
