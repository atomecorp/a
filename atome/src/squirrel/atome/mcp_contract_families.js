import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { YOUTUBE_COMMANDS, validateYoutubeInput } from '../youtube/contracts.js';
import { PEERTUBE_COMMANDS, validatePeertubeInput } from '../peertube/contracts.js';
import { SOCIAL_COMMANDS, validateSocialInput } from '../social/contracts.js';
import { APPLE_MUSIC_COMMANDS, validateAppleMusicInput } from '../apple_music/contracts.js';
import { MUSIC_ASSISTANT_INSTRUCTIONS, MUSIC_COMMANDS, validateMusicInput } from '../music/contracts.js';
import { GPS_ASSISTANT_INSTRUCTIONS, GPS_COMMANDS, validateGpsInput } from '../gps/contracts.js';
import { TRAINING_ASSISTANT_INSTRUCTIONS, TRAINING_COMMANDS, validateTrainingInput } from '../training/contracts.js';
import { SHOPPING_ASSISTANT_INSTRUCTIONS, SHOPPING_COMMANDS, validateShoppingInput } from '../shopping/contracts.js';
import { SHOWS_ASSISTANT_INSTRUCTIONS, SHOWS_COMMANDS, validateShowsInput } from '../shows/contracts.js';
import { EVENTS_ASSISTANT_INSTRUCTIONS, EVENTS_COMMANDS, EVENTS_CONFIRMED_COMMANDS, validateEventsInput } from '../public_events/contracts.js';
import { FILMS_ASSISTANT_INSTRUCTIONS, FILMS_COMMANDS, validateFilmsInput } from '../films/contracts.js';
import { CREATION_ASSISTANT_INSTRUCTIONS, CREATION_COMMANDS, validateCreationInput } from '../creation/contracts.js';
import { MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS, MEDIA_IMPORT_COMMANDS, validateMediaImportInput } from '../media_import/contracts.js';
import { FOOD_ASSISTANT_INSTRUCTIONS, FOOD_COMMANDS, validateFoodInput } from '../food/contracts.js';
import { BOOKS_ASSISTANT_INSTRUCTIONS, BOOKS_COMMANDS, validateBooksInput } from '../books/contracts.js';
import { DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS, DASHBOARD_PROGRESSION_COMMANDS, validateDashboardProgressionInput } from '../dashboard_progression/contracts.js';

