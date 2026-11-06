import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { YOUTUBE_COMMANDS, validateYoutubeInput } from '../youtube/contracts.js';
import { PEERTUBE_COMMANDS, validatePeertubeInput } from '../peertube/contracts.js';
import { SOCIAL_COMMANDS, validateSocialInput } from '../social/contracts.js';
import { APPLE_MUSIC_COMMANDS, validateAppleMusicInput } from '../apple_music/contracts.js';
import { MUSIC_ASSISTANT_INSTRUCTIONS, MUSIC_COMMANDS, validateMusicInput } from '../music/contracts.js';
import { GPS_ASSISTANT_INSTRUCTIONS, GPS_COMMANDS, validateGpsInput } from '../gps/contracts.js';
import { TRAINING_ASSISTANT_INSTRUCTIONS, TRAINING_COMMANDS, validateTrainingInput } from '../training/contracts.js';
import { BRICK_SESSION_ASSISTANT_INSTRUCTIONS, BRICK_SESSION_COMMANDS, validateBrickSessionInput } from '../brick_sessions/contracts.js';
import { BEAUTY_ASSISTANT_INSTRUCTIONS, BEAUTY_COMMANDS, validateBeautyInput } from '../beauty/contracts.js';
import { HEALTH_FEELING_ASSISTANT_INSTRUCTIONS, HEALTH_FEELING_COMMANDS, HEALTH_FEELING_CONFIRMED_COMMANDS, validateHealthFeelingInput } from '../health/feeling_contracts.js';
import { HEALTH_PROFILE_ASSISTANT_INSTRUCTIONS, HEALTH_PROFILE_COMMANDS, HEALTH_PROFILE_CONFIRMED_COMMANDS, validateHealthProfileInput } from '../health/profile_contracts.js';
import { HEALTH_PROTOCOL_ASSISTANT_INSTRUCTIONS, HEALTH_PROTOCOL_COMMANDS, HEALTH_PROTOCOL_CONFIRMED_COMMANDS, HEALTH_PRODUCTS_COMMANDS, validateHealthProductsInput,
    validateHealthProtocolInput, HEALTH_PRODUCTS_CONFIRMED_COMMANDS } from '../health/protocol_contracts.js';
import { OBJECTIVE_PROGRAM_ASSISTANT_INSTRUCTIONS, OBJECTIVE_PROGRAM_COMMANDS, OBJECTIVE_PROGRAM_CONFIRMED_COMMANDS, validateObjectiveProgramInput } from '../objective_program/contracts.js';
import { ORDONNANCE_ASSISTANT_INSTRUCTIONS, ORDONNANCE_COMMANDS, ORDONNANCE_CONFIRMED_COMMANDS, validateOrdonnanceInput } from '../prescription/contracts.js';
import { PRESCRIPTION_AID_ASSISTANT_INSTRUCTIONS, PRESCRIPTION_AID_COMMANDS, PRESCRIPTION_AID_CONFIRMED_COMMANDS, validatePrescriptionAidInput }
    from '../prescription/prescription_aid_contracts.js';
