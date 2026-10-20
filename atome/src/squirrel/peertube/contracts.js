import { createOnlineVideoContract } from '../online_video/contracts.js';
import { PEERTUBE_VIDEO_URL_PATTERN } from '../../shared/online_video_refs.js';

// The PeerTube tool plays a video of any PeerTube instance in place on a
// PeerTube Atome of the project; a video is named by its watch address.
const contract = createOnlineVideoContract({ key: 'peertube', label: 'PeerTube', refField: 'video_url',
    refSchema: { type: 'string', maxLength: 300, pattern: PEERTUBE_VIDEO_URL_PATTERN },
    searchErrors: ['unavailable', 'rate_limited'] });

export const PEERTUBE_ERRORS = contract.errors;
export const PEERTUBE_COMMANDS = contract.commands;
export const validatePeertubeInput = contract.validate;
export const normalizePeertubeError = contract.normalizeError;
