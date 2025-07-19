//
//  Aatome.swift
//  application
//
//  Created by jeezs on 26/04/2022.
//

import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        WebViewManager.setupWebView(for: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}



