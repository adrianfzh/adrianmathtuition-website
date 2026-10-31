import XCTest

/// Drives the app like a student would and saves screenshots (to $SHOTS_DIR when set).
/// The simulator has no Pencil, so these runs turn on "Draw with Finger".
final class WalkthroughUITests: XCTestCase {
    private var app: XCUIApplication!
    private var prefix: String {
        UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let att = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        if let dir = ProcessInfo.processInfo.environment["SHOTS_DIR"] {
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(prefix)-\(name).png"))
        }
    }

    private func point(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
        app.windows.firstMatch.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y))
    }

    private func stroke(_ pts: [(CGFloat, CGFloat)]) {
        for i in 0..<(pts.count - 1) {
            point(pts[i].0, pts[i].1).press(forDuration: 0.05, thenDragTo: point(pts[i + 1].0, pts[i + 1].1))
        }
    }

    /// Draws a small sketch (axes + a parabola + a tick) with its origin at (ox, oy).
    private func sketch(ox: CGFloat, oy: CGFloat, s: CGFloat) {
        stroke([(ox, oy + 120 * s), (ox + 240 * s, oy + 120 * s)])           // x-axis
        stroke([(ox + 120 * s, oy), (ox + 120 * s, oy + 220 * s)])           // y-axis
        var curve: [(CGFloat, CGFloat)] = []
        for i in stride(from: -5, through: 5, by: 1) {
            let x = CGFloat(i) * 20
            curve.append((ox + 120 * s + x * s, oy + 200 * s - (x * x / 10000 * 180) * s))
        }
        stroke(curve)
        stroke([(ox + 280 * s, oy + 100 * s), (ox + 300 * s, oy + 125 * s), (ox + 340 * s, oy + 60 * s)]) // tick
    }

    private func newNotebook(title: String, paper: String?, cover: String?) {
        app.buttons["newNotebook"].firstMatch.tap()
        let field = app.textFields["Title"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.typeText(title)
        if let cover { app.buttons[cover].firstMatch.tap() }
        if let paper, app.buttons[paper].firstMatch.exists { app.buttons[paper].firstMatch.tap() }
        app.buttons["createNotebook"].tap()
    }

    private func more(_ item: String, sub: String? = nil) {
        app.buttons["more"].firstMatch.tap()
        let b = app.buttons[item].firstMatch
        XCTAssertTrue(b.waitForExistence(timeout: 5), "menu item \(item)")
        b.tap()
        if let sub {
            let s = app.buttons[sub].firstMatch
            XCTAssertTrue(s.waitForExistence(timeout: 5), "submenu item \(sub)")
            s.tap()
        }
        sleep(1)
    }

    private func back() {
        app.navigationBars.buttons.element(boundBy: 0).tap()
        sleep(1)
    }

    /// iPadOS 26 may open the app as a window; make it fill the screen for clean shots.
    private func fillScreen() {
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let controls = sb.buttons["window-controls:com.adrianmath.notebook"]
        guard controls.waitForExistence(timeout: 2) else { return }
        if app.windows.firstMatch.frame.width >= sb.frame.width - 1 { return }
        controls.tap()
        let zoom = sb.buttons["Zoom-button"]
        if zoom.waitForExistence(timeout: 2) { zoom.tap() }
        sleep(3)
    }

    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    func test1_Walkthrough() throws {
        app.launchArguments = ["-resetStore", "-drawWithFinger", "YES"]
        app.launch()
        fillScreen()
        shot("01-library-empty")

        // Subjects
        for name in ["A Math", "Physics"] {
            app.buttons["Subject"].firstMatch.tap()
            app.textFields.firstMatch.typeText(name)
            app.alerts.buttons["Add"].tap()
        }

        newNotebook(title: "Quadratic Functions", paper: "Lined", cover: nil)
        sleep(2)
        let w = app.windows.firstMatch.frame.width
        let s: CGFloat = isPad ? 1.3 : 0.75
        sketch(ox: isPad ? 120 : 30, oy: isPad ? 220 : 200, s: s)
        stroke([(isPad ? 120 : 30, isPad ? 560 : 420), (w * 0.6, isPad ? 560 : 420)])  // underline
        sleep(2)
        shot("02-editor-lined")

        // Paper styles are switched off (FeatureFlags.paperStyles): every page is a blank canvas.

        more("Add Page")
        sleep(2)
        sketch(ox: isPad ? 200 : 40, oy: isPad ? 300 : 260, s: s)
        sleep(1)
        shot("04-editor-page2")

        if isPad { app.buttons["pages"].firstMatch.tap() } else { more("Pages") }
        sleep(2)
        shot("05-page-overview")
        app.buttons["Done"].firstMatch.tap()
        sleep(1)

        more("Export Notebook as PDF")
        sleep(2)
        shot("06-export-share-sheet")
        // Close the share sheet.
        if app.buttons["Close"].exists { app.buttons["Close"].tap() } else { app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.1)).tap() }
        sleep(1)

        back()
        newNotebook(title: "Kinematics", paper: "Grid", cover: "Orange")
        sleep(1)
        back()
        newNotebook(title: "Organic Chemistry", paper: "Dotted", cover: "Green")
        sleep(1)
        back()
        newNotebook(title: "Trigonometry", paper: nil, cover: "Indigo")
        sleep(1)
        back()
        sleep(1)
        shot("07-library")
    }

    func test2_AfterRelaunch() throws {
        app.launchArguments = ["-drawWithFinger", "YES"]
        app.launch()
        fillScreen()
        sleep(1)
        shot("08-library-after-relaunch")
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Quadratic Functions'")).firstMatch.tap()
        sleep(2)
        shot("09-editor-after-relaunch")
    }

    func test3_EditorShot() throws {
        app.launchArguments = ["-drawWithFinger", "YES"]
        app.launch()
        fillScreen()
        sleep(1)
        let name = ProcessInfo.processInfo.environment["SHOT_NAME"] ?? "10-editor"
        shot(name.replacingOccurrences(of: "editor", with: "library"))
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Quadratic Functions'")).firstMatch.tap()
        sleep(2)
        shot(name)
    }

    func test4_PinchZoom() throws {
        app.launchArguments = ["-drawWithFinger", "NO"]
        app.launch()
        fillScreen()
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Quadratic Functions'")).firstMatch.tap()
        sleep(2)
        app.scrollViews.firstMatch.pinch(withScale: 2.5, velocity: 2)
        sleep(2)
        shot("11-editor-zoomed")
    }

    /// Writing on an imported worksheet ($WORKSHEET_PDF), then zoomed in, then the page overview.
    func test5_WorksheetPDF() throws {
        guard let pdf = ProcessInfo.processInfo.environment["WORKSHEET_PDF"] else {
            throw XCTSkip("set WORKSHEET_PDF to a PDF on this Mac")
        }
        app.launchArguments = ["-resetStore", "-drawWithFinger", "YES", "-importPDF", pdf]
        app.launch()
        fillScreen()
        sleep(3)
        shot("20-worksheet-opened")
        let s: CGFloat = isPad ? 1.0 : 0.6
        sketch(ox: isPad ? 420 : 160, oy: isPad ? 560 : 420, s: s)
        stroke([(isPad ? 140 : 40, isPad ? 760 : 560), (isPad ? 520 : 260, isPad ? 760 : 560)])
        sleep(2)
        shot("21-worksheet-written")
        app.scrollViews.firstMatch.pinch(withScale: 2.2, velocity: 2)
        sleep(3)
        shot("22-worksheet-zoomed")
        if isPad { app.buttons["pages"].firstMatch.tap() } else { more("Pages") }
        sleep(2)
        shot("23-worksheet-pages")
    }
}
