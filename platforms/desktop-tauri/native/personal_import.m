#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <Contacts/Contacts.h>
#import <EventKit/EventKit.h>
#import "../../ios/atome-auv3/Common/AtomeContactHistory.h"

static CNContactStore *contacts;
static EKEventStore *events;
static void (*changed)(const char *);
static NSArray *observers;

static void initialize(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        contacts = [CNContactStore new]; events = [EKEventStore new];
        NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
        observers = @[
            [center addObserverForName:CNContactStoreDidChangeNotification object:nil queue:nil usingBlock:^(NSNotification *__unused n) {
                if (changed) changed("contact");
            }],
            [center addObserverForName:EKEventStoreChangedNotification object:nil queue:nil usingBlock:^(NSNotification *__unused n) {
                if (changed) changed("calendar_event");
            }]
        ];
    });
}

static NSDictionary *failure(NSString *error) { return @{ @"ok": @NO, @"error": error }; }

// Les miniatures du carnet macOS sont souvent en TIFF : les declarer JPEG donnait
// une image indecodable. Toujours re-encoder en JPEG reduit (256 px max).
static NSString *photoDataURL(NSData *data) {
    NSImage *image = data ? [[NSImage alloc] initWithData:data] : nil;
    CGImageRef source = image ? [image CGImageForProposedRect:NULL context:nil hints:nil] : NULL;
    if (!source) return nil;
    size_t width = CGImageGetWidth(source), height = CGImageGetHeight(source);
    if (!width || !height) return nil;
    double scale = MIN(1.0, 256.0 / (double)MAX(width, height));
    size_t targetWidth = MAX((size_t)1, (size_t)llround(width * scale)), targetHeight = MAX((size_t)1, (size_t)llround(height * scale));
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(NULL, targetWidth, targetHeight, 8, 0, space, (CGBitmapInfo)kCGImageAlphaNoneSkipLast);
    CGColorSpaceRelease(space);
    if (!context) return nil;
    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextSetRGBFillColor(context, 1, 1, 1, 1);
    CGContextFillRect(context, CGRectMake(0, 0, targetWidth, targetHeight));
    CGContextDrawImage(context, CGRectMake(0, 0, targetWidth, targetHeight), source);
    CGImageRef resized = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    if (!resized) return nil;
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:resized];
    CGImageRelease(resized);
    NSData *jpeg = [rep representationUsingType:NSBitmapImageFileTypeJPEG properties:@{NSImageCompressionFactor: @0.85}];
    if (!jpeg || jpeg.length > 512 * 1024) return nil;
    return [@"data:image/jpeg;base64," stringByAppendingString:[jpeg base64EncodedStringWithOptions:0]];
}

// Anniversaires et calendriers abonnes (jours feries…) ne sont pas des rendez-vous.
static NSString *calendarType(EKCalendar *calendar) {
    switch (calendar.type) {
        case EKCalendarTypeBirthday: return @"birthday";
        case EKCalendarTypeSubscription: return @"subscription";
        case EKCalendarTypeCalDAV: return @"caldav";
        case EKCalendarTypeExchange: return @"exchange";
        case EKCalendarTypeLocal: return @"local";
        default: return @"other";
    }
}

static NSData *fullImageData(NSString *identifier) {
    NSError *error;
    CNContact *contact = [contacts unifiedContactWithIdentifier:identifier
        keysToFetch:@[CNContactImageDataAvailableKey, CNContactImageDataKey] error:&error];
    return contact.imageDataAvailable ? contact.imageData : nil;
}
static NSString *iso(NSDate *date) {
    NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
    return date ? [formatter stringFromDate:date] : @"";
}
static NSString *contactDate(NSDateComponents *date) {
    if (!date || date.month == NSDateComponentUndefined || date.day == NSDateComponentUndefined) return @"";
    NSString *year = date.year == NSDateComponentUndefined ? @"--" : [NSString stringWithFormat:@"%04ld", (long)date.year];
    return [year stringByAppendingFormat:@"%02ld%02ld", (long)date.month, (long)date.day];
}
static NSString *eventDate(NSDate *date, EKEvent *event) {
    if (!event.allDay) return iso(date);
    NSDateFormatter *format = [NSDateFormatter new]; format.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    format.timeZone = event.timeZone ?: NSTimeZone.localTimeZone; format.dateFormat = @"yyyy-MM-dd";
    return [format stringFromDate:date];
}

