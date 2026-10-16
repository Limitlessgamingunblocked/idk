import SwiftUI
import UIKit
import WebKit

/// Hosts the game (index.html and its fonts, bundled with the app) in a full-screen web view.
struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Haptics { Haptics() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "haptic")

        let web = WKWebView(frame: .zero, configuration: config)
        let background = UIColor(named: "LaunchBackground")
        web.isOpaque = false
        web.backgroundColor = background
        web.scrollView.backgroundColor = background
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        if let page = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Receives `buzz(ms)` calls from the game and plays them on the Taptic Engine.
final class Haptics: NSObject, WKScriptMessageHandler {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let ms = (message.body as? NSNumber)?.doubleValue ?? 10
        if ms >= 40 {
            heavy.impactOccurred()
        } else {
            light.impactOccurred(intensity: min(1, CGFloat(ms) / 30 + 0.3))
        }
    }
}
