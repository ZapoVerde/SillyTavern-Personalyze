/**
 * @file data/default-user/extensions/personalyze/utils/dom.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role Utility / DOM Helper
 * @description
 * Provides layout and sizing utilities for the Personalyze UI. 
 * Includes the smartResize logic used to manage auto-expanding textareas.
 * Modified to allow unlimited expansion so that the parent modal container
 * handles scrolling rather than the textarea itself.
 *
 * @api-declaration
 * smartResize(el) -> void
 *
 * @contract
 *   assertions:
 *     purity: Side-effect (DOM Mutation)
 *     state_ownership: []
 *     external_io: [Element.style, Element.scrollHeight]
 */

/**
 * Automatically adjusts the height of a textarea to match its content.
 * Removes internal scrollbars to force parent containers to expand.
 * 
 * @param {HTMLTextAreaElement|HTMLElement} el 
 */
export function smartResize(el) {
    if (!el) return;
    
    // 1. Prevent internal scrollbars so the parent container is forced to grow
    el.style.overflow = 'hidden';

    // 2. Force a "shrink" to find the true minimum height of the content
    el.style.height = '0px'; 
    
    // 3. Set height to content height (plus a tiny buffer for borders/rounding)
    const newHeight = el.scrollHeight + 4;
    el.style.height = newHeight + 'px';

    // 4. Cleanup: If the element is an input or has a fixed max-height elsewhere,
    // ensure the transition is smooth.
    el.style.resize = 'none';
}