static NSDictionary *readContacts(NSDictionary *options) {
    CNAuthorizationStatus status = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
    if (status == CNAuthorizationStatusNotDetermined) {
        dispatch_semaphore_t signal = dispatch_semaphore_create(0);
        [contacts requestAccessForEntityType:CNEntityTypeContacts completionHandler:^(BOOL __unused granted, NSError *__unused error) {
            dispatch_semaphore_signal(signal);
        }];
        if (dispatch_semaphore_wait(signal, dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC)))
            return failure(@"contacts_permission_timeout");
        status = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
    }
    if (status != CNAuthorizationStatusAuthorized) return failure(@"contacts_permission_denied");
    NSArray *keys = @[CNContactIdentifierKey, CNContactGivenNameKey, CNContactMiddleNameKey, CNContactFamilyNameKey,
        CNContactNicknameKey, CNContactNamePrefixKey, CNContactNameSuffixKey, CNContactOrganizationNameKey,
        CNContactJobTitleKey, CNContactPhoneNumbersKey, CNContactEmailAddressesKey, CNContactPostalAddressesKey,
        CNContactUrlAddressesKey, CNContactThumbnailImageDataKey, CNContactBirthdayKey, CNContactDatesKey,
        CNContactSocialProfilesKey, CNContactInstantMessageAddressesKey,
        [CNContactFormatter descriptorForRequiredKeysForStyle:CNContactFormatterStyleFullName]];
    NSData *token = [options[@"cursor"] isKindOfClass:NSString.class]
        ? [[NSData alloc] initWithBase64EncodedString:options[@"cursor"] options:0] : nil;
    NSError *error;
    NSDictionary *history = [AtomeContactHistory readStore:contacts token:token keys:keys error:&error];
    if (!history) return failure(@"contacts_history_failed");
    NSArray<CNGroup *> *groups = [contacts groupsMatchingPredicate:nil error:&error];
    if (!groups) return failure(@"contacts_groups_failed");
    NSMutableDictionary *membership = [NSMutableDictionary new];
    NSMutableArray *groupItems = [NSMutableArray new];
    for (CNGroup *group in groups) {
        NSArray *members = [contacts unifiedContactsMatchingPredicate:[CNContact predicateForContactsInGroupWithIdentifier:group.identifier]
                                                           keysToFetch:@[CNContactIdentifierKey] error:&error];
        if (!members) return failure(@"contacts_members_failed");
        NSMutableArray *memberIds = [NSMutableArray new];
        for (CNContact *member in members) {
            if (!membership[member.identifier]) membership[member.identifier] = [NSMutableArray new];
            [membership[member.identifier] addObject:group.identifier]; [memberIds addObject:member.identifier];
        }
        [groupItems addObject:@{@"id": group.identifier, @"name": group.name, @"members": memberIds}];
    }
    NSMutableArray *items = [NSMutableArray new];
    for (CNContact *contact in history[@"contacts"]) {
        NSMutableArray *phones = [NSMutableArray new], *emails = [NSMutableArray new], *urls = [NSMutableArray new], *addresses = [NSMutableArray new];
        for (CNLabeledValue<CNPhoneNumber *> *entry in contact.phoneNumbers)
            [phones addObject:@{@"label": entry.label ?: @"", @"value": entry.value.stringValue}];
        for (CNLabeledValue<NSString *> *entry in contact.emailAddresses)
            [emails addObject:@{@"label": entry.label ?: @"", @"value": entry.value}];
        for (CNLabeledValue<NSString *> *entry in contact.urlAddresses)
            [urls addObject:@{@"label": entry.label ?: @"", @"value": entry.value}];
        for (CNLabeledValue<CNPostalAddress *> *entry in contact.postalAddresses) {
            CNPostalAddress *a = entry.value;
            [addresses addObject:@{@"label": entry.label ?: @"", @"values": @[@"", @"", a.street, a.city, a.state, a.postalCode, a.country]}];
        }
        NSMutableDictionary *item = [@{@"id": contact.identifier, @"name": [CNContactFormatter stringFromContact:contact style:CNContactFormatterStyleFullName] ?: contact.organizationName,
            @"first_name": contact.givenName, @"middle_name": contact.middleName, @"last_name": contact.familyName,
            @"prefix": contact.namePrefix, @"suffix": contact.nameSuffix, @"nickname": contact.nickname,
            @"organization": contact.organizationName, @"title": contact.jobTitle, @"phones": phones, @"emails": emails,
            @"urls": urls, @"addresses": addresses, @"collections": membership[contact.identifier] ?: @[]} mutableCopy];
        item[@"birthday"] = contactDate(contact.birthday);
        NSMutableArray *extra = [NSMutableArray new];
        for (CNLabeledValue<NSDateComponents *> *entry in contact.dates)
            [extra addObject:@{@"name": @"X-ABDATE", @"value": contactDate(entry.value), @"params": @{@"TYPE": entry.label ?: @"other"}}];
        for (CNLabeledValue<CNSocialProfile *> *entry in contact.socialProfiles)
            [extra addObject:@{@"name": @"X-SOCIALPROFILE", @"value": entry.value.urlString,
                @"params": @{@"TYPE": entry.value.service, @"X-USER": entry.value.username}}];
        for (CNLabeledValue<CNInstantMessageAddress *> *entry in contact.instantMessageAddresses)
            [extra addObject:@{@"name": @"IMPP", @"value": [NSString stringWithFormat:@"%@:%@", entry.value.service, entry.value.username],
                @"params": @{@"TYPE": entry.label ?: @"other"}}];
        item[@"extra_properties"] = extra;
        NSData *image = contact.thumbnailImageData ?: fullImageData(contact.identifier);
        if (image) { NSString *photo = photoDataURL(image); if (photo) item[@"photo"] = photo; }
        else item[@"photo"] = @"";
        [items addObject:item];
    }
    return @{@"ok": @YES, @"complete": @YES, @"permission": @"authorized", @"contacts": items,
             @"groups": groupItems, @"cursor": history[@"cursor"], @"mode": history[@"mode"], @"removed_ids": history[@"removed_ids"]};
}

