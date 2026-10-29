import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { YOUTUBE_COMMANDS, validateYoutubeInput } from '../youtube/contracts.js';
import { PEERTUBE_COMMANDS, validatePeertubeInput } from '../peertube/contracts.js';
import { SOCIAL_COMMANDS, validateSocialInput } from '../social/contracts.js';
import { APPLE_MUSIC_COMMANDS, validateAppleMusicInput } from '../apple_music/contracts.js';
import { MUSIC_ASSISTANT_INSTRUCTIONS, MUSIC_COMMANDS, validateMusicInput } from '../music/contracts.js';
import { GPS_ASSISTANT_INSTRUCTIONS, GPS_COMMANDS, validateGpsInput } from '../gps/contracts.js';
import { TRAINING_ASSISTANT_INSTRUCTIONS, TRAINING_COMMANDS, validateTrainingInput } from '../training/contracts.js';
import { BRICK_SESSION_ASSISTANT_INSTRUCTIONS, BRICK_SESSION_COMMANDS, validateBrickSessionInput } from '../brick_sessions/contracts.js';
import { HEALTH_FEELING_ASSISTANT_INSTRUCTIONS, HEALTH_FEELING_COMMANDS, validateHealthFeelingInput } from '../health/feeling_contracts.js';
import { HEALTH_DECLARATION_ASSISTANT_INSTRUCTIONS, HEALTH_DECLARATION_COMMANDS, validateHealthDeclarationInput } from '../health/declaration_contracts.js';
import { SHOPPING_ASSISTANT_INSTRUCTIONS, SHOPPING_COMMANDS, validateShoppingInput } from '../shopping/contracts.js';
import { SHOWS_ASSISTANT_INSTRUCTIONS, SHOWS_COMMANDS, validateShowsInput } from '../shows/contracts.js';
import { WEB_ASSISTANT_INSTRUCTIONS, WEB_COMMANDS, validateWebInput } from '../web/contracts.js';
import { EVENTS_ASSISTANT_INSTRUCTIONS, EVENTS_COMMANDS, EVENTS_CONFIRMED_COMMANDS, validateEventsInput } from '../public_events/contracts.js';
import { SHOP_ASSISTANT_INSTRUCTIONS, SHOP_COMMANDS, SHOP_CONFIRMED_COMMANDS, validateShopInput } from '../shop/contracts.js';
import { COACH_ASSISTANT_INSTRUCTIONS, COACH_COMMANDS, COACH_CONFIRMED_COMMANDS, validateCoachInput } from '../coaches/contracts.js';
import { FILMS_ASSISTANT_INSTRUCTIONS, FILMS_COMMANDS, validateFilmsInput } from '../films/contracts.js';
import { CREATION_ASSISTANT_INSTRUCTIONS, CREATION_COMMANDS, validateCreationInput } from '../creation/contracts.js';
import { MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS, MEDIA_IMPORT_COMMANDS, validateMediaImportInput } from '../media_import/contracts.js';
import { FOOD_ASSISTANT_INSTRUCTIONS, FOOD_COMMANDS, validateFoodInput } from '../food/contracts.js';
import { BOOKS_ASSISTANT_INSTRUCTIONS, BOOKS_COMMANDS, validateBooksInput } from '../books/contracts.js';
import { CAPTURE_ASSISTANT_INSTRUCTIONS, CAPTURE_COMMANDS, validateCaptureInput } from '../capture/contracts.js';
import { LIFE_PROFILE_ASSISTANT_INSTRUCTIONS, LIFE_PROFILE_COMMANDS, validateLifeProfileInput } from '../life_profiles/contracts.js';
import { PROJECTS_ASSISTANT_INSTRUCTIONS, PROJECTS_COMMANDS, validateProjectsInput } from '../projects/contracts.js';
import { DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS, DASHBOARD_PROGRESSION_COMMANDS, validateDashboardProgressionInput } from '../dashboard_progression/contracts.js';
import { SENSORS_ASSISTANT_INSTRUCTIONS, SENSORS_COMMANDS, validateSensorsInput } from '../health/sensor_contracts.js';
import { BODY_DATA_ASSISTANT_INSTRUCTIONS, BODY_DATA_COMMANDS, validateBodyDataInput } from '../health/body_data_contracts.js';
import { SITE_ASSISTANT_INSTRUCTIONS, SITE_COMMANDS, SITE_CONFIRMED_COMMANDS, validateSiteInput } from '../site/contracts.js';
import { INTERACTIONS_ASSISTANT_INSTRUCTIONS, INTERACTIONS_COMMANDS, validateInteractionsInput } from '../interactions/contracts.js';
import { PUBLISH_ASSISTANT_INSTRUCTIONS, PUBLISH_COMMANDS, PUBLISH_CONFIRMED_COMMANDS, validatePublishInput } from '../publish/contracts.js';
import { VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS, VIDEO_TRAIN_COMMANDS, VIDEO_TRAIN_CONFIRMED_COMMANDS, validateVideoTrainInput } from '../video_train/contracts.js';

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
    { id: 'brick_session', commands: BRICK_SESSION_COMMANDS, validate: validateBrickSessionInput, noClient: 'AUTH_REQUIRED',
        instructions: BRICK_SESSION_ASSISTANT_INSTRUCTIONS, preload: ['brick_session.prepare', 'brick_session.transition', 'brick_session.get'] },
    { id: 'health_declaration', commands: HEALTH_DECLARATION_COMMANDS, validate: validateHealthDeclarationInput, noClient: 'AUTH_REQUIRED',
        instructions: HEALTH_DECLARATION_ASSISTANT_INSTRUCTIONS, preload: ['health_declaration.add', 'health_declaration.withdraw'] },
    { id: 'health_feeling', commands: HEALTH_FEELING_COMMANDS, validate: validateHealthFeelingInput, noClient: 'AUTH_REQUIRED',
        instructions: HEALTH_FEELING_ASSISTANT_INSTRUCTIONS, preload: ['health_feeling.set'] },
    { id: 'sensors', commands: SENSORS_COMMANDS, validate: validateSensorsInput, noClient: 'health_host_unsupported',
        confirmed: ['sensors.delete'], instructions: SENSORS_ASSISTANT_INSTRUCTIONS, preload: ['sensors.status', 'sensors.list'] },
    // Erasing the body weight and age from the card is the user's to allow.
    { id: 'body_data', commands: BODY_DATA_COMMANDS, validate: validateBodyDataInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['body_data.delete'], instructions: BODY_DATA_ASSISTANT_INSTRUCTIONS, preload: ['body_data.consent', 'body_data.set_consent'] },
    { id: 'shopping', commands: SHOPPING_COMMANDS, validate: validateShoppingInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['shopping.clear_checked', 'shopping.share'], instructions: SHOPPING_ASSISTANT_INSTRUCTIONS,
        preload: ['shopping.add', 'shopping.check', 'shopping.list', 'shopping.open'] },
    { id: 'shows', commands: SHOWS_COMMANDS, validate: validateShowsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: SHOWS_ASSISTANT_INSTRUCTIONS,
        preload: ['shows.search', 'shows.open', 'shows.set_place', 'shows.add_to_calendar', 'shows.navigate', 'shows.open_site', 'shows.open_tickets'] },
    { id: 'web', commands: WEB_COMMANDS, validate: validateWebInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: WEB_ASSISTANT_INSTRUCTIONS, preload: ['web.open', 'web.navigate', 'web.favorite', 'web.size', 'web.close'] },
    // Publishing an event to everyone around is the user's to confirm.
    { id: 'events', commands: EVENTS_COMMANDS, validate: validateEventsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: EVENTS_CONFIRMED_COMMANDS, instructions: EVENTS_ASSISTANT_INSTRUCTIONS,
        preload: ['events.declare', 'events.nearby', 'events.mine', 'events.open', 'events.panel', 'events.save'] },
    // Selling and buying are the user's to confirm (the payment is simulated for now).
    { id: 'shop', commands: SHOP_COMMANDS, validate: validateShopInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: SHOP_CONFIRMED_COMMANDS, instructions: SHOP_ASSISTANT_INSTRUCTIONS,
        preload: ['shop.browse', 'shop.open', 'shop.sell', 'shop.mine', 'shop.buy', 'shop.write'] },
    // Asking a coach for a session, cancelling one, publishing one's coaching are the user's to confirm.
    { id: 'coaches', commands: COACH_COMMANDS, validate: validateCoachInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: COACH_CONFIRMED_COMMANDS, instructions: COACH_ASSISTANT_INSTRUCTIONS,
        preload: ['coaches.find', 'coaches.slots', 'coaches.book', 'coaches.bookings', 'coaches.open', 'coaches.mine'] },
    { id: 'films', commands: FILMS_COMMANDS, validate: validateFilmsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: FILMS_ASSISTANT_INSTRUCTIONS, preload: ['films.search', 'films.play', 'films.open', 'films.control', 'films.set_service'] },
    { id: 'creation', commands: CREATION_COMMANDS, validate: validateCreationInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['creation.send'], instructions: CREATION_ASSISTANT_INSTRUCTIONS,
        preload: ['creation.list', 'creation.read', 'creation.new_text', 'creation.open'] },
    // The camera, turned on and taken from by a command, is the user's to allow.
    { id: 'media_import', commands: MEDIA_IMPORT_COMMANDS, validate: validateMediaImportInput, noClient: 'NOT_OPEN',
        confirmed: ['media_import.camera', 'media_import.take'], instructions: MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS,
        preload: ['media_import.state', 'media_import.list', 'media_import.choose'] },
    // A capture turns the camera or the microphone on, a delete takes items out of the project: the user's to allow.
    { id: 'captures', commands: CAPTURE_COMMANDS, validate: validateCaptureInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['captures.start', 'captures.delete'], instructions: CAPTURE_ASSISTANT_INSTRUCTIONS,
        preload: ['captures.state', 'captures.show', 'captures.play', 'captures.stop', 'captures.camera'] },
    // Deleting a profile changes what every list shows: the user's to allow.
    { id: 'profiles', commands: LIFE_PROFILE_COMMANDS, validate: validateLifeProfileInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['profiles.delete'], instructions: LIFE_PROFILE_ASSISTANT_INSTRUCTIONS,
        preload: ['profiles.list', 'profiles.activate', 'profiles.create', 'profiles.assign'] },
    { id: 'food', commands: FOOD_COMMANDS, validate: validateFoodInput, noClient: 'HOST_UNSUPPORTED',
        instructions: FOOD_ASSISTANT_INSTRUCTIONS, preload: ['food.search', 'food.alternatives', 'food.scan', 'food.add'] },
    { id: 'books', commands: BOOKS_COMMANDS, validate: validateBooksInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: BOOKS_ASSISTANT_INSTRUCTIONS, preload: ['books.list', 'books.open', 'books.page', 'books.transport'] },
    { id: 'projects', commands: PROJECTS_COMMANDS, validate: validateProjectsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: PROJECTS_ASSISTANT_INSTRUCTIONS, preload: ['projects.list', 'projects.search', 'projects.open', 'projects.create', 'projects.favorite'] },
    { id: 'dashboard_progression', commands: DASHBOARD_PROGRESSION_COMMANDS, validate: validateDashboardProgressionInput,
        noClient: 'progression_actor_required', instructions: DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS },
    // Putting a site online, buying a domain or a mail box is the user's to confirm.
    { id: 'site', commands: SITE_COMMANDS, validate: validateSiteInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: SITE_CONFIRMED_COMMANDS, instructions: SITE_ASSISTANT_INSTRUCTIONS,
        preload: ['site.state', 'site.publish', 'site.pages', 'site.list', 'site.menu', 'site.form', 'site.goto'] },
    { id: 'interactions', commands: INTERACTIONS_COMMANDS, validate: validateInteractionsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: INTERACTIONS_ASSISTANT_INSTRUCTIONS, preload: ['interactions.list', 'interactions.create'] },
    // Sending a session to people and withdrawing a contribution are the user's to confirm.
    { id: 'video_train', commands: VIDEO_TRAIN_COMMANDS, validate: validateVideoTrainInput, noClient: 'AUTH_REQUIRED',
        confirmed: VIDEO_TRAIN_CONFIRMED_COMMANDS, instructions: VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS,
        preload: ['video_train.share', 'video_train.thread', 'video_train.open_thread', 'video_train.reply', 'video_train.vote'] },
    // Publier: a send, an update, a send now and a cancel are the user's to confirm.
    { id: 'publish', commands: PUBLISH_COMMANDS, validate: validatePublishInput, noClient: 'AUTH_REQUIRED',
        confirmed: PUBLISH_CONFIRMED_COMMANDS, instructions: PUBLISH_ASSISTANT_INSTRUCTIONS,
        preload: ['publish.recipients', 'publish.send', 'publish.list', 'publish.edit', 'publish.cancel'] }
].map(family => Object.freeze({ confirmed: [], preload: [], instructions: '', ...family, layer: `atome_mcp_${family.id}` })));

export const MCP_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.commands));
export const MCP_CONFIRMED_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.confirmed));
export const MCP_CONTRACT_CAPABILITIES = Object.freeze([...new Set(MCP_CONTRACT_COMMANDS.map(command => command.capability))]);
export const MCP_CONTRACT_PRELOAD = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.preload));
export const MCP_CONTRACT_ASSISTANT_INSTRUCTIONS = MCP_CONTRACT_FAMILIES.map(family => family.instructions).filter(Boolean).join(' ');
export const findContractCommand = name => MCP_CONTRACT_COMMANDS.find(command => command.name === name) || null;
