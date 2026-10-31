import CoreGraphics
import Foundation

/// What "Check this page" brought back, kept with the page so the red pen is still there
/// next time the notebook opens. Positions are page points (the page is 820 × 1160).
struct PageCheck: Codable, Hashable, Sendable {
    enum Verdict: String, Codable, Sendable { case correct, partial, wrong, unreadable }
    enum Mark: String, Codable, Sendable { case tick, cross }

    struct LineMark: Codable, Hashable, Sendable {
        /// The handwriting line it belongs to: x, y, width, height.
        var box: [Double]
        var mark: Mark
        var note: String
        /// A cross only: the line as it should read, written in red under the wrong line.
        /// Optional so pages checked before 31 Oct 2026 still open.
        var correct: String?

        var rect: CGRect {
            box.count == 4 ? CGRect(x: box[0], y: box[1], width: box[2], height: box[3]) : .zero
        }
    }

    struct Question: Codable, Hashable, Sendable, Identifiable {
        var label: String
        var verdict: Verdict
        var wrong: String
        var fix: String
        var answer: String
        var id: String { label }
    }

    var checkedAt: Date = Date()
    var verdict: Verdict
    var summary: String
    var marks: [LineMark]
    var questions: [Question]
}

/// The server's reply (`/api/app/check-page`), before the line numbers are turned back into boxes.
struct CheckPageReply: Decodable, Sendable {
    struct Line: Decodable, Sendable { var n: Int; var mark: PageCheck.Mark; var note: String; var correct: String? }
    var verdict: PageCheck.Verdict
    var summary: String
    var lines: [Line]
    var questions: [PageCheck.Question]

    func pageCheck(lines sent: [HandwritingLine]) -> PageCheck {
        let byNumber = Dictionary(uniqueKeysWithValues: sent.map { ($0.number, $0.rect) })
        let marks = lines.compactMap { l -> PageCheck.LineMark? in
            guard let r = byNumber[l.n] else { return nil }
            return .init(box: [r.minX, r.minY, r.width, r.height], mark: l.mark, note: l.note,
                         correct: l.correct?.isEmpty == false ? l.correct : nil)
        }
        return PageCheck(verdict: verdict, summary: summary, marks: marks, questions: questions)
    }
}
