#!/bin/zsh
# Builds the iOS app (with its AUv3 extension) for the iPad, into $AUM_DD (default temp/auv3_aum/dd).
source "${0:A:h}/env.sh"
cd "$REPO" && xcodebuild -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atome -configuration Debug \
  -destination id=$UDID -derivedDataPath "$DD" -allowProvisioningUpdates build > "$WORK/build.log" 2>&1
tail -1 "$WORK/build.log"
