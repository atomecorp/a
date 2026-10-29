// Native owner of a service's internal page, shared by iOS (AppNativeStreamingView.swift) and
// Tauri macOS (src/streaming_view.rs). The page lies BEHIND the app page, which turns clear
// while it is open: the canvas cut-out (kind `media_window`) shows it, Mystic and the menus
// stay above. `streaming_view_front` raises it while the person acts in it (signing in).
// It shares nothing with the app page: no bridge, no script, its own website data per
// service (its sign-in kept between launches). Playback is read and suspended through
// WebKit's own media controls, in every frame, without touching the service's page.
// The Web of Divertissement (eVe/domains/dashboard/dashboard_web.js) is one more such
// service, `web`: its history is walked (`streaming_view_navigate`) and its page read
// (`streaming_view_page`); a site's camera or microphone request and its downloads are refused.
#import "AtomeStreamingView.h"
#import <WebKit/WebKit.h>
#import <CommonCrypto/CommonDigest.h>
#import <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
#else
#import <AppKit/AppKit.h>
#endif

typedef void (^AtomeStreamingReply)(NSDictionary *result);

@interface AtomeStreamingView : NSObject <WKNavigationDelegate, WKUIDelegate>
@property(nonatomic, weak) WKWebView *host;
@property(nonatomic, strong) WKWebView *view;
@property(nonatomic, copy) NSString *service;
@property(nonatomic) BOOL front;
// Why the last load failed (cleared when the next one starts), read with the page.
@property(nonatomic, copy) NSString *loadFailure;
#if TARGET_OS_IPHONE
@property(nonatomic) BOOL hostOpaque;
@property(nonatomic, strong) UIColor *hostBackground;
@property(nonatomic, strong) UIColor *hostScrollBackground;
#endif
@end

static NSDictionary *failure(NSString *error) { return @{@"ok": @NO, @"error": error}; }

@implementation AtomeStreamingView

+ (instancetype)shared {
    static AtomeStreamingView *value;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ value = [AtomeStreamingView new]; });
    return value;
}

// Page pixels (the app page fills its web view from its origin: CSS pixels are points)
// to the coordinates of the web view's parent.
- (BOOL)frame:(CGRect *)frame of:(NSDictionary *)payload {
    NSDictionary *rect = payload[@"rect"];
    if (![rect isKindOfClass:NSDictionary.class]) return NO;
    NSNumber *x = rect[@"x"], *y = rect[@"y"], *width = rect[@"width"], *height = rect[@"height"];
    for (id value in @[x ?: NSNull.null, y ?: NSNull.null, width ?: NSNull.null, height ?: NSNull.null])
        if (![value isKindOfClass:NSNumber.class]) return NO;
    if (width.doubleValue <= 0 || height.doubleValue <= 0) return NO;
    CGRect local = CGRectMake(x.doubleValue, y.doubleValue, width.doubleValue, height.doubleValue);
#if !TARGET_OS_IPHONE
    if (!self.host.isFlipped) local.origin.y = self.host.bounds.size.height - local.origin.y - local.size.height;
#endif
    *frame = [self.host convertRect:local toView:self.host.superview];
    return YES;
}

- (void)order {
#if TARGET_OS_IPHONE
    if (self.front) [self.host.superview insertSubview:self.view aboveSubview:self.host];
    else [self.host.superview insertSubview:self.view belowSubview:self.host];
#else
    [self.host.superview addSubview:self.view positioned:(self.front ? NSWindowAbove : NSWindowBelow) relativeTo:self.host];
#endif
}

