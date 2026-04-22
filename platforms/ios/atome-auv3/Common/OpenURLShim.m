#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/message.h>

// WARNING: This uses UIApplication from an app extension context, which is not extension-safe.
// Some hosts allow it; others don’t. Use only if you accept App Store risk.

BOOL OpenURLViaUIApplicationModern(CFURLRef cfurl, double timeoutSeconds) {
    if (cfurl == NULL) return NO;
    NSURL *url = (__bridge NSURL *)cfurl;
    Class UIApplicationClass = NSClassFromString(@"UIApplication");
    if (!UIApplicationClass) { return NO; }
    SEL sharedSel = NSSelectorFromString(@"sharedApplication");
    if (![UIApplicationClass respondsToSelector:sharedSel]) { return NO; }
    id app = ((id (*)(id, SEL))objc_msgSend)(UIApplicationClass, sharedSel);
    if (!app) { return NO; }

    SEL openSel = NSSelectorFromString(@"openURL:options:completionHandler:");
    if (![app respondsToSelector:openSel]) { return NO; }

    __block BOOL successFlag = NO;
    void (^completion)(BOOL) = ^(BOOL ok){ successFlag = ok; };
    NSDictionary *options = @{};
    ((void (*)(id, SEL, NSURL *, NSDictionary *, void(^)(BOOL)))objc_msgSend)(app, openSel, url, options, completion);

    // Give the completion a moment without blocking forever
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, timeoutSeconds > 0 ? timeoutSeconds : 0.1, false);
    return successFlag;
}
