/**
 * @file data/default-user/extensions/personalyze/ui/workshop/logic/help.js
 * @stamp {"utc":"2026-05-01T19:30:00.000Z"}
 * @architectural-role UI Executor
 * @description
 * Provides the documentation and syntax guide modal for the Computational Logic DSL.
 * 
 * @api-declaration
 * showLogicHelp() -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: []
 *     external_io: [openModal]
 */

import { openModal } from '../../utils/modal.js';

/**
 * Displays a formatted modal explaining the rules and syntax for Computational Logic Probes.
 */
export function showLogicHelp() {
    const content = `
    <div style="font-size:0.9em; line-height:1.5; display:flex; flex-direction:column; gap:12px;">
        <p style="margin:0;">Computational probes evaluate instantly (zero cost) by directly checking the character's current state and traits.</p>
        
        <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
            <strong style="color:var(--SmartThemeQuoteColor);">Atomic Operators</strong>
            <ul style="margin:5px 0 0 20px; padding:0;">
                <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">is</code> : Strict whole-word match.</li>
                <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">in</code> : List membership. Items should be comma-separated. Parentheses are required.</li>
                <li style="margin-bottom:4px;"><code style="color:var(--SmartThemeEmColor);">contains</code> : Loose partial string match.</li>
                <li><code style="color:var(--SmartThemeEmColor);">empty</code> : True if the value is missing, "none", or "unspecified".</li>
            </ul>
        </div>

        <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
            <strong style="color:var(--SmartThemeQuoteColor);">Boolean Logic</strong>
            <p style="margin:5px 0 0 0;">You can chain conditions using <code style="color:var(--SmartThemeEmColor);">AND</code>, <code style="color:var(--SmartThemeEmColor);">OR</code>, and <code style="color:var(--SmartThemeEmColor);">!</code> (NOT). Use parentheses <code style="color:var(--SmartThemeEmColor);">()</code> to control the order of operations.</p>
        </div>

        <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid var(--SmartThemeBorderColor);">
            <strong style="color:var(--SmartThemeQuoteColor);">Examples</strong>
            <ul style="margin:5px 0 0 0; padding:0; list-style-type:none;">
                <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{top}} is t-shirt</code></li>
                <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{gender}} in (female, girl)</code></li>
                <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{eyes}} contains blue</code></li>
                <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">{{outerwear}} empty</code></li>
                <li style="margin-bottom:6px;"><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">! {{top}} empty</code></li>
                <li><code style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; line-height:1.4;">(! {{is_wet}} empty AND {{top}} empty) OR ({{pose}} contains sitting)</code></li>
            </ul>
        </div>
    </div>`;

    openModal({
        title: 'Computational Logic Syntax',
        content,
        width: 'min(600px, 95vw)',
        buttons: [{ label: 'Close', value: null, style: 'muted' }]
    });
}