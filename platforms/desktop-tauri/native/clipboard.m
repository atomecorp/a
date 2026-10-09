#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

static NSString *const copyType = @"one.atome.clipboard.copy-key";
static NSDictionary *snapshot(NSPasteboard *board) {
    NSInteger revision = board.changeCount;
    NSMutableArray *items = [NSMutableArray new];
    for (NSPasteboardItem *item in board.pasteboardItems) {
        NSString *file = [item stringForType:NSPasteboardTypeFileURL];
        if (file) {
            NSURL *url = [NSURL URLWithString:file];
            if (!url.isFileURL) return @{@"success": @NO, @"error": @"clipboard_file_invalid"};
            [items addObject:@{@"kind": @"file", @"native_file": @YES, @"index": @(items.count),
                @"name": url.lastPathComponent, @"file_url": file}];
            continue;
        }
        BOOL binary = NO;
        for (NSArray *format in @[@[@"public.mpeg-4", @"video/mp4", @"mp4"],
                                 @[@"com.apple.quicktime-movie", @"video/quicktime", @"mov"],
                                 @[@"public.mp3", @"audio/mpeg", @"mp3"],
                                 @[@"com.microsoft.waveform-audio", @"audio/wav", @"wav"]]) {
            NSData *bytes = [item dataForType:format[0]];
            if (!bytes) continue;
            [items addObject:@{@"kind": @"file", @"name": [@"clipboard." stringByAppendingString:format[2]],
                @"mime_type": format[1], @"base64": [bytes base64EncodedStringWithOptions:0]}];
            binary = YES; break;
        }
        if (binary) continue;
        NSData *data = [item dataForType:NSPasteboardTypePNG];
        if (!data && [item.types containsObject:NSPasteboardTypeTIFF]) {
            NSBitmapImageRep *image = [NSBitmapImageRep imageRepWithData:[item dataForType:NSPasteboardTypeTIFF]];
            data = [image representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        }
        if (data) {
            [items addObject:@{@"kind": @"file", @"name": @"clipboard.png", @"mime_type": @"image/png",
                @"base64": [data base64EncodedStringWithOptions:0]}];
            continue;
        }
        NSString *text = [item stringForType:NSPasteboardTypeString] ?: [item stringForType:NSPasteboardTypeURL];
        if (text) { [items addObject:@{@"kind": @"text", @"text": text}]; continue; }
        if (item.types.count && ![item.types isEqualToArray:@[copyType]])
            return @{@"success": @NO, @"error": @"clipboard_type_unsupported"};
    }
    if (board.changeCount != revision) return @{@"success": @NO, @"error": @"clipboard_changed"};
    NSMutableDictionary *result = [@{@"success": @YES, @"revision": @(revision), @"items": items} mutableCopy];
    NSString *key = [board stringForType:copyType];
    if (key) result[@"copy_key"] = key;
    return result;
}
char *atome_clipboard_snapshot(void) {
    @autoreleasepool {
        __block NSDictionary *result;
        if (NSThread.isMainThread) result = snapshot(NSPasteboard.generalPasteboard);
        else dispatch_sync(dispatch_get_main_queue(), ^{ result = snapshot(NSPasteboard.generalPasteboard); });
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        if (!data) return NULL;
        return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
    }
}
static BOOL mark(NSPasteboard *board, NSString *key) {
    [board addTypes:@[copyType] owner:nil];
    return [board setString:key forType:copyType];
}
bool atome_clipboard_mark(const char *key) {
    @autoreleasepool {
        __block BOOL written = NO;
        void (^write)(void) = ^{ written = mark(NSPasteboard.generalPasteboard, [NSString stringWithUTF8String:key]); };
        if (NSThread.isMainThread) write(); else dispatch_sync(dispatch_get_main_queue(), write);
        return written;
    }
}
void atome_clipboard_free(char *value) { free(value); }