// The app page lets the service's page show through while it is open.
- (void)setHostClear:(BOOL)clear {
#if TARGET_OS_IPHONE
    if (clear) {
        self.hostOpaque = self.host.isOpaque;
        self.hostBackground = self.host.backgroundColor;
        self.hostScrollBackground = self.host.scrollView.backgroundColor;
        self.host.opaque = NO;
        self.host.backgroundColor = UIColor.clearColor;
        self.host.scrollView.backgroundColor = UIColor.clearColor;
    } else {
        self.host.opaque = self.hostOpaque;
        self.host.backgroundColor = self.hostBackground;
        self.host.scrollView.backgroundColor = self.hostScrollBackground;
    }
#else
    // The key wry itself sets for a transparent web view (Tauri's main web view draws its background).
    [self.host setValue:@(!clear) forKey:@"drawsBackground"];
#endif
}

// A stable store per service: the same UUID at every launch (its sign-in is kept).
+ (NSUUID *)storeIdentifier:(NSString *)service API_AVAILABLE(ios(17.0), macos(14.0)) {
    NSData *seed = [[@"atome.streaming." stringByAppendingString:service] dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(seed.bytes, (CC_LONG)seed.length, digest);
    digest[6] = (digest[6] & 0x0F) | 0x50;
    digest[8] = (digest[8] & 0x3F) | 0x80;
    return [[NSUUID alloc] initWithUUIDBytes:digest];
}

- (WKWebView *)makeView:(NSString *)service radius:(double)radius API_AVAILABLE(ios(17.0), macos(14.0)) {
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    config.websiteDataStore = [WKWebsiteDataStore dataStoreForIdentifier:[AtomeStreamingView storeIdentifier:service]];
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
#if TARGET_OS_IPHONE
    config.allowsInlineMediaPlayback = YES;
#endif
    WKWebView *view = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    view.navigationDelegate = self;
    view.UIDelegate = self;
    view.allowsBackForwardNavigationGestures = YES;
    view.allowsLinkPreview = NO;
#if DEBUG
    // The app page's opt-in (FeatureFlags.webInspectorEnabled): inspectable only for a deliberate diagnostic launch.
    if (@available(iOS 16.4, macOS 13.3, *)) {
        NSProcessInfo *process = NSProcessInfo.processInfo;
        view.inspectable = [process.arguments containsObject:@"-AtomeWebInspector"]
            || [process.environment[@"ATOME_IOS_WEB_INSPECTOR"] isEqualToString:@"1"];
    }
#endif
#if TARGET_OS_IPHONE
    view.backgroundColor = UIColor.blackColor;
    view.layer.cornerRadius = radius;
    view.clipsToBounds = YES;
#else
    view.wantsLayer = YES;
    view.layer.backgroundColor = NSColor.blackColor.CGColor;
    view.layer.cornerRadius = radius;
    view.layer.masksToBounds = YES;
#endif
    return view;
}

- (NSDictionary *)open:(NSDictionary *)payload {
    if (!self.host.superview) return failure(@"streaming_view_host_missing");
    NSString *service = payload[@"service"];
    NSURL *url = [payload[@"url"] isKindOfClass:NSString.class] ? [NSURL URLWithString:payload[@"url"]] : nil;
    CGRect frame;
    if (![service isKindOfClass:NSString.class] || !service.length || ![url.scheme isEqualToString:@"https"]
        || ![self frame:&frame of:payload]) return failure(@"streaming_view_request_invalid");
    if (@available(iOS 17.0, macOS 14.0, *)) {
        if (!self.view || ![service isEqualToString:self.service]) {
            [self close];
            NSNumber *radius = [payload[@"radius"] isKindOfClass:NSNumber.class] ? payload[@"radius"] : @0;
            self.view = [self makeView:service radius:radius.doubleValue];
            self.service = service;
            self.front = NO;
            [self setHostClear:YES];
        }
    } else {
        return failure(@"streaming_view_os_unsupported");
    }
    [self order];
    self.view.frame = frame;
    self.view.hidden = NO;
    [self.view loadRequest:[NSURLRequest requestWithURL:url]];
    return @{@"ok": @YES};
}

// `visible` false hides it (its Atome off screen, another scene shown); `rect` then may lack.
- (NSDictionary *)place:(NSDictionary *)payload {
    if (!self.view) return failure(@"streaming_view_closed");
    if (![payload[@"visible"] isKindOfClass:NSNumber.class]) return failure(@"streaming_view_request_invalid");
    BOOL visible = [payload[@"visible"] boolValue];
    CGRect frame;
    if (visible && ![self frame:&frame of:payload]) return failure(@"streaming_view_request_invalid");
    if (visible) self.view.frame = frame;
    self.view.hidden = !visible;
    return @{@"ok": @YES};
}

- (NSDictionary *)raise:(NSDictionary *)payload {
    if (!self.view) return failure(@"streaming_view_closed");
    if (![payload[@"front"] isKindOfClass:NSNumber.class]) return failure(@"streaming_view_request_invalid");
    self.front = [payload[@"front"] boolValue];
    [self order];
    return @{@"ok": @YES, @"front": @(self.front)};
}

// `back` / `forward` walk the page's own history, `reload` loads it again, `load` opens `url`.
- (NSDictionary *)navigate:(NSDictionary *)payload {
    if (!self.view) return failure(@"streaming_view_closed");
    NSString *action = payload[@"action"];
    if ([action isEqualToString:@"back"] && self.view.canGoBack) [self.view goBack];
    else if ([action isEqualToString:@"forward"] && self.view.canGoForward) [self.view goForward];
    else if ([action isEqualToString:@"reload"]) [self.view reload];
    else if ([action isEqualToString:@"load"]) {
        NSURL *url = [payload[@"url"] isKindOfClass:NSString.class] ? [NSURL URLWithString:payload[@"url"]] : nil;
        if (![url.scheme isEqualToString:@"https"]) return failure(@"streaming_view_request_invalid");
        [self.view loadRequest:[NSURLRequest requestWithURL:url]];
    } else if ([action isEqualToString:@"back"] || [action isEqualToString:@"forward"]) return failure(@"streaming_view_history_edge");
    else return failure(@"streaming_view_request_invalid");
    return @{@"ok": @YES};
}

// What the page shows now: its address, its title, where its history can go, a failed load.
- (NSDictionary *)page {
    if (!self.view) return failure(@"streaming_view_closed");
    return @{@"ok": @YES, @"url": self.view.URL.absoluteString ?: @"", @"title": self.view.title ?: @"",
             @"can_go_back": @(self.view.canGoBack), @"can_go_forward": @(self.view.canGoForward),
             @"loading": @(self.view.isLoading), @"error": self.loadFailure ?: @""};
}

// `state` reads, `pause` suspends, `play` resumes what `pause` suspended.
- (void)media:(NSDictionary *)payload reply:(AtomeStreamingReply)reply {
    if (!self.view) { reply(failure(@"streaming_view_closed")); return; }
    NSString *action = payload[@"action"];
    if (![@[@"state", @"play", @"pause"] containsObject:action ?: @""]) { reply(failure(@"streaming_view_request_invalid")); return; }
    if (@available(iOS 15.0, macOS 12.0, *)) {
        WKWebView *view = self.view;
        void (^state)(void) = ^{
            [view requestMediaPlaybackStateWithCompletionHandler:^(WKMediaPlaybackState value) {
                reply(@{@"ok": @YES, @"has_media": @(value != WKMediaPlaybackStateNone),
                        @"playing": @(value == WKMediaPlaybackStatePlaying)});
            }];
        };
        if ([action isEqualToString:@"state"]) state();
        else [view setAllMediaPlaybackSuspended:[action isEqualToString:@"pause"] completionHandler:state];
    } else {
        reply(failure(@"streaming_view_os_unsupported"));
    }
}

- (void)close {
    if (!self.view) return;
    if (@available(iOS 15.0, macOS 12.0, *)) [self.view pauseAllMediaPlaybackWithCompletionHandler:nil];
    [self.view stopLoading];
    [self.view removeFromSuperview];
    self.view = nil;
    self.service = nil;
    self.front = NO;
    self.loadFailure = nil;
    [self setHostClear:NO];
}

- (void)handle:(NSString *)command host:(WKWebView *)host payload:(NSDictionary *)payload reply:(AtomeStreamingReply)reply {
    if (self.view && self.host != host) [self close];
    self.host = host;
    if ([command isEqualToString:@"streaming_view_open"]) reply([self open:payload]);
    else if ([command isEqualToString:@"streaming_view_place"]) reply([self place:payload]);
    else if ([command isEqualToString:@"streaming_view_front"]) reply([self raise:payload]);
    else if ([command isEqualToString:@"streaming_view_media"]) [self media:payload reply:reply];
    else if ([command isEqualToString:@"streaming_view_navigate"]) reply([self navigate:payload]);
    else if ([command isEqualToString:@"streaming_view_page"]) reply([self page]);
    else if ([command isEqualToString:@"streaming_view_close"]) { [self close]; reply(@{@"ok": @YES}); }
    else reply(failure(@"streaming_view_command_invalid"));
}

// The web stays inside; another app's scheme (`itms-apps:`, a service's own) is never opened.
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action
    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSString *scheme = action.request.URL.scheme.lowercaseString ?: @"";
    decisionHandler([@[@"https", @"http", @"about", @"blob", @"data"] containsObject:scheme]
        ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}

// A response the view cannot show is a download: refused (no download space yet), told by the page state.
- (void)webView:(WKWebView *)webView decidePolicyForNavigationResponse:(WKNavigationResponse *)response
    decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    if (response.canShowMIMEType) { decisionHandler(WKNavigationResponsePolicyAllow); return; }
    self.loadFailure = @"streaming_view_download_unsupported";
    decisionHandler(WKNavigationResponsePolicyCancel);
}

