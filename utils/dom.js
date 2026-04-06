/**
 * @file data/default-user/extensions/personalyze/utils/dom.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role Utility / DOM Helper
 * @description
 * Provides layout and sizing utilities for the Personalyze UI. 
 * Includes the smartResize logic used to manage auto-expanding textareas 
 * while maintaining a safety viewport cap.
 *
 * @api-declaration
 * smartResize(el) -> void
 *
 * @contract
 *   assertions:
 *     purity: Side-effect (DOM Mutation)
 *     state_ownership: []
 *     external_io: [Element.style, window.innerHeight]
 */

export function smartResize(el) {
    if (!el) return;
    
    // 1. Force a "shrink" to find the true minimum height of the content
    el.style.height = '0px'; 
    
    // 2. Set height to content height (plus a tiny buffer for borders)
    const newHeight = el.scrollHeight + 2;
    el.style.height = newHeight + 'px';

    // 3. Handle the "Safety Cap" (50% of the screen height)
    const maxHeight = window.innerHeight * 0.5;
    if (newHeight >= maxHeight) {
        el.classList.add('plz-needs-scroll');
    } else {
        el.classList.remove('plz-needs-scroll');
    }
}