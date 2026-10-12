#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

// Acquisition only: Axum owns the subsequent file read and its limits.
char *atome_file_selection_path(const char *extension) {
    @autoreleasepool {
        NSString *suffix = [NSString stringWithUTF8String:extension];
        __block NSDictionary *result;
        void (^choose)(void) = ^{
            NSOpenPanel *panel = [NSOpenPanel openPanel];
            panel.canChooseFiles = YES;
            panel.canChooseDirectories = NO;
            panel.allowsMultipleSelection = NO;
            UTType *type = [UTType typeWithFilenameExtension:suffix];
            if (!type) { result = @{ @"ok": @NO, @"error": @"file_selection_extension_invalid" }; return; }
            panel.allowedContentTypes = @[type];
            panel.allowsOtherFileTypes = NO;
            if ([panel runModal] != NSModalResponseOK) {
                result = @{ @"ok": @NO, @"cancelled": @YES, @"error": @"cancelled" };
                return;
            }
            NSURL *url = panel.URL;
            result = url.isFileURL ? @{ @"ok": @YES, @"path": url.path }
                : @{ @"ok": @NO, @"error": @"file_selection_path_invalid" };
        };
        if (NSThread.isMainThread) choose(); else dispatch_sync(dispatch_get_main_queue(), choose);
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        return data ? strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String) : NULL;
    }
}
void atome_file_selection_free(char *value) { free(value); }
