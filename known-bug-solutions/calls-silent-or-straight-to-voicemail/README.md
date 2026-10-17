# Calls: straight to voicemail, or connected without sound or image

## Symptoms

1. A call to a device that is open and signed in goes straight to voicemail; the callee
   only shows « Appel manqué ».
2. The call rings, is answered, both sides show « en direct » / `in_call`, and nothing
   is heard or seen.

## Root causes (atome.one, 2026-10-15)

1. **Presence lost.** The server only rings sockets attached to the account by a message
   carrying a valid token. The Fastify session lasts 15 min and was renewed only when a
   request needed it: an idle device fell off presence and was treated as absent.
2. **mediasoup on loopback.** Without `MEDIASOUP_LISTEN_IP` / `MEDIASOUP_ANNOUNCED_IP`,
   `server/visio.js` listens on `127.0.0.1`; the clients get loopback candidates only
   (WebKit then shows TCP candidates with an empty address) and ICE stays `checking`.

## Fixes

1. `atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js`
   (`scheduleRemoteRenewal`): the remote session is renewed on schedule while signed in;
   `FastifyAdapter.setToken` and the socket `onopen` re-announce presence (`auth me`).
2. `/etc/squirrel/squirrel.env` on the server: `MEDIASOUP_LISTEN_IP=0.0.0.0`,
   `MEDIASOUP_ANNOUNCED_IP=<public IP>`; RTC ports 40000–49999 UDP/TCP open. The server
   logs `[visio] mediasoup listens on loopback only` when this is missing.

## Diagnosis

- Presence: on the callee, `FastifyAdapter.ws.send({type:'auth', action:'me', token})`
  must succeed; decode the token `exp`. A call answered by `starting_recording` at once
  on the caller means the callee was not present.
- Media: hook `RTCPeerConnection.prototype.setLocalDescription` to collect the peer
  connections, then `getStats()`: `candidate-pair` state, `outbound-rtp`/`inbound-rtp`
  bytes and `audioLevel`. On the server: `ss -lunp | grep mediasoup` must not show
  `127.0.0.1` only.
