import AVFoundation
import SwiftUI

@main
struct SugarShapesApp: App {
    init() {
        // Game sound mixes with the player's music and follows the silent switch.
        try? AVAudioSession.sharedInstance().setCategory(.ambient)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color("LaunchBackground").ignoresSafeArea())
                .statusBarHidden(true)
        }
    }
}
