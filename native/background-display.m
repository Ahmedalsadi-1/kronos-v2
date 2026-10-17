// Copyright 2026 KronTerm contributors.
// CGVirtualDisplay declarations corroborated by SpaceO's MIT-licensed private API shim:
// https://github.com/ParthJadhav/SpaceO/blob/main/Sources/SpaceOPrivate/SpaceOPrivate.m
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <dlfcn.h>
#import <signal.h>
#import <unistd.h>

@interface NSObject (KronVirtualDisplay)
- (instancetype)initWithDescriptor:(id)descriptor;
- (instancetype)initWithWidth:(unsigned int)width height:(unsigned int)height refreshRate:(double)rate;
- (BOOL)applySettings:(id)settings;
- (CGDirectDisplayID)displayID;
@end

static id DisplayOwner;
static NSURL *WallpaperDirectory;
static NSString *WallpaperUnavailableReason;
static dispatch_queue_t DisplayQueue;
static dispatch_source_t InputSource;
static dispatch_source_t TermSource;
static dispatch_source_t InterruptSource;

static void emit(NSDictionary *value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return;
    fwrite(data.bytes, 1, data.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static NSArray *spacesForDisplay(CGDirectDisplayID displayID) {
    void *sky = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY | RTLD_LOCAL);
    if (!sky) return nil;
    int (*connection)(void) = dlsym(sky, "SLSMainConnectionID");
    CFArrayRef (*copySpaces)(int) = dlsym(sky, "SLSCopyManagedDisplaySpaces");
    if (!connection || !copySpaces) return nil;
    CFUUIDRef uuid = CGDisplayCreateUUIDFromDisplayID(displayID);
    if (!uuid) return nil;
    NSString *identifier = CFBridgingRelease(CFUUIDCreateString(NULL, uuid));
    CFRelease(uuid);
    NSArray *displays = CFBridgingRelease(copySpaces(connection()));
    if (![displays isKindOfClass:NSArray.class]) return nil;
    for (id entry in displays) {
        if (![entry isKindOfClass:NSDictionary.class] || ![entry[@"Display Identifier"] isEqual:identifier]) continue;
        NSMutableArray *result = [NSMutableArray array];
        id spaces = entry[@"Spaces"];
        if (![spaces isKindOfClass:NSArray.class]) return nil;
        for (id space in spaces) {
            if (![space isKindOfClass:NSDictionary.class]) return nil;
            id number = space[@"ManagedSpaceID"] ?: space[@"id64"];
            if (![number isKindOfClass:NSNumber.class] || [number unsignedLongLongValue] == 0) return nil;
            [result addObject:[number stringValue]];
        }
        return result.count ? result : nil;
    }
    return nil;
}

static NSDictionary *probe(void) {
    NSMutableArray *missing = [NSMutableArray array];
    for (NSString *name in @[@"CGVirtualDisplay", @"CGVirtualDisplayDescriptor", @"CGVirtualDisplayMode", @"CGVirtualDisplaySettings"]) {
        if (!NSClassFromString(name)) [missing addObject:name];
    }
    Class display = NSClassFromString(@"CGVirtualDisplay");
    Class mode = NSClassFromString(@"CGVirtualDisplayMode");
    if (display && ![display instancesRespondToSelector:@selector(initWithDescriptor:)]) [missing addObject:@"initWithDescriptor:"];
    if (display && ![display instancesRespondToSelector:@selector(applySettings:)]) [missing addObject:@"applySettings:"];
    if (display && ![display instancesRespondToSelector:@selector(displayID)]) [missing addObject:@"displayID"];
    if (mode && ![mode instancesRespondToSelector:@selector(initWithWidth:height:refreshRate:)]) [missing addObject:@"initWithWidth:height:refreshRate:"];
    NSDictionary *requiredSetters = @{
        @"CGVirtualDisplayDescriptor": @[@"setName:", @"setVendorID:", @"setProductID:", @"setSerialNum:",
            @"setMaxPixelsWide:", @"setMaxPixelsHigh:", @"setSizeInMillimeters:", @"setRedPrimary:",
            @"setGreenPrimary:", @"setBluePrimary:", @"setWhitePoint:", @"setQueue:"],
        @"CGVirtualDisplaySettings": @[@"setModes:", @"setHiDPI:"]
    };
    for (NSString *name in requiredSetters) {
        Class target = NSClassFromString(name);
        for (NSString *selector in requiredSetters[name]) {
            if (target && ![target instancesRespondToSelector:NSSelectorFromString(selector)]) {
                [missing addObject:[NSString stringWithFormat:@"%@.%@", name, selector]];
            }
        }
    }
    return @{@"success": @YES, @"available": @(missing.count == 0), @"missing": missing};
}

static BOOL applyDesktopHue(CGDirectDisplayID displayID) {
    if (!DisplayOwner || [DisplayOwner displayID] != displayID || CGDisplayIsMain(displayID)
        || CGDisplayIsInMirrorSet(displayID) || !CGDisplayIsActive(displayID)) return NO;
    NSScreen *target = nil;
    NSDate *screenDeadline = [NSDate dateWithTimeIntervalSinceNow:2.0];
    do {
        for (NSScreen *screen in NSScreen.screens) {
            NSNumber *identifier = screen.deviceDescription[@"NSScreenNumber"];
            if ([identifier isKindOfClass:NSNumber.class] && identifier.unsignedIntValue == displayID) {
                target = screen;
                break;
            }
        }
        if (target) break;
        // AppKit publishes display changes through the main run loop after CoreGraphics has valid bounds.
        [NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    } while ([screenDeadline timeIntervalSinceNow] > 0);
    if (!target) { WallpaperUnavailableReason = @"The owned display has no published AppKit screen."; return NO; }
    @try {
        NSString *templatePath = [NSTemporaryDirectory() stringByAppendingPathComponent:@"kronterm-agent-desktop.XXXXXX"];
        char *directory = strdup(templatePath.fileSystemRepresentation);
        if (!directory) return NO;
        char *created = mkdtemp(directory);
        if (created) WallpaperDirectory = [NSURL fileURLWithFileSystemRepresentation:created isDirectory:YES relativeToURL:nil];
        free(directory);
        if (!WallpaperDirectory) return NO;
        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
            initWithBitmapDataPlanes:NULL pixelsWide:64 pixelsHigh:40 bitsPerSample:8 samplesPerPixel:4
            hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:256 bitsPerPixel:32];
        if (!bitmap || !bitmap.bitmapData) return NO;
        unsigned char *pixels = bitmap.bitmapData;
        for (NSUInteger y = 0; y < 40; ++y) {
            for (NSUInteger x = 0; x < 64; ++x) {
                double light = 1.0 - (double)y / 80.0;
                NSUInteger index = y * bitmap.bytesPerRow + x * 4;
                pixels[index] = (unsigned char)(49 * light);
                pixels[index + 1] = (unsigned char)(42 * light);
                pixels[index + 2] = (unsigned char)(85 * light);
                pixels[index + 3] = 255;
            }
        }
        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        NSURL *image = [WallpaperDirectory URLByAppendingPathComponent:@"desktop-hue.png"];
        if (!png || ![png writeToURL:image options:NSDataWritingAtomic error:nil]) return NO;
        // The exact owned NSScreen is mandatory; a main-screen fallback would change the user's wallpaper.
        if ([DisplayOwner displayID] != displayID || CGDisplayIsMain(displayID)
            || CGDisplayIsInMirrorSet(displayID) || !CGDisplayIsActive(displayID)) return NO;
        NSError *error = nil;
        BOOL applied = [NSWorkspace.sharedWorkspace setDesktopImageURL:image forScreen:target options:@{} error:&error];
        if (!applied) {
            WallpaperUnavailableReason = error.localizedDescription ?: @"macOS refused the owned desktop image.";
            return NO;
        }
        NSDate *imageDeadline = [NSDate dateWithTimeIntervalSinceNow:1.0];
        do {
            NSURL *observed = [NSWorkspace.sharedWorkspace desktopImageURLForScreen:target];
            if ([observed.URLByStandardizingPath isEqual:image.URLByStandardizingPath]) return YES;
            [NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        } while ([imageDeadline timeIntervalSinceNow] > 0);
        WallpaperUnavailableReason = @"macOS did not confirm the owned desktop image before the deadline.";
        return NO;
    } @catch (NSException *exception) {
        WallpaperUnavailableReason = @"The owned desktop image API is unavailable.";
        return NO;
    }
}

static void retire(void) {
    DisplayOwner = nil;
    if (WallpaperDirectory) [NSFileManager.defaultManager removeItemAtURL:WallpaperDirectory error:nil];
    exit(0);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        setvbuf(stdout, NULL, _IONBF, 0);
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        [NSApp finishLaunching];
        NSDictionary *capabilities = probe();
        if (argc == 2 && strcmp(argv[1], "--probe") == 0) { emit(capabilities); return 0; }
        if (argc != 1) { emit(@{@"success": @NO, @"error": @"Only --probe or managed stdin lifetime is supported."}); return 1; }
        if (![capabilities[@"available"] boolValue]) { emit(@{@"success": @NO, @"error": @"Native virtual displays are unavailable.", @"capabilities": capabilities}); return 1; }
        uint32_t count = 0;
        CGDirectDisplayID physical[32];
        if (CGGetActiveDisplayList(32, physical, &count) != kCGErrorSuccess || count == 0 || count >= 32) {
            emit(@{@"success": @NO, @"error": @"The active display baseline could not be verified."}); return 1;
        }
        id descriptor = [[NSClassFromString(@"CGVirtualDisplayDescriptor") alloc] init];
        @try {
            [descriptor setValue:@"KronTerm Agent Desktop" forKey:@"name"];
            [descriptor setValue:@(0x4b52) forKey:@"vendorID"];
            [descriptor setValue:@(1) forKey:@"productID"];
            uint32_t serial; do { serial = arc4random(); } while (serial == 0);
            [descriptor setValue:@(serial) forKey:@"serialNum"];
            [descriptor setValue:@(1280) forKey:@"maxPixelsWide"];
            [descriptor setValue:@(800) forKey:@"maxPixelsHigh"];
            [descriptor setValue:[NSValue valueWithSize:NSMakeSize(320, 200)] forKey:@"sizeInMillimeters"];
            [descriptor setValue:[NSValue valueWithPoint:NSMakePoint(0.68, 0.32)] forKey:@"redPrimary"];
            [descriptor setValue:[NSValue valueWithPoint:NSMakePoint(0.265, 0.69)] forKey:@"greenPrimary"];
            [descriptor setValue:[NSValue valueWithPoint:NSMakePoint(0.15, 0.06)] forKey:@"bluePrimary"];
            [descriptor setValue:[NSValue valueWithPoint:NSMakePoint(0.3127, 0.329)] forKey:@"whitePoint"];
            DisplayQueue = dispatch_queue_create("app.kronterm.background-display", DISPATCH_QUEUE_SERIAL);
            [descriptor setValue:DisplayQueue forKey:@"queue"];
            DisplayOwner = [[NSClassFromString(@"CGVirtualDisplay") alloc] initWithDescriptor:descriptor];
            id settings = [[NSClassFromString(@"CGVirtualDisplaySettings") alloc] init];
            id mode = [[NSClassFromString(@"CGVirtualDisplayMode") alloc] initWithWidth:1280 height:800 refreshRate:60.0];
            if (!DisplayOwner || !mode) @throw [NSException exceptionWithName:@"DisplayUnavailable" reason:@"The virtual display could not be created." userInfo:nil];
            [settings setValue:@[mode] forKey:@"modes"];
            [settings setValue:@(0) forKey:@"hiDPI"];
            if (![DisplayOwner applySettings:settings]) @throw [NSException exceptionWithName:@"DisplayUnavailable" reason:@"The virtual display mode was refused." userInfo:nil];
        } @catch (NSException *exception) {
            emit(@{@"success": @NO, @"error": exception.reason ?: @"Virtual display creation failed."}); return 1;
        }
        CGDirectDisplayID displayID = [DisplayOwner displayID];
        CGRect bounds = CGRectZero;
        NSArray *spaces = nil;
        BOOL valid = NO;
        for (int attempt = 0; attempt < 100; ++attempt) {
            bounds = CGDisplayBounds(displayID);
            spaces = spacesForDisplay(displayID);
            valid = displayID && !CGDisplayIsMain(displayID) && !CGDisplayIsInMirrorSet(displayID)
                && CGDisplayIsActive(displayID) && bounds.size.width == 1280 && bounds.size.height == 800 && spaces.count > 0;
            for (uint32_t index = 0; index < count && valid; ++index) {
                if (physical[index] == displayID || CGRectIntersectsRect(bounds, CGDisplayBounds(physical[index]))) valid = NO;
            }
            if (valid) break;
            [NSThread sleepForTimeInterval:0.1];
        }
        if (!valid) { emit(@{@"success": @NO, @"error": @"The dedicated display bounds or native desktop could not be verified."}); return 1; }
        BOOL wallpaperApplied = applyDesktopHue(displayID);
        BOOL hueApplied = wallpaperApplied;
        emit(@{@"success": @YES, @"displayId": @(displayID), @"spaceIds": spaces, @"wallpaperApplied": @(wallpaperApplied), @"hueApplied": @(hueApplied), @"wallpaperUnavailableReason": WallpaperUnavailableReason ?: @"",
               @"bounds": @{@"x": @(bounds.origin.x), @"y": @(bounds.origin.y), @"width": @(bounds.size.width), @"height": @(bounds.size.height)}});
        InputSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0, dispatch_get_main_queue());
        dispatch_source_set_event_handler(InputSource, ^{
            char bytes[256];
            ssize_t length = read(STDIN_FILENO, bytes, sizeof(bytes));
            if (length <= 0) retire();
        });
        dispatch_resume(InputSource);
        signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN);
        TermSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGTERM, 0, dispatch_get_main_queue());
        InterruptSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, SIGINT, 0, dispatch_get_main_queue());
        dispatch_source_set_event_handler(TermSource, ^{ retire(); });
        dispatch_source_set_event_handler(InterruptSource, ^{ retire(); });
        dispatch_resume(TermSource); dispatch_resume(InterruptSource);
        [[NSRunLoop mainRunLoop] run];
    }
    return 0;
}
