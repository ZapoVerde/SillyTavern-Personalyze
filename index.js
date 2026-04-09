/**
 * @file data/default-user/extensions/personalyze/index.js
 * @stamp {"utc":"2026-04-07T15:20:00.000Z"}
 * @version 0.4.0
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Personalyze extension entry point.
 *
 * Coordinates the initialization of the DNA-first architecture, binding 
 * SillyTavern lifecycle events to the detection pipeline and boot sequence.
 * 
 * Updated to support decomposed UI modules and unified Workshop core.
 *
 * @api-declaration
 * handleMessageReceived(messageId) — routes new AI messages to the pipeline.
 * handleChatChanged()              — resets state and reboots on chat switch.
 * init()                           — primary async initialization sequence.
 *
 * @contract
 *   assertions:
 *     purity: Event Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource, UI Injections, Bootstrapper, smartResize]
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { resetState } from './state.js';
import { log, error, setVerbose } from './utils/logger.js';
import { initLibrary } from './library.js';
import { getSettings } from './settings.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { injectSettingsPanel } from './ui/settings/panel.js';
import { injectMessageBadge, reinjectAllBadges } from './ui/badge.js';
import { injectPortraitContainer } from './portrait.js';
import { injectVnPanel } from './ui/vnPanel.js';
import { openWorkshop } from './ui/workshop/core.js';
import { smartResize } from './utils/dom.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received.
 */
function handleMessageReceived(messageId) {
    runPipeline(messageId)
        .then(() => injectMessageBadge(messageId))
        .catch(err => {
            error('Core', 'Pipeline execution failed:', err);
        });
}

/**
 * Swipe Dispatcher.
 * Re-runs detection when the user navigates between message alternatives.
 */
function handleMessageSwiped(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    if (!message || message.is_user) return;

    const swipeContent = message.swipes?.[message.swipe_id];
    if (typeof swipeContent !== 'string') return;

    runPipeline(messageId)
        .then(() => injectMessageBadge(messageId))
        .catch(err => {
            error('Core', 'Pipeline execution failed on swipe:', err);
        });
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
 * Points to the new unified Workshop core.
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
        // 1. Data Layer — Initialize Global Library (Templates) and Settings
        initLibrary();

        // Apply verbose logging preference from active profile
        setVerbose(getSettings().verboseLogging ?? false);

        // 2. UI Layer — Inject persistent elements into the ST DOM
        injectSettingsPanel();
        injectPortraitContainer();
        injectVnPanel();
        injectToolbarButton();

        // 3. Global Responsiveness — Handle auto-resize for all extension textareas
        window.addEventListener('resize', () => {
            $('.plz-auto-textarea:visible').each(function() {
                smartResize(this);
            });
        });

        // 4. Host Events — Bind core SillyTavern lifecycle events
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.MESSAGE_SWIPED, handleMessageSwiped);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, injectMessageBadge);
        log('Core', 'Listeners active.');

        // 5. Conditional Initial Boot
        const context = getContext();
        if (context && context.chatId) {
            log('Core', 'Active chat detected on init. Running DNA boot sequence...');
            await runBoot();
            reinjectAllBadges();
        } else {
            log('Core', 'Standing by for chat selection.');
        }

    } catch (err) {
        error('Core', 'CRITICAL FAILURE during initialization:', err);
    }
}

// ─── Execution ───────────────────────────────────────────────────────────────

init().catch(err => {
    error('Core', 'Top-level initialization rejection:', err);
});