/**
 * @file data/default-user/extensions/personalyze/index.js
 * @stamp {"utc":"2026-04-10T23:50:00.000Z"}
 * @version 0.4.2
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Personalyze extension entry point.
 *
 * Coordinates the initialization of the DNA-first architecture, binding 
 * SillyTavern lifecycle events to the Master Pipeline.
 * 
 * @api-declaration
 * handleMessageReceived(messageId) — routes new AI messages to the Master Pipeline.
 * handleChatChanged()              — resets state and reboots on chat switch.
 * init()                           — primary async initialization sequence.
 *
 * @contract
 *   assertions:
 *     purity: Event Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource, UI Injections, Bootstrapper, Master Pipeline]
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { resetState } from './state.js';
import { log, error, setVerbose } from './utils/logger.js';
import { initLibrary } from './library.js';
import { getSettings } from './settings.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline/master.js';
import { injectSettingsPanel } from './ui/settings/panel.js';
import { injectMessageBadge, reinjectAllBadges } from './ui/badge.js';
import { injectPortraitContainer } from './portrait.js';
import { injectVnPanel } from './ui/vnPanel.js';
import { openWorkshop } from './ui/workshop/core.js';
import { smartResize } from './utils/dom.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received or swiped.
 */
async function handleMessageReceived(messageId) {
    try {
        await runPipeline(messageId);
        injectMessageBadge(messageId);
    } catch (err) {
        error('Core', 'Pipeline execution failed:', err);
    }
}

/**
 * Session Lifecycle Manager.
 * Resets runtime state and initiates DNA reconstruction on chat switch.
 */
function handleChatChanged() {
    log('Core', 'Chat changed event detected.');
    resetState();
    runBoot()
        .then(() => reinjectAllBadges())
        .catch(err => {
            error('Core', 'Bootstrapper failed during chat change:', err);
        });
}

/**
 * Injects the Personalyze button into the ST extensions menu.
 */
function injectToolbarButton() {
    $('#plz-toolbar-btn').remove();

    const $btn = $(`
        <div id="plz-toolbar-btn" class="list-group-item flex-container flexGap5" title="Personalyze — Character Workshop">
            <i class="fa-solid fa-dna"></i>
            <span>Personalyze</span>
        </div>
    `);

    $btn.on('click', () => openWorkshop('dna'));

    const $menu = $('#extensionsMenu');
    if ($menu.length) $menu.append($btn);
}

/**
 * Extension Entry Point.
 */
async function init() {
    log('Core', 'Extension initializing...');

    try {
        // 1. Data Layer — Initialize Global Library and Settings
        initLibrary();

        // Apply verbose logging preference
        setVerbose(getSettings().verboseLogging ?? false);

        // 2. UI Layer — Inject persistent elements
        injectSettingsPanel();
        injectPortraitContainer();
        injectVnPanel();
        injectToolbarButton();

        // 3. Global Responsiveness
        window.addEventListener('resize', () => {
            $('.plz-auto-textarea:visible').each(function() {
                smartResize(this);
            });
        });

        // 4. Host Events — Bind SillyTavern lifecycle events
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.MESSAGE_SWIPED, handleMessageReceived);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, injectMessageBadge);
        
        // Localyze Stub: Fires only for out-of-band location changes that arrive
        // OUTSIDE a normal MESSAGE_RECEIVED flow. If the last message already carries
        // the localyze.location_changed flag, master.js will handle it via the standard
        // pipeline — skip here to avoid running runScenePipeline twice.
        document.addEventListener('localyze:location-changed', async () => {
            const context = getContext();
            if (context?.chatId) {
                const lastIdx = context.chat.length - 1;
                if (lastIdx < 0) return;
                const lastMsg = context.chat[lastIdx];
                if (lastMsg?.extra?.localyze?.location_changed) return;
                log('Core', 'Received out-of-band Localyze signal. Running scene pipeline...');
                const { runScenePipeline } = await import('./logic/pipeline/scene.js');
                await runScenePipeline(lastIdx);
            }
        });

        log('Core', 'Listeners active.');

        // 5. Conditional Initial Boot
        const context = getContext();
        if (context && context.chatId) {
            log('Core', 'Active chat detected on init. Running DNA boot sequence...');
            await runBoot();
            reinjectAllBadges();
        }

    } catch (err) {
        error('Core', 'CRITICAL FAILURE during initialization:', err);
    }
}

// ─── Execution ───────────────────────────────────────────────────────────────

init().catch(err => {
    error('Core', 'Top-level initialization rejection:', err);
});