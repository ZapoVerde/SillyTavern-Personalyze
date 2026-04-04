/**
 * @file data/default-user/extensions/personalyze/index.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @version 0.1.10
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Personalyze (PLZ) — extension entry point.
 *
 * Binds SillyTavern lifecycle events to the PLZ pipeline and boot sequence.
 * Handles new AI messages, swipe navigation, and chat session changes.
 *
 * @api-declaration
 * handleMessageReceived(messageId) — routes new AI messages to the pipeline.
 * handleMessageSwiped(messageId)   — re-runs pipeline when navigating a swipe.
 * handleChatChanged()              — resets state and reboots on chat switch.
 * init()                           — primary async initialization sequence.
 *
 * @contract
 *   assertions:
 *     purity: Event Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource (subscribe), UI Injections, Bootstrapper]
 */

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { resetState } from './state.js';
import { log, error, setVerbose } from './utils/logger.js';
import { initRegistry } from './registry.js';
import { getSettings } from './settings.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { injectSettingsPanel } from './ui/panel.js';
import { injectMessageBadge, reinjectAllBadges } from './ui/badge.js';
import { injectPortraitContainer } from './portrait.js';
import { handleOpenWorkshop } from './logic/characterWorkshop.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received.
 * @param {number} messageId
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
 * Triggered when the user navigates to an existing swipe alternative.
 * Skips if the swipe slot is unpopulated — MESSAGE_RECEIVED fires when the
 * new generation completes.
 * @param {number} messageId
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
 * Resets runtime state and initiates the boot sequence (pointer reconstruction)
 * whenever the active chat changes.
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
 * Clicking it opens the Character Workshop on the Roster tab.
 */
function injectToolbarButton() {
    $('#plz-toolbar-btn').remove();

    const $btn = $(`
        <div id="plz-toolbar-btn" class="list-group-item flex-container flexGap5" title="Personalyze — Character Workshop">
            <i class="fa-solid fa-user"></i>
            <span>Personalyze</span>
        </div>
    `);

    $btn.on('click', () => handleOpenWorkshop());

    const $menu = $('#extensionsMenu');
    if ($menu.length) $menu.append($btn);
}

/**
 * Extension Entry Point.
 * Orchestrates the startup sequence.
 */
async function init() {
    log('Core', 'Extension initializing...');

    try {
        // 1. Data Layer — Bootstrap global registry and settings.
        initRegistry();

        // Apply stored verbose preference before any further logging.
        setVerbose(getSettings().verboseLogging ?? false);

        // 2. UI Layer — Inject persistent elements into the ST DOM.
        injectSettingsPanel();
        injectPortraitContainer();
        injectToolbarButton();

        // 3. Host Events — Bind core SillyTavern lifecycle events.
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.MESSAGE_SWIPED, handleMessageSwiped);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, injectMessageBadge);
        log('Core', 'Listeners active.');

        // 4. Conditional Initial Boot
        // Only run if a chatId is already present (e.g. extension hot-reload).
        // On fresh ST load, CHAT_CHANGED triggers the boot sequence.
        const context = getContext();
        if (context && context.chatId) {
            log('Core', 'Active chat detected on init. Running boot sequence...');
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
