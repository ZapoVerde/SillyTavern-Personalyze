/**
 * @file data/default-user/extensions/personalyze/ui/badge.js
 * @stamp {"utc":"2026-04-10T15:20:00.000Z"}
 * @architectural-role UI (Per-Message Badge)
 * @description
 * Injects a state indicator badge into the .mes_buttons bar of AI messages.
 * Resolves the 5-slot layered state (Emotion + Top Layer) from chat DNA.
 * 
 * @api-declaration
 * injectMessageBadge(messageId)  — Resolves DNA for messageId and stamps badge.
 * reinjectAllBadges()            — Refreshes all badges in the chat.
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [DOM (.mes_buttons), state.js, getContext()]
 */

const BADGE_CLASS = 'plz-msg-badge';

/**
 * Builds and attaches the badge into .mes_buttons for a message element.
 * 
 * @param {jQuery} $mes
 * @param {object} visualState { characterId, layers: { outerwear, top, ... emotion } }
 */
function renderBadge($mes, visualState) {
    $mes.find(`.${BADGE_CLASS}`).remove();

    const charId    = visualState.characterId;
    const character = state.chatCharacters[charId];
    const layers    = visualState.layers || {};
    
    // Logic: Identify a representative clothing item to show in the small badge
    const outerwear = layers.outerwear?.item;
    const top       = layers.top?.item;
    const clothes   = outerwear || top || '—';
    const emotion   = layers.emotion || 'neutral';

    const charLabel = charId.replace(/_/g, ' ');

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
                <span title="Emotion">${escapeHtml(emotion)}</span>
                <span style="opacity:0.4;">|</span>
                <span title="Top Layer">${escapeHtml(clothes)}</span>
            </span>
        </div>
    `);

    const $buttons = $mes.find('.mes_buttons');
    if ($buttons.length) $buttons.prepend($badge);
}

/**
 * Removes all badges from the current chat view.
 */
export function clearAllBadges() {
    $(`.${BADGE_CLASS}`).remove();
}

/**
 * Injects or refreshes the Personalyze badge for a single AI chat message.
 * @param {number} messageId
 */
export function injectMessageBadge(_messageId) {
    return;
}

/**
 * Re-renders all badges for the current chat.
 */
export function reinjectAllBadges() {
    return;
}