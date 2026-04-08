/**
 * @file data/default-user/extensions/personalyze/ui/badge.js
 * @stamp {"utc":"2026-04-07T15:10:00.000Z"}
 * @architectural-role UI (Per-Message Badge)
 * @description
 * Injects a state indicator badge into the .mes_buttons bar of AI messages.
 * 
 * Updated to use the DNA Chain architecture: resolves labels using 
 * state.chatCharacters (Local DNA) and handles the Array Pattern 
 * in message metadata.
 *
 * @api-declaration
 * injectMessageBadge(messageId)  — Resolves DNA for messageId and stamps badge.
 * reinjectAllBadges()            — Refreshes all badges in the chat.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [DOM (.mes_buttons), state.js, getContext()]
 */

import { getContext } from '../../../../extensions.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';

const BADGE_CLASS = 'plz-msg-badge';

/**
 * Builds and attaches the badge into .mes_buttons for a message element.
 * 
 * @param {jQuery} $mes
 * @param {object} visualState { characterId, outfit, expression }
 */
function renderBadge($mes, visualState) {
    $mes.find(`.${BADGE_CLASS}`).remove();

    const charId       = visualState.characterId;
    const character    = state.chatCharacters[charId];
    
    // Resolve labels from local DNA definitions
    const outfitLabel  = character?.outfits[visualState.outfit]?.label     ?? visualState.outfit     ?? '—';
    const exprLabel    = character?.expressions[visualState.expression]?.label ?? visualState.expression ?? '—';
    const charLabel    = charId.replace(/_/g, ' ');

    const $badge = $(`
        <div class="${BADGE_CLASS}"
             style="
                 display: inline-flex;
                 align-items: center;
                 gap: 4px;
                 font-size: 0.75em;
                 opacity: 0.65;
                 user-select: none;
                 margin-right: 4px;
             ">
            <span style="
                      display: inline-flex;
                      align-items: center;
                      gap: 3px;
                      padding: 2px 7px;
                      border-radius: 10px;
                      border: 1px solid var(--SmartThemeBorderColor);
                      white-space: nowrap;
                  ">
                <i class="fa-solid fa-user" style="font-size:0.85em;"></i>
                <span>${escapeHtml(charLabel)}</span>
                <span style="opacity:0.4;">|</span>
                <span>${escapeHtml(outfitLabel)}</span>
                <span style="opacity:0.4;">|</span>
                <span>${escapeHtml(exprLabel)}</span>
            </span>
        </div>
    `);

    const $buttons = $mes.find('.mes_buttons');
    if ($buttons.length) $buttons.prepend($badge);
}

/**
 * Injects or refreshes the Personalyze badge for a single AI chat message.
 * @param {number} messageId
 */
export function injectMessageBadge(messageId) {
    const context = getContext();
    const message = context?.chat[messageId];
    if (!message || message.is_user) return;

    const plzData = message.extra?.personalyze;
    if (!plzData) return;

    // Resolve the latest visual state record from the DNA array (or handle legacy object)
    let latestState = null;
    if (Array.isArray(plzData)) {
        for (let i = plzData.length - 1; i >= 0; i--) {
            if (plzData[i].type === 'visual_state') {
                latestState = plzData[i];
                break;
            }
        }
    } else if (plzData.characterId) {
        latestState = plzData;
    }

    if (!latestState) return;

    const $mes = $(`.mes[mesid="${messageId}"]`);
    if (!$mes.length) return;

    renderBadge($mes, latestState);
}

/**
 * Re-renders all badges for the current chat.
 */
export function reinjectAllBadges() {
    const context = getContext();
    if (!context?.chat) return;

    context.chat.forEach((_msg, idx) => {
        injectMessageBadge(idx);
    });
}