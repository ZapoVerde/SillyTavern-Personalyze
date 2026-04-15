/**
 * @file data/default-user/extensions/personalyze/logic/pipeline/master.js
 * @stamp {"utc":"2026-04-10T21:20:00.000Z"}
 * @architectural-role Supreme Orchestrator
 * @description
 * Coordinates the sequential execution of the PersonaLyze detection pipeline.
 * Ensures Scene-level checks (Phase 0) occur before Turn-level extraction (Phases 1-3).
 * Handles Localyze integration and clears temporary session blacklists on scene changes.
 *
 * @api-declaration
 * runPipeline(messageId) -> Promise<void>
 * 
 * @contract
 *   assertions:
 *     purity: Stateful Orchestrator
 *     state_ownership: []
 *     external_io: [Localyze, LLM Scene Detect, turn.js, scene.js, callLog.js]
 */

import { getContext } from '../../../../../extensions.js';
import { getSettings } from '../../settings.js';
import { startTurn } from '../../utils/callLog.js';
import { log, error } from '../../utils/logger.js';
import { buildHistoryText } from '../../utils/history.js';
import { clearIgnored } from '../blacklist.js';
import { detectSceneChange } from '../../io/llm/scene.js';

// Internal module imports for specific logic branches
import { runScenePipeline } from './scene.js';
import { runTurnPipeline } from './turn.js';

/**
 * Main entry point for turn-based processing.
 * Orchestrates Phase 0 (Scene) followed by Phase 1-3 (Turn).
 *
 * @param {number} messageId - The index of the message to process.
 * @param {AbortSignal} [signal] - Optional signal to cancel the pipeline.
 */
export async function runPipeline(messageId, signal) {
    const context = getContext();
    const message = context.chat[messageId];
    if (!message || message.is_user) return;

    const s = getSettings();
    if (!s.enabled) return;

    startTurn('Pipeline');
    log('Master', `Starting execution for message ${messageId}`);

    try {
        // ─── Phase 0: Scene Check ─────────────────────────────────────────────

        let sceneChanged = false;

        // If Localyze is active it will broadcast 'localyze:location-changed' after its
        // own pipeline commits the scene record. index.js catches that event and runs
        // runScenePipeline directly, so we skip the LLM check here entirely.
        // Only fall back to our own LLM check when Localyze is absent.
        const localyzeActive = !!(window.extension_settings?.localyze?.enabled);

        if (!localyzeActive) {
            const history = buildHistoryText(context.chat, messageId, s.detectionHistory);
            sceneChanged = await detectSceneChange(
                'Unknown',
                history,
                message.mes,
                s.booleanProfileId || s.fastProfileId,
                s.sceneChangePrompt
            );
        }

        // ─── Phase 0 Execution: Scene Redress ─────────────────────────────────

        if (sceneChanged) {
            log('Master', 'Scene change confirmed. Resetting session blacklist.');
            clearIgnored();

            // runScenePipeline handles batch wardrobe validity and redress extraction
            if (signal?.aborted) return;
            await runScenePipeline(messageId, signal);
        }

        // ─── Phase 1-3 Execution: Standard Turn ───────────────────────────────

        // runTurnPipeline handles subject detection, archivist logic, and incremental clothes changes.
        // It runs AFTER scene redress so that message-specific actions (e.g. "She took off her hat")
        // correctly override the background redress.
        if (signal?.aborted) return;
        await runTurnPipeline(messageId, signal);

        log('Master', `Execution complete for message ${messageId}`);

    } catch (err) {
        if (err.name === 'AbortError') return;
        error('Master', 'Pipeline failed:', err.message);
        if (window.toastr) {
            window.toastr.error('PersonaLyze pipeline encountered an error.', 'PersonaLyze');
        }
    }
}