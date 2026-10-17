# Sending to a contact fails with `project_work_mode_editing_blocked`

## Symptom

From the Dashboard, touching a contact opens the quick contact panel; a text or a
recorded take does not leave and the panel shows `project_work_mode_editing_blocked`.
In a project switched to Consultation, holding Audio/Visio does not even record.

## Root cause

Every tool call goes through `authorizeProjectTool`
(`eVe/domains/rendering/project_work_mode_state.js`). A template home (Basic,
Mystic) is always restored in Consultation, and only a fixed list of tools passed
outside Edit: `communication.conversation.send` and the conversation captures were
not in it. Contact acceptance is unrelated.

## Fix (2026-10-14)

Communication is not editing: the commands declared by `CONTACT_COMMUNICATION_COMMANDS`
(`isContactCommunicationCommand`) and `ui.capture.audio|video` whose destination is a
conversation (`isConversationDestination`, `atome/src/shared/communication_contract.js`)
are authorized in every work mode. The server stays the authority (`canCommunicate`).

## Regression check

- `temp/comm/dashboard_comm_l0_repro.probe.mjs`: text and take from the Mystic home,
  take from a project in Consultation.
- `temp/comm/dashboard_comm_e2e.probe.mjs` check 10: Consultation still refuses editing.

## Rejected hypothesis

- « The recipient must accept first »: a missing acceptance answers `contact_required`,
  never a work-mode error.
