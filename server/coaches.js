// The coaches' services, assembled once for the server (server/server_services.js): the shared directory of public
// coaching agendas and their free slots (server/coach_directory.js), the bookings and their answers (server/coach_bookings.js).
import { createCoachDirectory } from './coach_directory.js';
import { createCoachBookings } from './coach_bookings.js';

// `broadcast(change)`: every open screen hears a coach changed; `tell(userId, change)`: one account hears its bookings moved.
export function createCoaches({ query, vaultRouter, syncRuntime, relations, findUserName, notify, broadcast, tell }) {
    const directory = createCoachDirectory({ query, vaultRouter, relations, broadcast });
    const bookings = createCoachBookings({ query, directory, vaultRouter, syncRuntime, relations, findUserName, notify, tell });
    return { directory, bookings };
}
