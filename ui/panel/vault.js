/**
 * @file data/default-user/extensions/personalyze/ui/panel/vault.js
 * @stamp {"utc":"2026-04-05T00:00:00.000Z"}
 * @architectural-role UI Logic (Secrets)
 * @description
 * Manages the Pollinations API key vault and connection testing.
 * Updates the 'key status' indicator in the settings panel.
 *
 * @api-declaration
 * updateKeyStatusIndicator()   — Refreshes the vault status icon/text.
 * bindVaultHandlers($panel)    — Binds save and test buttons.
 */

import { callPopup } from '../../../../../script.js';
import { writeSecret, secret_state } from '../../../../secrets.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { error } from '../../utils/logger.js';

const SECRET_KEY_NAME = 'api_key_pollinations';

/**
 * Updates the UI indicator (#plz-key-status) based on whether the key exists in the vault.
 */
export function updateKeyStatusIndicator() {
    const $indicator = $('#plz-key-status');
    if (!$indicator.length) return;

    const vaultState = secret_state[SECRET_KEY_NAME];
    
    // vaultState is an array of strings when populated in ST
    if (Array.isArray(vaultState) && vaultState.length > 0) {
        $indicator.html('<span style="color:var(--SmartThemeQuoteColor,#28a745);"><i class="fa-solid fa-circle-check"></i> Configured</span>');
    } else {
        $indicator.html('<span style="color:var(--SmartThemeWarningColor,#ffc107);"><i class="fa-solid fa-triangle-exclamation"></i> Not configured</span>');
    }
}

/**
 * Binds the vault management actions.
 * @param {jQuery} $panel 
 */
export function bindVaultHandlers($panel) {
    // 1. Save to Vault
    $panel.on('click', '#plz-pollinations-save', async function () {
        const key = $('#plz-pollinations-key').val().trim();
        if (!key) {
            if (window.toastr) window.toastr.warning('Paste your Pollinations API key first.', 'PersonaLyze');
            return;
        }

        try {
            await writeSecret(SECRET_KEY_NAME, key, 'PersonaLyze: Pollinations');
            $('#plz-pollinations-key').val('');
            updateKeyStatusIndicator();
            if (window.toastr) window.toastr.success('API key saved to vault.', 'PersonaLyze');
        } catch (err) {
            error('Vault', 'Failed to write secret:', err);
            if (window.toastr) window.toastr.error('Failed to save key to vault.');
        }
    });

    // 2. Test Connection
    $panel.on('click', '#plz-pollinations-test', async function () {
        const $btn    = $(this);
        const $status = $panel.find('#plz-pollinations-status');
        
        $btn.prop('disabled', true).text('Generating…');
        $status.text('');

        try {
            // Standard test prompt
            const objectUrl = await fetchPreviewBlob('a simple illustration of a blue bird, white background');
            $status.text('Connected!');
            
            await callPopup(
                `<h3>PersonaLyze — Connection OK</h3>
                 <p style="opacity:0.65;font-size:0.88em;">Pollinations responded successfully. Test image below:</p>
                 <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            );
        } catch (err) {
            $status.text(`Failed: ${err.message}`);
            error('Vault', 'Test connection failed:', err);
            if (window.toastr) window.toastr.error(err.message, 'PersonaLyze');
        } finally {
            $btn.prop('disabled', false).text('Test Connection');
        }
    });
}