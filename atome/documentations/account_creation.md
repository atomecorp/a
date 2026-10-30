# Creating an account on atome.one

Status: 2026-10-30. Owners: `server/auth_accounts.js` (creation), `server/auth_invites.js` (invitations),
`server/system_mailer.js` (the server's sender), `eVe/intuition/tools/contact_invite.js` (the inviter's side),
`eVe/domains/user/first_launch_auth_flow.js` (the invited person's first launch).

## For now, by invitation only

Sign-up on atome.one is closed. An account is created **only with an invitation**, sent by someone who already has an
account. Opening sign-up to everyone again later is a server setting (`ATOME_SIGNUP_CLOSED`, below), not new code.

What stays open to everyone, invitation or not:

- **Commencer** (the free space): eVe on the device itself, without an account and without anything sent to the
  server. It works as before.
- **Reconnecting** an existing account on a new device.

## Inviting someone

Invitations are made in eVe itself, on a desktop (the Tauri app, macOS or Windows) or on a mobile (the iOS app), and in
the browser too, from any connected account:

1. Open the **Contacts** rubric. Its tools row ends with **Invit.** (an envelope with a plus).
2. Touch **Invit.**: its card asks for the person's **mail address** and, if you wish, a word of your own.
3. Touch **Envoi**. The card folds: the invitation is on its way.

Every account may invite, with no fixed number of invitations; the server only slows down a flood (34 an hour,
144 a day per account). A device added to an account too recently (still in its probation period) cannot invite yet:
the card says so.

The same invitation can be sent by the assistant or any automation through the command `contact.invite.send`
(`email`, optional `message`, `inviteId`).

### Offline

An invitation made without a connection is kept on the device (an Atome of type `contact_invitation`, state
`pending`) and leaves by itself at the next connection. Its state then becomes `sent` (or `failed` when the server
refuses it for good).

### The mail

The server sends it from **noreply@atome.one**, under the name « *Your name* via eVe », in the inviter's language. It
holds the inviter's word, if any, and a link `https://atome.one/#invite=…`. Answering it reaches nobody.

## Accepting an invitation

1. Open the link of the mail. eVe starts on atome.one; the invitation is read from the link and immediately removed from
   the address bar.
2. Touch **Commencer**, then **Créer un compte**.
3. Choose a payment method and pay: payment is kept, invitation or not.
4. The account is created on that device; the invitation is spent.

Without an invitation, or with one that is spent, expired or replaced, **Créer un compte** stays where it is and says
« Création de compte sur invitation pour le moment. » (or « Invitation expirée ou déjà utilisée. »). **Commencer**
remains available.

## Rules of an invitation

- **One use.** The first account created with it spends it, in the same database transaction as the account; a second
  attempt, even at the same instant, is refused.
- **21 days.** After that it is refused.
- **One live invitation per address and inviter.** Inviting the same address again withdraws the previous link.
- **Nothing readable is kept.** The server stores only a digest of the link's secret and a keyed index of the address;
  neither the link nor the address can be read back from the database. The mail address is never an identifier, a
  login or a recovery channel (security_architecture.md): it only carries the link.
- **Not sent, not kept.** If the mail cannot leave, the server keeps nothing of it; the inviter's device keeps it
  `pending` and sends it again at its next connection. A refusal that a new try would not change (a wrong address, a
  device still in its probation period) is said on the card and the invitation is kept `failed`.
- It opens **account creation only**; the phone (SMS) path stays closed.

## Server settings

In `/etc/squirrel/squirrel.env` (and `/etc/squirrel-staging/squirrel.env` for the test server); see
[server_installation.md](server_installation.md#sign-up-and-invitations).

| Variable | Role |
| :--- | :--- |
| `ATOME_SIGNUP_CLOSED=1` | Sign-up by invitation only. Remove it to open sign-up to everyone again. |
| `ATOME_SITE_ORIGIN` | The site the link points to (`https://atome.one`, `https://staging.atome.one`). |
| `ATOME_MAIL_FROM` | The sender address, `noreply@atome.one`. |
| `ATOME_MAIL_SMTP_HOST` | The o2switch server that hosts atome.one's mail, by the name on its certificate: `rousse.o2switch.net` (`mail.atome.one` points to the same machine but its certificate does not carry that name, so TLS refuses it). |
| `ATOME_MAIL_SMTP_PASSWORD` | The password of the `noreply@atome.one` mailbox. |
| `ATOME_MAIL_SMTP_USER` | Optional; defaults to `ATOME_MAIL_FROM`. |
| `ATOME_MAIL_SMTP_PORT`, `ATOME_MAIL_SMTP_SECURITY` | Optional; `tls` on 465 by default, or `starttls` on 587. |

Without the three mail settings, an invitation is refused with `system_mail_unconfigured`: nothing is created.