static NSDictionary *readCalendar(NSDictionary *options) {
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
    if (status == EKAuthorizationStatusNotDetermined) {
        dispatch_semaphore_t signal = dispatch_semaphore_create(0);
        void (^complete)(BOOL, NSError *) = ^(BOOL __unused granted, NSError *__unused error) { dispatch_semaphore_signal(signal); };
        if (@available(macOS 14.0, *)) [events requestFullAccessToEventsWithCompletion:complete];
        else [events requestAccessToEntityType:EKEntityTypeEvent completion:complete];
        if (dispatch_semaphore_wait(signal, dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC))) return failure(@"calendar_permission_timeout");
        status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
    }
    if (@available(macOS 14.0, *)) {
        if (status != EKAuthorizationStatusFullAccess) return failure(@"calendar_full_access_required");
    } else if (status != EKAuthorizationStatusAuthorized) return failure(@"calendar_permission_denied");
    NSCalendar *calendar = [[NSCalendar alloc] initWithCalendarIdentifier:NSCalendarIdentifierGregorian];
    calendar.timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0];
    NSInteger year = [calendar component:NSCalendarUnitYear fromDate:NSDate.date];
    NSInteger earliest = MAX(1900, MIN(year, [options[@"startYear"] integerValue] ?: 1970));
    NSInteger latest = year + MAX(1, MIN(20, [options[@"futureYears"] integerValue] ?: 5));
    NSDictionary *cursor = [options[@"cursor"] isKindOfClass:NSDictionary.class] ? options[@"cursor"] : nil;
    NSNumber *next = cursor[@"next_year"];
    NSInteger firstYear = next ? next.integerValue : year - 1;
    NSInteger lastYear = next ? MIN(firstYear + 1, latest + 1) : year + 2;
    NSDateComponents *components = [NSDateComponents new]; components.month = 1; components.day = 1;
    components.year = firstYear; NSDate *start = [calendar dateFromComponents:components];
    components.year = lastYear; NSDate *end = [calendar dateFromComponents:components];
    NSArray *selection = options[@"collections"] ?: @[];
    NSMutableArray *collections = [NSMutableArray new], *collectionItems = [NSMutableArray new];
    for (EKCalendar *c in [events calendarsForEntityType:EKEntityTypeEvent]) {
        if (selection.count && ![selection containsObject:c.calendarIdentifier]) continue;
        [collections addObject:c]; [collectionItems addObject:@{@"id": c.calendarIdentifier, @"name": c.title, @"type": calendarType(c)}];
    }
    NSPredicate *predicate = [events predicateForEventsWithStartDate:start endDate:end calendars:collections];
    NSMutableArray *items = [NSMutableArray new];
    for (EKEvent *event in [events eventsMatchingPredicate:predicate]) {
        NSString *external = event.calendarItemExternalIdentifier ?: event.calendarItemIdentifier;
        NSString *identifier = [event.calendar.calendarIdentifier stringByAppendingFormat:@"/%@%@", external,
            event.hasRecurrenceRules || event.isDetached ? [@"/" stringByAppendingString:iso(event.occurrenceDate ?: event.startDate)] : @""];
        [items addObject:@{@"id": identifier, @"uid": identifier, @"native_series_id": external,
            @"calendarId": event.calendar.calendarIdentifier, @"calendarType": calendarType(event.calendar), @"title": event.title ?: @"", @"description": event.notes ?: @"",
            @"location": event.location ?: @"", @"start": eventDate(event.startDate, event), @"end": eventDate(event.endDate, event),
            @"allDay": @(event.allDay), @"timezone": event.timeZone.name ?: @"UTC",
            @"updatedAt": iso(event.lastModifiedDate), @"status": event.status == EKEventStatusCanceled ? @"cancelled" : @"open", @"alarms": @[]}];
    }
    NSInteger upcoming = next ? lastYear : earliest; BOOL more = upcoming <= latest;
    return @{@"ok": @YES, @"complete": @YES, @"more": @(more), @"items": items, @"calendars": collectionItems,
        @"cursor": more ? @{@"next_year": @(upcoming)} : @{@"completed": @YES}, @"coverage": @{@"start": iso(start), @"end": iso(end)}};
}

char *atome_personal_read(const char *domain, const char *json, void (*callback)(const char *)) {
    @autoreleasepool {
        initialize(); changed = callback;
        NSData *data = [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *options = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        NSDictionary *result = strcmp(domain, "contact") == 0 ? readContacts(options) : readCalendar(options);
        NSData *output = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        if (!output) return strdup("{\"ok\":false,\"error\":\"native_import_json_failed\"}");
        return strdup([[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding].UTF8String);
    }
}
void atome_personal_free(char *value) { free(value); }
