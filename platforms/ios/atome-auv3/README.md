# atome-Auv3

auv3 base project
to rename the app go to target and rename your application
to rename the auv3 and change the string under name key in info.plist in the auv3 folder
to rename the project go to project browser and rename your project

to create a visible folder on your and iPad and your iPhone go to main app the build settings then search for "supports" and check : 'support document folder' and 'Supports Opening Documents in Place' else take at look at MainAppFileManager.swift

Example to build using the terminal: 

xcodebuild -project atome.xcodeproj -scheme atomeAudioUnit -destination "generic/platform=macOS,variant=Mac Catalyst" 
clean build install



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

