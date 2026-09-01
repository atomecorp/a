# atome-Auv3

auv3 base project
to rename the app go to target and rename your application
to rename the auv3 and change the string under name key in info.plist in the auv3 folder
to rename the project go to project browser and rename your project

to create a visible folder on your and iPad and your iPhone go to main app the build settings then search for "supports" and check : 'support document folder' and 'Supports Opening Documents in Place' else take at look at MainAppFileManager.swift

Example to build using the terminal: 

xcodebuild -project atome.xcodeproj -scheme atomeAudioUnit -destination "generic/platform=macOS,variant=Mac Catalyst" 
clean build install

## TestFlight release

Run the repository release entry point from the repository root:

```bash
./scripts/XCode_testflight_generator --dry-run
./scripts/XCode_testflight_generator
```

To recall the App Store Connect encryption declaration without inspecting or
building the project, run:

```bash
./scripts/XCode_testflight_generator --export-compliance
```

The script discovers the main iOS application scheme, verifies that its AUv3
extension shares the Release marketing version and build number, increments the
last numeric marketing-version component and the integer build number, archives
and exports an App Store Connect IPA, and uploads only that IPA. It never
manages TestFlight testers or groups, submits an App Store release, deletes a
build, or writes credentials into the repository.

Before the first live upload, configure automatic distribution signing for the
existing Xcode team and store the App Store Connect Issuer ID locally:

```bash
mkdir -p ~/.appstoreconnect
chmod 700 ~/.appstoreconnect
printf '%s\n' "your-issuer-id" > ~/.appstoreconnect/issuer-id
chmod 600 ~/.appstoreconnect/issuer-id
```

The release command uses the existing `Apple Distribution` identity and asks
Xcode to retrieve or create the automatic provisioning profiles needed by the
app and its AUv3 extension. It never creates a signing certificate; if no
valid Apple Distribution identity is installed, it stops before upload.

### Obtain and store the App Store Connect credentials

An upload uses three related values. Only the `.p8` private key is secret:

1. In App Store Connect, open **Users and Access**, then **Integrations** (or
   **Keys**, depending on the current interface).
2. Copy the **Key ID** for the team API key that produced the `.p8` file. It
   also appears in that file's `AuthKey_<key-id>.p8` name; the script reads it
   automatically from that name.
3. Copy the **Issuer ID** displayed at the top of the same page and store it
   once in `~/.appstoreconnect/issuer-id` using the command above.
4. Download the private key when creating the API key. Apple makes that
   download available once, so retain it securely.

Store the downloaded key outside the repository at
`~/.appstoreconnect/private_keys/AuthKey_<your-key-id>.p8`. The directory must
be accessible only by its owner (`700`) and the file only by its owner (`600`).
Do not put the key in the repository's `private/` directory, even if that
directory is ignored by Git: `.gitignore` prevents normal Git tracking but is
not a secret-storage mechanism.

The script passes the inferred Key ID and locally stored Issuer ID to Xcode's
supported `altool` uploader; it does not print, copy, move, or overwrite the
private key. `APP_STORE_CONNECT_ISSUER_ID` is supported only as an explicit CI
override. `./scripts/XCode_testflight_generator --help` repeats the exact
requirements.

### Automatic version ledger

`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the Xcode project are the
release ledger. For example, the stored Release version `1.02 (1)` produces
the TestFlight archive `1.03 (2)`: the script increments the final numeric
component of the version and increments the build by one. It applies the new
values to both the app and AUv3 extension during the archive, then records them
in the project only after App Store Connect confirms the upload. After a
successful run, commit and push that Xcode-project change through the normal
Git workflow; the script deliberately performs no Git operation.

### App Store Connect encryption declaration

For the App Store Connect question, “What type of encryption algorithms does
your app use?”, select **option 2**:

> Standard encryption algorithms instead of, or in addition to, the
> encryption used in or accessed through Apple's operating system.

This is not a proprietary encryption implementation. The iOS target directly
uses CryptoKit for SHA-1 WebSocket negotiation, SHA-256 password hashing, and
HMAC-SHA256 JWT authentication in
`Common/LocalHTTPServer.swift`. Its bundled Atome resource root also includes
the WebCrypto RSA-PSS/SHA-256 server-signature verification path in
`atome/security/serverVerificationCrypto.js`.

No AES, libsodium, Olm, Megolm, or Matrix encryption implementation was found.
Therefore, do not select option 1, 3, or 4. This decision is specific to the
current source tree and must be revisited if the cryptographic implementation
or iOS dependencies change. The local release script records and prints this
choice, but App Store Connect still requires an authorized person to submit the
declaration. Apple's current
[export-compliance reference](https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption/)
governs any required supporting documentation.

### Complete the TestFlight workflow

The live command uploads a build to App Store Connect only; it cannot publish
the application on the App Store or add testers. After Apple finishes
processing the upload, open the app's **TestFlight** tab in App Store Connect,
select the build, use option 2 above for the encryption declaration, then add
internal or external testers deliberately. Consult Apple's current guides for
[API key metadata](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)
and [build uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).



Here is the hierarchy of the project:

atome-Auv3/
.DS_Store
LICENSE
README.md
.gitignore
auv3/
	auv3.entitlements
	utils.swift
	auv3Release.entitlements
	Info.plist
	AudioUnitViewController.swift
Common/
	WebViewManager.swift
	MainAppFileManager.swift
	AudioControllerProtocol.swift
view/
	index.html
application/
	ViewController.swift
	atome.entitlements
	atomeRelease.entitlements
	AppDelegate.swift
	Info.plist
	Assets.xcassets/
		Contents.json
		AppIcon.appiconset/
			icon_180.png
			icon_87.png
			icon_40.png
			icon_152.png
			icon_80.png
			icon_58 1.png
			icon_120.png
			icon_40 1.png
			icon_80 1.png
			icon_40 2.png
			icon_20.png
			Contents.json
			icon_29.png
			icon_1024.png
			icon_58.png
			icon_60.png
			icon_120 1.png
			icon_167.png
		AccentColor.colorset/
			Contents.json
atome.xcodeproj/
	project.pbxproj
	xcuserdata/
		jeezs.xcuserdatad/
			xcschemes/
				xcschememanagement.plist
		jean-ericgodard.xcuserdatad/
			xcdebugger/
				Breakpoints_v2.xcbkptlist
			xcschemes/
				xcschememanagement.plist
	project.xcworkspace/
		contents.xcworkspacedata
		xcuserdata/
			jeezs.xcuserdatad/
				UserInterfaceState.xcuserstate
			jean-ericgodard.xcuserdatad/
				UserInterfaceState.xcuserstate
		xcshareddata/
			IDEWorkspaceChecks.plist
			swiftpm/
				configuration/
	xcshareddata/
		xcschemes/
			atomeAppAudioUnit.xcscheme
			atome.xcscheme
.git/ (avec fichiers internes)
.idea/
	atome-Auv3.iml
	vcs.xml
	.gitignore
	workspace.xml
	modules.xml
	misc.xml
