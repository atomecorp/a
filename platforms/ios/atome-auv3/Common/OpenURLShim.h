#import <CoreFoundation/CoreFoundation.h>
#import <stdbool.h>

// Expose to Swift via Clang importer
bool OpenURLViaUIApplicationModern(CFURLRef cfurl, double timeoutSeconds);
