// The core atome types (the registry's `atome_type` owner, architecture §3): every type the servers accept, in one
// ordered list, registered at boot. The types' shape is core_atome_type_shape.js; the scene and data-model types are
// declared in their own modules; the domains' types (contracts) are imported and defined here in their place.
import { PERSONAL_IMPORT_TYPES } from './personal_import_types.js';
import { APP_ATOME_TYPES } from './app_atome_types.js';
import { HEALTH_PROTOCOL_ATOME_TYPES } from './health_protocol_contract.js';
import { TRAINING_ATOME_TYPES } from './training_atome_types.js';
import { ACCESS_SOCIAL_ATOME_TYPES } from './access_social_atome_types.js';
import { GPS_TRIP_TYPE, LIVE_POSITION_TYPE } from './gps_trip_contract.js';
import { SHOPPING_ITEM_TYPE, SHOPPING_LIST_TYPE } from './shopping_list_contract.js';
import { CONTACT_INVITATION_TYPE } from './contact_invitation_contract.js';
import { LIBRARY_WORK_TYPE } from './library_work_contract.js';
import { MEDIA_LIST_TYPE } from './media_list_contract.js';
import { ITEM_LIST_TYPE, LIST_RECEIPT_TYPE } from './list_share_contract.js';
import { SHARE_KEY_TYPE } from './share_key_contract.js';
import { COMMUNICATION_MESSAGE_TYPE } from './communication_contract.js';
import { APPLE_MUSIC_OPERATION_TYPE } from './apple_music_operation_contract.js';
import { MUSIC_OPERATION_TYPE } from './music_operation_contract.js';
import { LIFE_PROFILE_FILING_TYPE, LIFE_PROFILE_TYPE } from './life_profile_contract.js';
import { AUDIO_EFFECT_TYPE, AUDIO_RACK_TYPE } from './audio_fx_contract.js';
import { INSTRUMENT_TYPE } from './instrument_contract.js';
import { AUDIO_SLICE_TYPE, SAMPLE_EDIT_TYPE } from './sample_edit_contract.js';
import { HTML_PAGE_TYPE } from './html_page_contract.js';
import { registerAtomeType } from './atome_universal_contract.js';
import { CORE_ATOME_TYPE_VERSION, ATOME_MIX_PROPERTY_SCHEMA, defineType } from './core_atome_type_shape.js';
import { ATOME_OBJECTIVE_IDS, CORE_SCENE_ATOME_TYPES } from './core_atome_scene_types.js';
import { ATOME_MATRIX_NAVIGATION_SCHEMA, CORE_DATA_ATOME_TYPES } from './core_atome_data_types.js';

export { CORE_ATOME_TYPE_VERSION, ATOME_MIX_PROPERTY_SCHEMA, ATOME_OBJECTIVE_IDS, ATOME_MATRIX_NAVIGATION_SCHEMA };

export const CORE_ATOME_TYPE_DEFINITIONS = Object.freeze([
    defineType(APPLE_MUSIC_OPERATION_TYPE),
    defineType(MUSIC_OPERATION_TYPE),
    defineType(GPS_TRIP_TYPE), defineType(LIVE_POSITION_TYPE), defineType(SHOPPING_ITEM_TYPE), defineType(SHOPPING_LIST_TYPE), defineType(CONTACT_INVITATION_TYPE), defineType(LIBRARY_WORK_TYPE), defineType(MEDIA_LIST_TYPE), defineType(ITEM_LIST_TYPE), defineType(LIST_RECEIPT_TYPE), defineType(SHARE_KEY_TYPE),
    defineType(COMMUNICATION_MESSAGE_TYPE), defineType(LIFE_PROFILE_TYPE), defineType(LIFE_PROFILE_FILING_TYPE), defineType(AUDIO_RACK_TYPE), defineType(AUDIO_EFFECT_TYPE), defineType(INSTRUMENT_TYPE),
    defineType(SAMPLE_EDIT_TYPE), defineType(AUDIO_SLICE_TYPE), ...PERSONAL_IMPORT_TYPES.map(defineType), ...APP_ATOME_TYPES.map(defineType),
    ...CORE_SCENE_ATOME_TYPES,
    defineType(HTML_PAGE_TYPE),
    ...CORE_DATA_ATOME_TYPES,
    ...HEALTH_PROTOCOL_ATOME_TYPES.map(defineType),
    ...TRAINING_ATOME_TYPES.map(defineType),
    ...ACCESS_SOCIAL_ATOME_TYPES.map(defineType)
]);

export const CORE_ATOME_TYPE_IDS = Object.freeze(
    CORE_ATOME_TYPE_DEFINITIONS.map((definition) => definition.type)
);

export function listCoreAtomeTypeDefinitions() {
    return CORE_ATOME_TYPE_DEFINITIONS.map((definition) => ({
        ...definition,
        schema: { ...definition.schema },
        traits: definition.traits.slice(),
        default_capabilities: definition.default_capabilities.map((entry) => ({ ...entry })),
        default_policy: { ...definition.default_policy }
    }));
}

export function registerCoreAtomeTypes() {
    return CORE_ATOME_TYPE_DEFINITIONS.map((definition) => registerAtomeType(definition));
}
