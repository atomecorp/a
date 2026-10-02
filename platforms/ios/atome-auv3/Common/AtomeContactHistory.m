#import "AtomeContactHistory.h"

@interface AtomeContactHistory () <CNChangeHistoryEventVisitor>
@property(nonatomic, strong) NSMutableDictionary<NSString *, CNContact *> *contacts;
@property(nonatomic, strong) NSMutableSet<NSString *> *removed;
@property(nonatomic, assign) BOOL reset;
@end

@implementation AtomeContactHistory
- (instancetype)init {
    if ((self = [super init])) { _contacts = [NSMutableDictionary new]; _removed = [NSMutableSet new]; }
    return self;
}
- (void)visitDropEverythingEvent:(CNChangeHistoryDropEverythingEvent *)event {
    self.reset = YES; [self.contacts removeAllObjects]; [self.removed removeAllObjects];
}
- (void)visitAddContactEvent:(CNChangeHistoryAddContactEvent *)event {
    self.contacts[event.contact.identifier] = event.contact; [self.removed removeObject:event.contact.identifier];
}
- (void)visitUpdateContactEvent:(CNChangeHistoryUpdateContactEvent *)event {
    self.contacts[event.contact.identifier] = event.contact; [self.removed removeObject:event.contact.identifier];
}
- (void)visitDeleteContactEvent:(CNChangeHistoryDeleteContactEvent *)event {
    [self.contacts removeObjectForKey:event.contactIdentifier]; [self.removed addObject:event.contactIdentifier];
}
+ (NSDictionary *)readStore:(CNContactStore *)store token:(NSData *)token
                      keys:(NSArray<id<CNKeyDescriptor>> *)keys error:(NSError **)error {
    CNChangeHistoryFetchRequest *request = [CNChangeHistoryFetchRequest new];
    request.startingToken = token; request.additionalContactKeyDescriptors = keys;
    request.shouldUnifyResults = YES;
    NSError *historyError = nil;
    CNFetchResult<NSEnumerator<CNChangeHistoryEvent *> *> *result =
        [store enumeratorForChangeHistoryFetchRequest:request error:&historyError];
    if (!result && token && [historyError.domain isEqualToString:CNErrorDomain]
        && (historyError.code == CNErrorCodeChangeHistoryExpired || historyError.code == CNErrorCodeChangeHistoryInvalidAnchor)) {
        request.startingToken = nil; historyError = nil;
        result = [store enumeratorForChangeHistoryFetchRequest:request error:&historyError];
    }
    if (!result) { if (error) *error = historyError; return nil; }
    AtomeContactHistory *visitor = [AtomeContactHistory new];
    for (CNChangeHistoryEvent *event in result.value) [event acceptEventVisitor:visitor];
    return @{ @"contacts": visitor.contacts.allValues, @"removed_ids": visitor.removed.allObjects,
              @"cursor": [result.currentHistoryToken base64EncodedStringWithOptions:0],
              @"mode": visitor.reset ? @"snapshot" : @"delta" };
}
@end
