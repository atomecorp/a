import { createOnlineVideoContract } from '../online_video/contracts.js';
import { YOUTUBE_VIDEO_ID_PATTERN } from '../../shared/online_video_refs.js';

// The YouTube tool plays a video in place on a YouTube Atome of the project.
const contract = createOnlineVideoContract({ key: 'youtube', label: 'YouTube', refField: 'video_id',
    refSchema: { type: 'string', pattern: YOUTUBE_VIDEO_ID_PATTERN },
    searchErrors: ['not_configured', 'unavailable', 'rate_limited', 'quota_guard', 'quota_or_permission'] });

export const YOUTUBE_ERRORS = contract.errors;
export const YOUTUBE_OUTPUT_SCHEMA = contract.outputSchema;
export const YOUTUBE_COMMANDS = contract.commands;
export const validateYoutubeInput = contract.validate;
export const normalizeYoutubeError = contract.normalizeError;
