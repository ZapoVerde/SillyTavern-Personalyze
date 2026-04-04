/**
 * @file data/default-user/extensions/personalyze/ui/badge.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role UI (Per-Message Badge)
 * @description
 * Injects a small state indicator badge into the .mes_buttons bar of each AI
 * chat message that has a PersonaLyze pointer record.
 *
 * The badge displays the active character name, outfit label, and expression
 * label at the time that message was generated, giving the user a visual audit
 * trail of the portrait state across the conversation.
 *
 * Format:  [CharacterName  |  OutfitLabel  |  ExpressionLabel]
 *
 * Badges are injected lazily after the message DOM element is rendered and
 * re-injected on chat reload via reinjectAllBadges().
 *
 * @api-declaration
 * injectMessageBadge(messageId)  — Reads the pointer for messageId and stamps the badge.
 * reinjectAllBadges()            — Iterates the full chat and re-stamps all badges.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [DOM (.mes_buttons), registry.js, getContext()]
 */

import { getContext } from '../../../../extensions.js';
import { getCharacter } from '../registry.js';
import { escapeHtml } from '../utils/history.js';

const BADGE_CLASS = 'plz-msg-badge';

/**
 * Builds and attaches the badge into .mes_buttons for a message element.
 * Removes any existing badge first — safe for repeated calls.
 * @param {jQuery} $mes
 * @param {object} pointer  { characterId, outfit, expression }
 */
function renderBadge($mes, pointer) {
    $mes.find(`.${BADGE_CLASS}`).remove();

    const character    = getCharacter(pointer.characterId);
    const outfitLabel  = character?.outfits[pointer.outfit]?.label     ?? pointer.outfit     ?? '—';
    const exprLabel    = character?.expressions[pointer.expression]?.label ?? pointer.expression ?? '—';
    const charLabel    = pointer.characterId.replace(/_/g, ' ');

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
 * Injects or refreshes the PLZ badge for a single AI chat message.
 * No-ops silently if the message has no PLZ pointer or the DOM element is absent.
 * @param {number} messageId
 */
export function injectMessageBadge(messageId) {
    const context = getContext();
    const message = context?.chat[messageId];
    if (!message || message.is_user) return;

    const pointer = message.extra?.personalyze;
    if (!pointer?.characterId) return;

    const $mes = $(`.mes[mesid="${messageId}"]`);
    if (!$mes.length) return;

    renderBadge($mes, pointer);
}

/**
 * Re-renders PLZ badges for every message currently in the chat.
 * Called after boot and after a chat-changed event.
 */
export function reinjectAllBadges() {
    const context = getContext();
    if (!context?.chat) return;

    context.chat.forEach((_msg, idx) => {
        injectMessageBadge(idx);
    });
}
