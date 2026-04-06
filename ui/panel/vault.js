/**
 * @file data/default-user/extensions/personalyze/ui/panel/vault.js
 * @stamp {"utc":"2026-04-06T00:00:00.000Z"}
 * @architectural-role UI Logic (Secrets)
 * @description
 * Interface for the Pollinations and Hugging Face API key vaults.
 * 
 * Provides granular status indicators for both keys and handles 
 * independent connection testing for both image generation engines.
 *
 * @api-declaration
 * updateKeyStatusIndicator() -> void
 * bindVaultHandlers($panel) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [secret_state]
 *     external_io: [writeSecret, fetchPreviewBlob, callPopup, toastr]
 */

import { callPopup } from '../../../../../../script.js';
import { writeSecret, secret_state } from '../../../../../secrets.js';
import { fetchPreviewBlob } from '../../imageCache.js';
import { error } from '../../utils/logger.js';

const SECRET_POLLINATIONS = 'api_key_pollinations';
const SECRET_HUGGINGFACE  = 'api_key_huggingface';

/**
 * Updates the UI status indicator based on which keys are present in the vault.
 */
export function updateKeyStatusIndicator() {
    const $indicator = $('#plz-key-status');
    if (!$indicator.length) return;

    const polState = secret_state[SECRET_POLLINATIONS];
    const hfState  = secret_state[SECRET_HUGGINGFACE];

    const hasPol = Array.isArray(polState) && polState.length > 0;
    const hasHf  = Array.isArray(hfState) && hfState.length > 0;

    let html = '';
    
    if (hasPol && hasHf) {
        html = '<span style="color:var(--SmartThemeQuoteColor,#28a745);"><i class="fa-solid fa-circle-check"></i> Both engines configured</span>';
    } else if (hasPol || hasHf) {
        const missing = !hasPol ? 'Pollinations' : 'Hugging Face';
        html = `<span style="color:var(--SmartThemeWarningColor,#ffc107);"><i class="fa-solid fa-circle-info"></i> ${missing} key missing</span>`;
    } else {
        html = '<span style="color:var(--SmartThemeErrorColor,#e05555);"><i class="fa-solid fa-triangle-exclamation"></i> No keys configured</span>';
    }

    $indicator.html(html);
}

/**
 * Helper to test an image engine connection.
 * @param {jQuery} $btn 
 * @param {'pollinations'|'huggingface'} provider 
 */
async function testConnection($btn, provider) {
    const $status = $('#plz-test-status');
    const originalText = $btn.text();
    
    $btn.prop('disabled', true).text('Testing...');
    $status.text(`Testing ${provider === 'huggingface' ? 'HF (may take 20s+)' : 'Pollinations'}...`);

    try {
        const testPrompt = 'a simple illustration of a blue bird, white background';
        const objectUrl  = await fetchPreviewBlob(testPrompt, 'test_char', provider);
        
        $status.text(`${provider === 'huggingface' ? 'HF' : 'Pol'} Connected!`);
        
        await callPopup(
            `<h3>Connection OK — ${provider === 'huggingface' ? 'Hugging Face' : 'Pollinations'}</h3>
             <p style="opacity:0.65;font-size:0.88em;">The ${provider} engine responded successfully. Test image below:</p>
             <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
            'text',
        );
    } catch (err) {
        $status.text(`Failed: ${err.message.slice(0, 40)}...`);
        error('Vault', `Test connection failed for ${provider}:`, err);
        if (window.toastr) window.toastr.error(`${provider} test failed: ${err.message}`, 'PersonaLyze');
    } finally {
        $btn.prop('disabled', false).text(originalText);
    }
}

/**
 * Binds the vault management actions for both engines.
 * @param {jQuery} $panel 
 */
export function bindVaultHandlers($panel) {
    // 1. Save to Vault (Generic for both secrets)
    $panel.on('click', '.plz-vault-save', async function () {
        const secretName = $(this).data('secret');
        const inputId    = secretName === SECRET_HUGGINGFACE ? '#plz-huggingface-key' : '#plz-pollinations-key';
        const key        = $(inputId).val().trim();

        if (!key) {
            if (window.toastr) window.toastr.warning('Please paste the API key first.', 'PersonaLyze');
            return;
        }

        try {
            const label = secretName === SECRET_HUGGINGFACE ? 'PersonaLyze: Hugging Face' : 'PersonaLyze: Pollinations';
            await writeSecret(secretName, key, label);
            $(inputId).val('');
            updateKeyStatusIndicator();
            if (window.toastr) window.toastr.success('API key saved to vault.', 'PersonaLyze');
        } catch (err) {
            error('Vault', 'Failed to write secret:', err);
            if (window.toastr) window.toastr.error('Failed to save key to vault.');
        }
    });

    // 2. Test Pollinations
    $panel.on('click', '#plz-test-pollinations', function () {
        testConnection($(this), 'pollinations');
    });

    // 3. Test Hugging Face
    $panel.on('click', '#plz-test-huggingface', function () {
        testConnection($(this), 'huggingface');
    });
}