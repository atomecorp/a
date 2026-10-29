// Background work (the personal imports re-reading thousands of records, the AI model
// catalog asking every provider) yields to the foreground. On iOS it shares the one
// store connection and the one relay channel with what the person is waiting for: at
// launch it held the assistant's first connection 5-8 s behind it.
//
// It may run once the launch has settled (the host says so: presented, then a short
// rest) and while nothing holds the foreground (the assistant connecting). Waiters
// resume together when both hold; a later hold only delays the next step they await.
const holds = new Set();
let waiters = [];
let settled = false;

const allowed = () => settled && holds.size === 0;
const flush = () => {
    if (!allowed()) return;
    const ready = waiters; waiters = [];
    ready.forEach(resolve => resolve());
};

export const whenBackgroundAllowed = () => (allowed() ? Promise.resolve() : new Promise(resolve => waiters.push(resolve)));

// The launch has settled; idempotent.
export const markLaunchSettled = () => { settled = true; flush(); };

// The person waits on something: background work holds back until `release()`.
export const holdForeground = () => {
    const hold = Symbol('foreground');
    holds.add(hold);
    return () => { if (holds.delete(hold)) flush(); };
};
