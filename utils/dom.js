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

    // 2. Reset to 'auto' so the browser re-measures natural content height.
    //    Using '0px' causes some engines to return the previous pixel value from
    //    scrollHeight on the next read, producing runaway growth on each keystroke.
    el.style.height = 'auto';

    // 3. Set height exactly to content height.
    el.style.height = el.scrollHeight + 'px';

    el.style.resize = 'none';
}