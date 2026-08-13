const isClosedTransport = (request = null, reply = null) => (
  request?.raw?.aborted === true
  || request?.raw?.destroyed === true
  || reply?.raw?.destroyed === true
  || reply?.raw?.closed === true
);

const isPrematureStreamClose = (error = null) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim().toLowerCase();
  return code === 'ERR_STREAM_PREMATURE_CLOSE' || message === 'premature close';
};

export const classifyHttpLifecycleError = ({ error = null, request = null, reply = null } = {}) => {
  if (isPrematureStreamClose(error) && isClosedTransport(request, reply)) {
    return { kind: 'client_aborted', reportAsError: false };
  }
  return { kind: 'server_error', reportAsError: true };
};
