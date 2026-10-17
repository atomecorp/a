# Communication tool unfolds again right after being folded

## Symptom

A message arrives: the Communication tool of the main menu unfolds with its summary.
The user touches it (the message field opens), folds it: a moment later it unfolds
again, endlessly, as long as the message is unread.

## Root cause

`eVe/intuition/tools/communication_tool_unread_runtime.js` unfolded the tool for every
unread notification, and `communication.js` re-projects that state when the message field
folds (`setCommunicationInputActive(false)`, 80 ms after the fold motion) and on each menu
rebuild. Nothing but the inbox marked a notification read.

## Fix (2026-10-16)

The runtime keeps the notifications the user acknowledged (`acknowledge()`: touching the
tool, opening the Communication panel). They stay unread in the inbox; only a new
notification unfolds the tool again.

## Regression check

`node temp/comm/comm_tool_ui.probe.mjs` checks 2 (« apres l avoir vu et replie, l outil
reste replie ») and 3 (« un nouveau message redeplie l outil »). The probe wraps
`setToolExternalOpen`/`setToolInlineNotification` of the menu runtime to log who reopens
the tool.