- (void)webView:(WKWebView *)webView didStartProvisionalNavigation:(WKNavigation *)navigation { self.loadFailure = nil; }

- (void)failed:(NSError *)error {
    // A load the person (or the next load) cancelled is not a failure.
    if ([error.domain isEqualToString:NSURLErrorDomain] && error.code == NSURLErrorCancelled) return;
    // A refused download already said why (its cancel fails the load in turn).
    if (self.loadFailure) return;
    self.loadFailure = [NSString stringWithFormat:@"streaming_view_load_failed:%@:%ld", error.domain, (long)error.code];
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error { [self failed:error]; }
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error { [self failed:error]; }

// A site never reaches the camera or the microphone: the host grants none.
- (void)webView:(WKWebView *)webView requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
    initiatedByFrame:(WKFrameInfo *)frame type:(WKMediaCaptureType)type
    decisionHandler:(void (^)(WKPermissionDecision))decisionHandler API_AVAILABLE(ios(15.0), macos(12.0)) {
    decisionHandler(WKPermissionDecisionDeny);
}

// A window the site opens (a sign-in, a consent) loads in the same view.
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
    forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
    if (action.request.URL) [webView loadRequest:action.request];
    return nil;
}

@end

void atome_streaming_view_invoke(void *host, const char *command, const char *payload_json,
                                 void *context, AtomeStreamingViewReply reply) {
    @autoreleasepool {
        AtomeStreamingReply done = ^(NSDictionary *result) {
            NSData *bytes = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
            reply(context, [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding].UTF8String);
        };
        if (!NSThread.isMainThread) { done(failure(@"streaming_view_thread_invalid")); return; }
        if (!host || !command || !payload_json) { done(failure(@"streaming_view_request_invalid")); return; }
        NSData *data = [NSData dataWithBytes:payload_json length:strlen(payload_json)];
        id payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if (![payload isKindOfClass:NSDictionary.class]) { done(failure(@"streaming_view_request_invalid")); return; }
        [[AtomeStreamingView shared] handle:@(command) host:(__bridge WKWebView *)host payload:payload reply:done];
    }
}