import { FOOD_ADVICE_ASSISTANT_INSTRUCTIONS, FOOD_ADVICE_COMMANDS, validateFoodAdviceInput } from '../health/food_advice_contracts.js';
import { HEALTH_RECORD_ASSISTANT_INSTRUCTIONS, HEALTH_RECORD_COMMANDS, HEALTH_RECORD_CONFIRMED_COMMANDS, validateHealthRecordInput } from '../health/health_record_contracts.js';
import { THALASSO_ASSISTANT_INSTRUCTIONS, THALASSO_COMMANDS, THALASSO_CONFIRMED_COMMANDS, validateThalassoInput } from '../thalasso/contracts.js';
import { HEALTH_DECLARATION_ASSISTANT_INSTRUCTIONS, HEALTH_DECLARATION_COMMANDS, validateHealthDeclarationInput } from '../health/declaration_contracts.js';
import { SHOPPING_ASSISTANT_INSTRUCTIONS, SHOPPING_COMMANDS, validateShoppingInput } from '../shopping/contracts.js';
import { MEDIA_LIST_ASSISTANT_INSTRUCTIONS, MEDIA_LIST_COMMANDS, validateMediaListInput } from '../media_lists/contracts.js';
import { SHARE_ASSISTANT_INSTRUCTIONS, SHARE_COMMANDS, SHARE_CONFIRMED_COMMANDS, validateShareInput } from '../sharing/contracts.js';
import { SHOWS_ASSISTANT_INSTRUCTIONS, SHOWS_COMMANDS, validateShowsInput } from '../shows/contracts.js';
import { WEB_ASSISTANT_INSTRUCTIONS, WEB_COMMANDS, validateWebInput } from '../web/contracts.js';
import { EVENTS_ASSISTANT_INSTRUCTIONS, EVENTS_COMMANDS, EVENTS_CONFIRMED_COMMANDS, validateEventsInput } from '../public_events/contracts.js';
import { SHOP_ASSISTANT_INSTRUCTIONS, SHOP_COMMANDS, SHOP_CONFIRMED_COMMANDS, validateShopInput } from '../shop/contracts.js';
import { COACH_ASSISTANT_INSTRUCTIONS, COACH_COMMANDS, COACH_CONFIRMED_COMMANDS, validateCoachInput } from '../coaches/contracts.js';
import { FILMS_ASSISTANT_INSTRUCTIONS, FILMS_COMMANDS, validateFilmsInput } from '../films/contracts.js';
import { CREATION_ASSISTANT_INSTRUCTIONS, CREATION_COMMANDS, validateCreationInput } from '../creation/contracts.js';
import { CALC_ASSISTANT_INSTRUCTIONS, CALC_COMMANDS, validateCalcInput } from '../calc/contracts.js';
import { DOCUMENT_ASSISTANT_INSTRUCTIONS, DOCUMENT_COMMANDS, validateDocumentInput } from '../document/contracts.js';
import { SCRIPT_ASSISTANT_INSTRUCTIONS, SCRIPT_COMMANDS, SCRIPT_CONFIRMED_COMMANDS, validateScriptInput } from '../script/contracts.js';
import { AUDIO_FX_ASSISTANT_INSTRUCTIONS, AUDIO_FX_COMMANDS, validateAudioFxInput } from '../audio_fx/contracts.js';
import { MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS, MEDIA_IMPORT_COMMANDS, validateMediaImportInput } from '../media_import/contracts.js';
import { FOOD_ASSISTANT_INSTRUCTIONS, FOOD_COMMANDS, validateFoodInput } from '../food/contracts.js';
import { BOOKS_ASSISTANT_INSTRUCTIONS, BOOKS_COMMANDS, BOOKS_CONFIRMED_COMMANDS, validateBooksInput } from '../books/contracts.js';
import { CAPTURE_ASSISTANT_INSTRUCTIONS, CAPTURE_COMMANDS, validateCaptureInput } from '../capture/contracts.js';
import { LIFE_PROFILE_ASSISTANT_INSTRUCTIONS, LIFE_PROFILE_COMMANDS, validateLifeProfileInput } from '../life_profiles/contracts.js';
import { PROJECTS_ASSISTANT_INSTRUCTIONS, PROJECTS_COMMANDS, validateProjectsInput } from '../projects/contracts.js';
import { CODE_PROJECT_ASSISTANT_INSTRUCTIONS, CODE_PROJECT_COMMANDS, validateCodeProjectInput } from '../code_projects/contracts.js';
import { DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS, DASHBOARD_PROGRESSION_COMMANDS, validateDashboardProgressionInput } from '../dashboard_progression/contracts.js';
import { SENSORS_ASSISTANT_INSTRUCTIONS, SENSORS_COMMANDS, validateSensorsInput } from '../health/sensor_contracts.js';
import { BODY_DATA_ASSISTANT_INSTRUCTIONS, BODY_DATA_COMMANDS, validateBodyDataInput } from '../health/body_data_contracts.js';
import { SITE_ASSISTANT_INSTRUCTIONS, SITE_COMMANDS, SITE_CONFIRMED_COMMANDS, validateSiteInput } from '../site/contracts.js';
import { QR_ASSISTANT_INSTRUCTIONS, QR_COMMANDS, validateQrInput } from '../qr/contracts.js';
import { INTERACTIONS_ASSISTANT_INSTRUCTIONS, INTERACTIONS_COMMANDS, validateInteractionsInput } from '../interactions/contracts.js';
import { PUBLISH_ASSISTANT_INSTRUCTIONS, PUBLISH_COMMANDS, PUBLISH_CONFIRMED_COMMANDS, validatePublishInput } from '../publish/contracts.js';
import { FORUM_ASSISTANT_INSTRUCTIONS, FORUM_COMMANDS, FORUM_CONFIRMED_COMMANDS, validateForumInput } from '../forum/contracts.js';
import { VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS, VIDEO_TRAIN_COMMANDS, VIDEO_TRAIN_CONFIRMED_COMMANDS, validateVideoTrainInput } from '../video_train/contracts.js';
import { RESULTS_SEND_ASSISTANT_INSTRUCTIONS, RESULTS_SEND_COMMANDS, validateResultsSendInput } from '../results_send/contracts.js';
import { STRAVA_ASSISTANT_INSTRUCTIONS, STRAVA_COMMANDS, validateStravaInput } from '../strava/contracts.js';
import { HEALTH_SYNC_ASSISTANT_INSTRUCTIONS, HEALTH_SYNC_COMMANDS, HEALTH_SYNC_CONFIRMED_COMMANDS, validateHealthSyncInput } from '../health/health_sync_contracts.js';
import { MCP_ACCESS_ASSISTANT_INSTRUCTIONS, MCP_ACCESS_COMMANDS, MCP_ACCESS_CONFIRMED_COMMANDS, validateMcpAccessInput } from '../mcp_access/contracts.js';
import { OBJECTIVE_NETWORK_ASSISTANT_INSTRUCTIONS, OBJECTIVE_NETWORK_COMMANDS, OBJECTIVE_NETWORK_CONFIRMED_COMMANDS, validateObjectiveNetworkInput } from '../objective_network/contracts.js';

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
        confirmed: ['training.schedule_week', 'training.take_ready_program', 'training.remove_media', 'training.remove_discipline', 'training.remove_activity'], instructions: TRAINING_ASSISTANT_INSTRUCTIONS,
        preload: ['training.prepare_session', 'training.session_transition', 'training.get_session'] },
    { id: 'brick_session', commands: BRICK_SESSION_COMMANDS, validate: validateBrickSessionInput, noClient: 'AUTH_REQUIRED',
        instructions: BRICK_SESSION_ASSISTANT_INSTRUCTIONS, preload: ['brick_session.prepare', 'brick_session.transition', 'brick_session.get'] },
    // Bien-être › Beauté (R-006 Q68): a photo turns the camera on, the user's to allow.
    { id: 'beauty', commands: BEAUTY_COMMANDS, validate: validateBeautyInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['beauty.shoot', 'beauty.remove_photo'], instructions: BEAUTY_ASSISTANT_INSTRUCTIONS, preload: ['beauty.open', 'beauty.shoot', 'beauty.set_reminder'] },
    { id: 'health_declaration', commands: HEALTH_DECLARATION_COMMANDS, validate: validateHealthDeclarationInput, noClient: 'AUTH_REQUIRED',
        instructions: HEALTH_DECLARATION_ASSISTANT_INSTRUCTIONS, preload: ['health_declaration.add', 'health_declaration.withdraw'] },
    { id: 'health_feeling', commands: HEALTH_FEELING_COMMANDS, validate: validateHealthFeelingInput, noClient: 'AUTH_REQUIRED', confirmed: HEALTH_FEELING_CONFIRMED_COMMANDS,
        instructions: HEALTH_FEELING_ASSISTANT_INSTRUCTIONS, preload: ['health_feeling.set'] },
    // The health profile read by the assistant or MCP: the user agrees at each question that needs it (decision Q28).
    { id: 'health_profile', commands: HEALTH_PROFILE_COMMANDS, validate: validateHealthProfileInput, noClient: 'AUTH_REQUIRED',
        confirmed: HEALTH_PROFILE_CONFIRMED_COMMANDS, instructions: HEALTH_PROFILE_ASSISTANT_INSTRUCTIONS },
    // Health protocols and declared products: closed to the assistant and MCP (the executor answers only the person in
    // the app, health_protocol_commands.js); activating a plan, sharing and accepting a template are confirmed.
    { id: 'health_protocol', commands: HEALTH_PROTOCOL_COMMANDS, validate: validateHealthProtocolInput, noClient: 'AUTH_REQUIRED',
        confirmed: HEALTH_PROTOCOL_CONFIRMED_COMMANDS, instructions: HEALTH_PROTOCOL_ASSISTANT_INSTRUCTIONS },
    { id: 'health_products', commands: HEALTH_PRODUCTS_COMMANDS, validate: validateHealthProductsInput, noClient: 'AUTH_REQUIRED',
        confirmed: HEALTH_PRODUCTS_CONFIRMED_COMMANDS },
    // Food advice from the person's health (R-115 D28/D29): closed to the assistant and MCP but for the public rule base
    // (`food_advice.rules`), which lets the assistant explain a rule when the person asks; doctor's tips are written, not confirmed.
    { id: 'food_advice', commands: FOOD_ADVICE_COMMANDS, validate: validateFoodAdviceInput, noClient: 'AUTH_REQUIRED',
        instructions: FOOD_ADVICE_ASSISTANT_INSTRUCTIONS },
    // The Health record (R-104 D10): closed to the assistant and MCP but for showing its screens; removing an entry and saving a
    // file out are confirmed.
    { id: 'health_record', commands: HEALTH_RECORD_COMMANDS, validate: validateHealthRecordInput, noClient: 'AUTH_REQUIRED',
        confirmed: HEALTH_RECORD_CONFIRMED_COMMANDS, instructions: HEALTH_RECORD_ASSISTANT_INSTRUCTIONS },
    // An ordonnance dictated, signed, printed, saved and sent (R-115 D26): closed to the assistant and MCP but for showing it.
    { id: 'ordonnance', commands: ORDONNANCE_COMMANDS, validate: validateOrdonnanceInput, noClient: 'AUTH_REQUIRED',
        confirmed: ORDONNANCE_CONFIRMED_COMMANDS, instructions: ORDONNANCE_ASSISTANT_INSTRUCTIONS },
    // The prescription aid (R-115 D27): symptoms, pre-diagnosis, checked pre-ordonnance; closed but for showing it and the symptoms told.
    { id: 'prescription_aid', commands: PRESCRIPTION_AID_COMMANDS, validate: validatePrescriptionAidInput, noClient: 'AUTH_REQUIRED',
        confirmed: PRESCRIPTION_AID_CONFIRMED_COMMANDS, instructions: PRESCRIPTION_AID_ASSISTANT_INSTRUCTIONS },
    // An objective composed brick by brick, its programme previewed, planned and launched (R-104 D7): health data, closed
    // to the assistant and MCP but for the library, the sheets, the scenarios and the screens; writing the calendar is confirmed.
    { id: 'objective_program', commands: OBJECTIVE_PROGRAM_COMMANDS, validate: validateObjectiveProgramInput, noClient: 'AUTH_REQUIRED',
        confirmed: OBJECTIVE_PROGRAM_CONFIRMED_COMMANDS, instructions: OBJECTIVE_PROGRAM_ASSISTANT_INSTRUCTIONS },
    // A Thalasso stay and its cares (decision Q26); ending a stay is the user's to confirm.
    { id: 'thalasso', commands: THALASSO_COMMANDS, validate: validateThalassoInput, noClient: 'AUTH_REQUIRED',
        confirmed: THALASSO_CONFIRMED_COMMANDS, instructions: THALASSO_ASSISTANT_INSTRUCTIONS,
        preload: ['thalasso.stay_read', 'thalasso.stay_set', 'thalasso.care_add', 'thalasso.care_done'] },
    { id: 'sensors', commands: SENSORS_COMMANDS, validate: validateSensorsInput, noClient: 'health_host_unsupported',
        confirmed: ['sensors.delete'], instructions: SENSORS_ASSISTANT_INSTRUCTIONS, preload: ['sensors.status', 'sensors.list'] },
    // Erasing the body weight and age from the card is the user's to allow.
    { id: 'body_data', commands: BODY_DATA_COMMANDS, validate: validateBodyDataInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['body_data.delete'], instructions: BODY_DATA_ASSISTANT_INSTRUCTIONS, preload: ['body_data.consent', 'body_data.set_consent'] },
    { id: 'shopping', commands: SHOPPING_COMMANDS, validate: validateShoppingInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['shopping.clear_checked'], instructions: SHOPPING_ASSISTANT_INSTRUCTIONS,
        preload: ['shopping.add', 'shopping.check', 'shopping.list', 'shopping.open'] },
    // Deleting a media list is the user's to confirm (its media stay).
    { id: 'media_lists', commands: MEDIA_LIST_COMMANDS, validate: validateMediaListInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['media_lists.delete'], instructions: MEDIA_LIST_ASSISTANT_INSTRUCTIONS,
        preload: ['media_lists.list', 'media_lists.create', 'media_lists.add', 'media_lists.open'] },
    { id: 'share', commands: SHARE_COMMANDS, validate: validateShareInput, noClient: 'AUTH_REQUIRED',
        confirmed: SHARE_CONFIRMED_COMMANDS, instructions: SHARE_ASSISTANT_INSTRUCTIONS, preload: ['share.send', 'share.pending', 'share.accept'] },
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
        confirmed: ['creation.send', 'creation.delete'], instructions: CREATION_ASSISTANT_INSTRUCTIONS,
        preload: ['creation.list', 'creation.read', 'creation.new_text', 'creation.open'] },
    // The spreadsheet in a text: cells, formulas, grid — the assistant limited to the text named.
    { id: 'calc', commands: CALC_COMMANDS, validate: validateCalcInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: CALC_ASSISTANT_INSTRUCTIONS, preload: ['calc.cells', 'calc.cell', 'calc.formula', 'calc.view'] },
    { id: 'document', commands: DOCUMENT_COMMANDS, validate: validateDocumentInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: DOCUMENT_ASSISTANT_INSTRUCTIONS, preload: ['document.templates', 'document.template', 'document.role'] },
    { id: 'script', commands: SCRIPT_COMMANDS, validate: validateScriptInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: SCRIPT_CONFIRMED_COMMANDS, instructions: SCRIPT_ASSISTANT_INSTRUCTIONS, preload: ['script.list'] },
    // The camera, turned on and taken from by a command, is the user's to allow.
    { id: 'media_import', commands: MEDIA_IMPORT_COMMANDS, validate: validateMediaImportInput, noClient: 'NOT_OPEN',
        confirmed: ['media_import.camera', 'media_import.take', 'media_import.delete'], instructions: MEDIA_IMPORT_ASSISTANT_INSTRUCTIONS,
        preload: ['media_import.state', 'media_import.list', 'media_import.choose'] },
    // A capture turns the camera or the microphone on, a delete takes items out of the project: the user's to allow.
    { id: 'captures', commands: CAPTURE_COMMANDS, validate: validateCaptureInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['captures.start', 'captures.delete'], instructions: CAPTURE_ASSISTANT_INSTRUCTIONS,
        preload: ['captures.state', 'captures.show', 'captures.play', 'captures.stop', 'captures.camera'] },
    // Lighting an effect turns the microphone on, a delete takes an effect or an instrument away for good: the user's to allow.
    { id: 'audio_fx', commands: AUDIO_FX_COMMANDS, validate: validateAudioFxInput, noClient: 'HOST_UNSUPPORTED',
        confirmed: ['audio_fx.start', 'audio_fx.delete', 'audio_fx.instrument_delete', 'audio_fx.delete_preset'], instructions: AUDIO_FX_ASSISTANT_INSTRUCTIONS,
        preload: ['audio_fx.catalog', 'audio_fx.start', 'audio_fx.stop', 'audio_fx.set_param'] },
    // Deleting a profile changes what every list shows: the user's to allow.
    { id: 'profiles', commands: LIFE_PROFILE_COMMANDS, validate: validateLifeProfileInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['profiles.delete'], instructions: LIFE_PROFILE_ASSISTANT_INSTRUCTIONS,
        preload: ['profiles.list', 'profiles.activate', 'profiles.create', 'profiles.assign'] },
    { id: 'food', commands: FOOD_COMMANDS, validate: validateFoodInput, noClient: 'HOST_UNSUPPORTED',
        instructions: FOOD_ASSISTANT_INSTRUCTIONS, preload: ['food.search', 'food.alternatives', 'food.scan', 'food.add'] },
    { id: 'books', commands: BOOKS_COMMANDS, validate: validateBooksInput, noClient: 'PRESENTATION_UNAVAILABLE', confirmed: BOOKS_CONFIRMED_COMMANDS,
        instructions: BOOKS_ASSISTANT_INSTRUCTIONS, preload: ['books.list', 'books.open', 'books.page', 'books.transport'] },
    { id: 'projects', commands: PROJECTS_COMMANDS, validate: validateProjectsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: ['projects.delete'], instructions: PROJECTS_ASSISTANT_INSTRUCTIONS, preload: ['projects.list', 'projects.search', 'projects.open', 'projects.create', 'projects.favorite'] },
    { id: 'code_project', commands: CODE_PROJECT_COMMANDS, validate: validateCodeProjectInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: CODE_PROJECT_ASSISTANT_INSTRUCTIONS, preload: ['code_project.create', 'code_project.open'] },
    { id: 'dashboard_progression', commands: DASHBOARD_PROGRESSION_COMMANDS, validate: validateDashboardProgressionInput,
        noClient: 'progression_actor_required', confirmed: ['dashboard.objective.delete'], instructions: DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS },
    // Putting a site online, buying a domain or a mail box is the user's to confirm.
    { id: 'site', commands: SITE_COMMANDS, validate: validateSiteInput, noClient: 'PRESENTATION_UNAVAILABLE',
        confirmed: SITE_CONFIRMED_COMMANDS, instructions: SITE_ASSISTANT_INSTRUCTIONS,
        preload: ['site.state', 'site.publish', 'site.pages', 'site.list', 'site.menu', 'site.form', 'site.goto'] },
    { id: 'qr', commands: QR_COMMANDS, validate: validateQrInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: QR_ASSISTANT_INSTRUCTIONS, preload: ['qr.open', 'qr.keep', 'qr.make'] },
    { id: 'interactions', commands: INTERACTIONS_COMMANDS, validate: validateInteractionsInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: INTERACTIONS_ASSISTANT_INSTRUCTIONS, preload: ['interactions.list', 'interactions.create'] },
    // Sending a session to people and withdrawing a contribution are the user's to confirm.
    { id: 'video_train', commands: VIDEO_TRAIN_COMMANDS, validate: validateVideoTrainInput, noClient: 'AUTH_REQUIRED',
        confirmed: VIDEO_TRAIN_CONFIRMED_COMMANDS, instructions: VIDEO_TRAIN_ASSISTANT_INSTRUCTIONS,
        preload: ['video_train.share', 'video_train.thread', 'video_train.open_thread', 'video_train.reply', 'video_train.vote'] },
    // « Envoyer mes résultats »: the choice of what leaves; Publier sends it (publish.*, confirmed there).
    { id: 'results_send', commands: RESULTS_SEND_COMMANDS, validate: validateResultsSendInput, noClient: 'PRESENTATION_UNAVAILABLE',
        instructions: RESULTS_SEND_ASSISTANT_INSTRUCTIONS, preload: ['results_send.open', 'results_send.read', 'results_send.pick', 'results_send.next'] },
    // Strava (Préférences › Santé): connecting and disconnecting the person's account are the user's to confirm.
    { id: 'strava', commands: STRAVA_COMMANDS, validate: validateStravaInput, noClient: 'AUTH_REQUIRED',
        confirmed: ['strava.connect', 'strava.disconnect', 'strava.remove_imports', 'strava.remove_import'], instructions: STRAVA_ASSISTANT_INSTRUCTIONS, preload: ['strava.get_state', 'strava.import'] },
    // This device's health store as a source of sport sessions (Préférences › Santé): connecting and disconnecting are the user's to confirm.
    { id: 'health_sync', commands: HEALTH_SYNC_COMMANDS, validate: validateHealthSyncInput, noClient: 'health_host_unsupported',
        confirmed: HEALTH_SYNC_CONFIRMED_COMMANDS, instructions: HEALTH_SYNC_ASSISTANT_INSTRUCTIONS, preload: ['health_sync.get_state', 'health_sync.sync'] },
    // Publier: a send, an update, a send now and a cancel are the user's to confirm.
    { id: 'publish', commands: PUBLISH_COMMANDS, validate: validatePublishInput, noClient: 'AUTH_REQUIRED',
        confirmed: PUBLISH_CONFIRMED_COMMANDS, instructions: PUBLISH_ASSISTANT_INSTRUCTIONS,
        preload: ['publish.recipients', 'publish.send', 'publish.list', 'publish.edit', 'publish.cancel'] },
    // Forums: making one, inviting, answering an invitation, leaving and writing are the user's to confirm.
    { id: 'forum', commands: FORUM_COMMANDS, validate: validateForumInput, noClient: 'AUTH_REQUIRED',
        confirmed: FORUM_CONFIRMED_COMMANDS, instructions: FORUM_ASSISTANT_INSTRUCTIONS,
        preload: ['forum.list', 'forum.create', 'forum.post', 'forum.members', 'forum.open'] },
    // Programs and held requests (R-104 D8): a grant, a withdrawal and a yes are the person's alone, in the app.
    { id: 'mcp_access', commands: MCP_ACCESS_COMMANDS, validate: validateMcpAccessInput, noClient: 'NOT_LOCAL',
        confirmed: MCP_ACCESS_CONFIRMED_COMMANDS, instructions: MCP_ACCESS_ASSISTANT_INSTRUCTIONS, preload: ['mcp_access.programs', 'mcp_access.confirmations'] },
    // The objectives network (R-104 D8): being findable, a report, a block, the end of a link and leaving are the user's to confirm.
    { id: 'objective_network', commands: OBJECTIVE_NETWORK_COMMANDS, validate: validateObjectiveNetworkInput, noClient: 'AUTH_REQUIRED',
        confirmed: OBJECTIVE_NETWORK_CONFIRMED_COMMANDS, instructions: OBJECTIVE_NETWORK_ASSISTANT_INSTRUCTIONS,
        preload: ['objective_network.people_open', 'objective_network.visibility_set', 'objective_network.network_set'] }
].map(family => Object.freeze({ confirmed: [], preload: [], instructions: '', ...family, layer: `atome_mcp_${family.id}` })));

export const MCP_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.commands));
export const MCP_CONFIRMED_CONTRACT_COMMANDS = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.confirmed));
export const MCP_CONTRACT_CAPABILITIES = Object.freeze([...new Set(MCP_CONTRACT_COMMANDS.map(command => command.capability))]);
export const MCP_CONTRACT_PRELOAD = Object.freeze(MCP_CONTRACT_FAMILIES.flatMap(family => family.preload));
export const MCP_CONTRACT_ASSISTANT_INSTRUCTIONS = MCP_CONTRACT_FAMILIES.map(family => family.instructions).filter(Boolean).join(' ');
export const findContractCommand = name => MCP_CONTRACT_COMMANDS.find(command => command.name === name) || null;
