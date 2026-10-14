// Native capability adapter shared by iOS and Tauri macOS. Navigation is JavaScript.
#import "AtomeGPSHost.h"
#import <Foundation/Foundation.h>
#import <CoreLocation/CoreLocation.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <AVFoundation/AVFoundation.h>
#import <TargetConditionals.h>

static AtomeGPSEffectCallback effectCallback;
static AtomeGPSAuthorizationCallback authorizationCallback;
@interface AtomeGPSHost : NSObject <CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *location;
@property(nonatomic, strong) JSContext *context;
@property(nonatomic, strong) JSValue *engine;
@property(nonatomic, strong) AVSpeechSynthesizer *speech;
@property(nonatomic, strong) NSDictionary *binding;
@property(nonatomic, strong) NSDictionary *latest;
@property(nonatomic, copy) NSString *failure;
@property(nonatomic, strong) NSMutableSet<NSString *> *fixRequests;
@end

@implementation AtomeGPSHost
- (instancetype)init {
    if ((self = [super init])) {
        _location = [CLLocationManager new]; _location.delegate = self;
        _location.desiredAccuracy = kCLLocationAccuracyBestForNavigation;
        _location.distanceFilter = 5; _location.activityType = CLActivityTypeAutomotiveNavigation;
        _speech = [AVSpeechSynthesizer new]; _fixRequests = [NSMutableSet new]; _failure = @"";
#if TARGET_OS_IPHONE
        // GPS speech has its own system session and does not reconfigure the audio owner.
        _speech.usesApplicationAudioSession = NO;
#endif
    }
    return self;
}
- (NSDictionary *)snapshot {
    NSMutableDictionary *value = [@{@"ok": @YES, @"active": @(self.engine != nil),
        @"background": @YES, @"trip_id": self.binding[@"trip_id"] ?: @"", @"error": self.failure ?: @""} mutableCopy];
    if (self.engine) [value addEntriesFromDictionary:[[self.engine invokeMethod:@"state" withArguments:@[]] toDictionary]];
    if (self.latest) value[@"position"] = self.latest;
    return value;
}
- (void)emit:(NSDictionary *)effect {
    if (!effectCallback) return;
    NSMutableDictionary *value = [self.binding mutableCopy] ?: [NSMutableDictionary new];
    [value addEntriesFromDictionary:effect];
    NSData *bytes = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
    if (json) effectCallback(json.UTF8String);
}
- (void)endCapability {
    [self.location stopUpdatingLocation]; [self.speech stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    NSArray *requests = self.fixRequests.allObjects; [self.fixRequests removeAllObjects];
    for (NSString *request in requests) [self emit:@{@"type": @"located", @"request_id": request, @"error": @"CANCELLED"}];
#if TARGET_OS_IPHONE
    self.location.allowsBackgroundLocationUpdates = NO;
#endif
    self.engine = nil; self.context = nil; self.binding = nil; self.latest = nil; self.failure = @"";
}
- (void)requestUpdates {
    if (!self.engine && !self.fixRequests.count) return;
    CLAuthorizationStatus status = self.location.authorizationStatus;
    if (status == kCLAuthorizationStatusDenied || status == kCLAuthorizationStatusRestricted) {
        self.failure = @"PERMISSION_DENIED";
        for (NSString *request in self.fixRequests) [self emit:@{@"type": @"located", @"request_id": request, @"error": self.failure}];
        [self.fixRequests removeAllObjects];
        if (self.engine) [self emit:@{@"type": @"interrupted", @"error": self.failure}];
        [self.location stopUpdatingLocation]; return;
    }
    if (status == kCLAuthorizationStatusNotDetermined) { [self.location requestWhenInUseAuthorization]; return; }
#if TARGET_OS_IPHONE
    self.location.allowsBackgroundLocationUpdates = self.engine != nil;
    self.location.showsBackgroundLocationIndicator = self.engine != nil;
#endif
    [self.location startUpdatingLocation];
}
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager { [self requestUpdates]; }
- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    self.failure = error.code == kCLErrorDenied ? @"PERMISSION_DENIED" : @"LOCATION_UNAVAILABLE";
    for (NSString *request in self.fixRequests) [self emit:@{@"type": @"located", @"request_id": request, @"error": self.failure}];
    [self.fixRequests removeAllObjects];
}
- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
    CLLocation *fix = locations.lastObject;
    if (!fix || fix.horizontalAccuracy < 0 || fabs([fix.timestamp timeIntervalSinceNow]) > 15) return;
    if (self.engine && (!authorizationCallback || !authorizationCallback([self.binding[@"owner_id"] UTF8String], [self.binding[@"session_id"] UTF8String]))) {
        [self endCapability]; return;
    }
    self.latest = @{@"lat": @(fix.coordinate.latitude), @"lon": @(fix.coordinate.longitude),
        @"accuracy": @(fix.horizontalAccuracy), @"timestamp": @([fix.timestamp timeIntervalSince1970] * 1000)};
    for (NSString *request in self.fixRequests) [self emit:@{@"type": @"located", @"request_id": request, @"position": self.latest}];
    [self.fixRequests removeAllObjects];
    if (!self.engine) { [manager stopUpdatingLocation]; return; }
    if ([self.failure isEqual:@"LOCATION_UNAVAILABLE"]) self.failure = @"";
    self.context.exception = nil;
    NSDictionary *update = [[self.engine invokeMethod:@"update" withArguments:@[self.latest]] toDictionary];
    if (self.context.exception) { self.failure = @"INVALID_ARGUMENT"; return; }
    for (NSDictionary *intent in update[@"intents"]) {
        if ([intent[@"type"] isEqual:@"speak"]) {
            AVSpeechUtterance *utterance = [AVSpeechUtterance speechUtteranceWithString:intent[@"text"]];
            utterance.voice = [AVSpeechSynthesisVoice voiceWithLanguage:@"fr-FR"];
            [self.speech speakUtterance:utterance];
        } else [self emit:intent];
    }
}
- (NSDictionary *)invoke:(NSDictionary *)request engineSource:(NSString *)source {
    NSString *operation = request[@"operation"];
    if ([operation isEqual:@"state"]) return [self snapshot];
    if ([operation isEqual:@"fail"]) { [self endCapability]; self.failure = request[@"error"]; return [self snapshot]; }
    if ([operation isEqual:@"release"] || [operation isEqual:@"stop"]) { [self endCapability]; return @{@"ok": @YES}; }
    if ([operation isEqual:@"locate"]) {
        NSString *requestId = request[@"request_id"];
        if (!requestId.length) return @{@"ok": @NO, @"error": @"INVALID_ARGUMENT"};
        [self.fixRequests addObject:requestId]; [self requestUpdates]; return @{@"ok": @YES, @"pending": @YES};
    }
    if ([operation isEqual:@"cancel_locate"]) {
        [self.fixRequests removeObject:request[@"request_id"]];
        if (!self.engine && !self.fixRequests.count) [self.location stopUpdatingLocation];
        return @{@"ok": @YES};
    }
    if ([operation isEqual:@"set_error"]) {
        if (![request[@"session_id"] isEqual:self.binding[@"session_id"]]) return @{@"ok": @NO, @"error": @"CONTEXT_CHANGED"};
        self.failure = request[@"error"]; return @{@"ok": @YES};
    }
    if ([operation isEqual:@"replace_route"]) {
        if (![request[@"session_id"] isEqual:self.binding[@"session_id"]]) return @{@"ok": @NO, @"error": @"CONTEXT_CHANGED"};
        self.context.exception = nil; [self.engine invokeMethod:@"replaceRoute" withArguments:@[request[@"route"]]];
        if (self.context.exception) return @{@"ok": @NO, @"error": @"INVALID_PROVIDER_RESPONSE"};
        self.failure = @"";
        return @{@"ok": @YES};
    }
    if (![operation isEqual:@"start"]) return @{@"ok": @NO, @"error": @"INVALID_ARGUMENT"};
    if (self.engine) return [request[@"trip_id"] isEqual:self.binding[@"trip_id"]] ? [self snapshot]
        : @{@"ok": @NO, @"error": @"NAVIGATION_ALREADY_ACTIVE"};
    if (!source.length) return @{@"ok": @NO, @"error": @"NOT_CONFIGURED"};
    if (!request[@"route"] || !request[@"trip_id"] || !request[@"owner_id"]) return @{@"ok": @NO, @"error": @"INVALID_ARGUMENT"};
    self.context = [JSContext new]; [self.context evaluateScript:source];
    self.engine = [self.context[@"AtomeGpsEngine"][@"createGpsNavigationEngine"] callWithArguments:@[request[@"route"]]];
    if (self.context.exception || self.engine.isUndefined) { self.engine = nil; return @{@"ok": @NO, @"error": @"INVALID_PROVIDER_RESPONSE"}; }
    self.binding = @{@"trip_id": request[@"trip_id"], @"owner_id": request[@"owner_id"],
        @"session_id": request[@"session_id"] ?: NSUUID.UUID.UUIDString};
    self.failure = @""; [self requestUpdates];
    if ([self.failure isEqual:@"PERMISSION_DENIED"]) { [self endCapability]; return @{@"ok": @NO, @"error": @"PERMISSION_DENIED"}; }
    return [self snapshot];
}
@end

static AtomeGPSHost *host;
void atome_gps_set_effect_callback(AtomeGPSEffectCallback callback) { effectCallback = callback; }
void atome_gps_set_authorization_callback(AtomeGPSAuthorizationCallback callback) { authorizationCallback = callback; }
char *atome_gps_invoke(const char *json, const char *engineSource) {
    @autoreleasepool {
        NSDictionary *request = [NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        NSString *source = engineSource ? [NSString stringWithUTF8String:engineSource] : @"";
        __block NSDictionary *reply;
        void (^work)(void) = ^{
            if (!host) host = [AtomeGPSHost new];
            reply = request ? [host invoke:request engineSource:source] : @{@"ok": @NO, @"error": @"INVALID_ARGUMENT"};
        };
        if (NSThread.isMainThread) work(); else dispatch_sync(dispatch_get_main_queue(), work);
        NSData *bytes = [NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];
        return bytes ? strdup([[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding].UTF8String) : NULL;
    }
}
void atome_gps_free(char *value) { free(value); }
