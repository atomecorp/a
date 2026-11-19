# Shared settings of the AUM bench: the iPad, where the build and the run files go (always under temp/).
HERE="${0:A:h}"
REPO="${HERE:h:h:h}"
UDID="${UDID:-00008027-000520902E31802E}"
WORK="${AUM_WORK:-$REPO/temp/auv3_aum}"
DD="${${AUM_DD:-$WORK/dd}:A}"
WDA="${WDA_URL:-http://127.0.0.1:8120}"
mkdir -p "$WORK"
