#import <Contacts/Contacts.h>

// The Contacts history enumerator is deliberately unavailable to Swift.
@interface AtomeContactHistory : NSObject
+ (NSDictionary * _Nullable)readStore:(CNContactStore * _Nonnull)store token:(NSData * _Nullable)token
                      keys:(NSArray<id<CNKeyDescriptor>> * _Nonnull)keys error:(NSError * _Nullable * _Nullable)error
    __attribute__((swift_error(none))) NS_SWIFT_NAME(read(store:token:keys:error:));
@end