// The one list of the domain command families. Direct MCP handlers, the access policy, the
// default actor's capabilities, the eVe runtime tools and the assistant's instructions and
// preloaded commands all read it: a family declared here is reachable by voice everywhere at once.
// `confirmed`: commands the user confirms; `preload`: commands the assistant can call without a search.
export const MCP_CONTRACT_FAMILIES = Object.freeze([
    { id: 'tv', commands: TV_COMMANDS, validate: validateTvInput, noClient: 'NO_ACTIVE_CLIENT', preload: ['tv.open_channel'] },
    { id: 'youtube', commands: YOUTUBE_COMMANDS, validate: validateYoutubeInput, noClient: 'NO_ACTIVE_VIDEO', preload: ['youtube.play'] },
    { id: 'peertube', commands: PEERTUBE_COMMANDS, validate: validatePeertubeInput, noClient: 'NO_ACTIVE_VIDEO' },
    { id: 'social', commands: SOCIAL_COMMANDS, validate: validateSocialInput, noClient: 'social_handoff_unavailable',
        confirmed: ['social.connect', 'social.publish', 'social.disconnect'] },
    { id: 'apple_music', commands: APPLE_MUSIC_COMMANDS, validate: validateAppleMusicInput, noClient: 'HOST_UNSUPPORTED' },
    { id: 'music', commands: MUSIC_COMMANDS, validate: validateMusicInput, noClient: 'AUTH_REQUIRED',
        instructions: MUSIC_ASSISTANT_INSTRUCTIONS, preload: ['music.get_state', 'music.play', 'music.search'] },
    { id: 'gps', commands: GPS_COMMANDS, validate: validateGpsInput, noClient: 'HOST_UNSUPPORTED',
        instructions: GPS_ASSISTANT_INSTRUCTIONS, preload: ['gps.navigate_to', 'gps.stop_navigation'] },
    { id: 'training', commands: TRAINING_COMMANDS, validate: validateTrainingInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['training.schedule_week'], instructions: TRAINING_ASSISTANT_INSTRUCTIONS,
        preload: ['training.prepare_session', 'training.session_transition', 'training.get_session'] },
    { id: 'shopping', commands: SHOPPING_COMMANDS, validate: validateShoppingInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['shopping.clear_checked'], instructions: SHOPPING_ASSISTANT_INSTRUCTIONS,
        preload: ['shopping.add', 'shopping.check', 'shopping.list', 'shopping.open'] },
    { id: 'shows', commands: SHOWS_COMMANDS, validate: validateShowsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: SHOWS_ASSISTANT_INSTRUCTIONS,
        preload: ['shows.search', 'shows.open', 'shows.set_place', 'shows.add_to_calendar', 'shows.navigate', 'shows.open_site', 'shows.open_tickets'] },
    // Publishing an event to everyone around is the user's to confirm.
    { id: 'events', commands: EVENTS_COMMANDS, validate: validateEventsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: EVENTS_CONFIRMED_COMMANDS, instructions: EVENTS_ASSISTANT_INSTRUCTIONS,
        preload: ['events.declare', 'events.nearby', 'events.mine', 'events.open', 'events.panel', 'events.save'] },
    { id: 'films', commands: FILMS_COMMANDS, validate: validateFilmsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: FILMS_ASSISTANT_INSTRUCTIONS, preload: ['films.search', 'films.play', 'films.open', 'films.control', 'films.set_service'] },
    { id: 'creation', commands: CREATION_COMMANDS, validate: validateCreationInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['creation.send'], instructions: CREATION_ASSISTANT_INSTRUCTIONS,
        preload: ['creation.list', 'creation.read', 'creation.new_text', 'creation.open'] },
    // The camera, turned on and taken from by a command, is the user's to allow.
    { id: 'media_import', commands: MEDIA_IMPORT_COMMANDS, validate: validateMediaImportInput, noClient: 'NOT_OPEN',
        confirmed: ['media_import.camera', 'media_import.take'], instructions: MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS,
        preload: ['media_import.state', 'media_import.list', 'media_import.choose'] },
    { id: 'food', commands: FOOD_COMMANDS, validate: validateFoodInput, noClient: 'HOST_UNSUPPORTED',
        instructions: FOOD_ASSISTANT_INSTRUCTIONS, preload: ['food.search', 'food.alternatives', 'food.scan'] },
    { id: 'books', commands: BOOKS_COMMANDS, validate: validateBooksInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: BOOKS_ASSISTANT_INSTRUCTIONS, preload: ['books.list', 'books.open', 'books.page', 'books.transport'] },
    { id: 'dashboard_progression', commands: DASHBOARD_PROGRESSION_COMMANDS, validate: validateDashboardProgressionInput,
        noClient: 'progression_actor_required', instructions: DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS }
].map(family => Object.freeze({ confirmed: [], preload: [], instructions: '', ...family, layer: `atome_mcp_${family.id}` })));

export const MCP_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.commands));
export const MCP_CONFIRMED_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.confirmed));
export const MCP_CONTRACT_CAPABILITIES = Object.freeze([...new Set(MCP_CONTRACT_COMMANDS.map(command => command.capability))]);
export const MCP_CONTRACT_PRELOAD = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.preload));
export const MCP_CONTRACT_ASSISTANT_INSTRUCTIONS = MCP_CONTRACT_FAMILIES.map(family => family.instructions).filter(Boolean).join(' ');
export const findContractCommand = name => MCP_CONTRACT_COMMANDS.find(command => command.name === name) || null;
