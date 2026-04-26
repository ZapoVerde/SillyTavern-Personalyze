/**
 * @file data/default-user/extensions/personalyze/ui/engines/handlers/keyStatus.js
 * @stamp {"utc":"2026-04-26T00:00:00.000Z"}
 * @architectural-role IO Executor (Engine Key Status)
 * @description
 * Fetches and renders API key presence indicators for all image engines
 * in the Engines configuration modal.
 *
 * Uses a hybrid approach: SillyTavern's frontend secret_state for standard
 * Pollinations keys, and the server-side /keys-status proxy for custom
 * extension keys (Fal, PiAPI, Runware) which are excluded from the frontend
 * secret state.
 *
 * @api-declaration
 * updateEngineKeyStatuses() → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM, /api/plugins/personalyze/keys-status, secret_state, getRequestHeaders]
 */

import { SECRET_RUNWARE } from '../../../defaults.js';
import { error } from '../../../utils/logger.js';
import { secret_state } from '../../../../../../secrets.js';
import { getRequestHeaders } from '../../../../../../../script.js';

const _OK_HTML  = '<span style="color:var(--SmartThemeQuoteColor,#28a745); font-size:0.9em;">● Key saved in vault</span>';
const _ERR_HTML = '<span style="color:var(--SmartThemeErrorColor,#e05555); font-size:0.9em;">○ No key found</span>';

/**
 * Updates all engine key status indicators in the engines modal.
 */
export async function updateEngineKeyStatuses() {
    // 1. Pollinations: standard ST key lives in frontend secret_state
    const polState = secret_state['api_key_pollinations'];
    const hasPol = Array.isArray(polState) && polState.length > 0;

    // 2. Custom extension keys: not exposed to frontend secret_state — query server proxy
    const customKeys = ['api_key_fal', 'api_key_piapi', SECRET_RUNWARE];
    let customStatus = { 'api_key_fal': false, 'api_key_piapi': false, [SECRET_RUNWARE]: false };

    try {
        const response = await fetch('/api/plugins/personalyze/keys-status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ keys: customKeys })
        });
        if (response.ok) customStatus = await response.json();
    } catch (err) {
        error('EnginesModal', 'Failed to fetch key statuses from server proxy:', err);
    }

    $('#plz-eng-pol-key-status').html(hasPol ? _OK_HTML : _ERR_HTML);
    $('#plz-eng-fal-key-status').html(customStatus['api_key_fal'] ? _OK_HTML : _ERR_HTML);
    $('#plz-eng-piapi-key-status').html(customStatus['api_key_piapi'] ? _OK_HTML : _ERR_HTML);
    $('#plz-eng-runware-key-status').html(customStatus[SECRET_RUNWARE] ? _OK_HTML : _ERR_HTML);
}
