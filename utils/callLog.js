/**
 * @file data/default-user/extensions/personalyze/utils/callLog.js
 * @stamp {"utc":"2026-04-18T15:00:00.000Z"}
 * @architectural-role Utility (Forensic Flight Recorder)
 * @description
 * Rolling in-memory logs for all extension network traffic. 
 * Implements the Forensic Observability Protocol by mirroring full request/response 
 * documents across three distinct buffers.
 *
 * PIPELINE store  — last 4 narrative turns (2 full message pairs).
 * WORKSHOP store  — last 3 user-initiated manual actions (Scans/Extractions).
 * SYSTEM store    — last 5 discovery/infrastructure events (Model fetching/Pings).
 *
 * @api-declaration
 * startTurn(label)                             → void
 * startWorkshopTurn(label)                     → void
 * startSystemTurn(label)                       → void
 * logCall(label, prompt, resp, err, reqBundle) → void
 * logPatchLast(resp, err, meta, respDoc)       → void
 * getLogs()                                    → TurnRecord[]
 * getWorkshopLogs()                            → TurnRecord[]
 * getSystemLogs()                              → TurnRecord[]
 *
 * @contract
 *   assertions:
 *     purity: Stateful (In-memory session only)
 *     state_ownership: [_pipelineTurns, _workshopTurns, _systemTurns, _target, _turnCounter]
 *     external_io: []
 */

const MAX_PIPELINE_TURNS = 4;
const MAX_WORKSHOP_TURNS = 3;
const MAX_SYSTEM_TURNS   = 5;

let _turnCounter = 0;

/** Which store logCall() currently routes to: 'pipeline' | 'workshop' | 'system'. */
let _target = 'pipeline';

/** ID of the turn that is currently receiving logCall() entries. */
let _currentTurnId = 0;

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _pipelineTurns = [];

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _workshopTurns = [];

/** @type {{ id: number, label: string, timestamp: number, calls: object[] }[]} */
let _systemTurns = [];

// ─── Internal ─────────────────────────────────────────────────────────────────

function _openTurn(label, store, maxTurns) {
    _turnCounter++;
    _currentTurnId = _turnCounter;
    store.push({ id: _currentTurnId, label, timestamp: Date.now(), calls: [] });
    if (store.length > maxTurns) store.shift();
}

// ─── Public API: Turn Lifecycle ───────────────────────────────────────────────

/** Opens a new pipeline log group. */
export function startTurn(label) {
    _target = 'pipeline';
    _openTurn(label, _pipelineTurns, MAX_PIPELINE_TURNS);
}

/** Opens a new workshop log group. */
export function startWorkshopTurn(label) {
    _target = 'workshop';
    _openTurn(label, _workshopTurns, MAX_WORKSHOP_TURNS);
}

/** Opens a new system discovery log group. */
export function startSystemTurn(label) {
    _target = 'system';
    _openTurn(label, _systemTurns, MAX_SYSTEM_TURNS);
}

// ─── Public API: Data Entry ───────────────────────────────────────────────────

/**
 * Records one technical transaction.
 * 
 * @param {string}      label         The specific stage (e.g. 'SubjectDetect').
 * @param {string}      prompt        Legacy prompt string or summary.
 * @param {any}         response      Raw result or filename identifier.
 * @param {string|null} errorMsg      Human-readable error summary.
 * @param {object|null} requestBundle Mirror of the full JSON payload sent.
 */
export function logCall(label, prompt, response, errorMsg, requestBundle = null) {
    const storeMap = {
        'pipeline': { store: _pipelineTurns, max: MAX_PIPELINE_TURNS },
        'workshop': { store: _workshopTurns, max: MAX_WORKSHOP_TURNS },
        'system':   { store: _systemTurns,   max: MAX_SYSTEM_TURNS }
    };
    
    const { store, max } = storeMap[_target] || storeMap.pipeline;

    let turn = store.find(t => t.id === _currentTurnId);

    // Stale-fallback: auto-open a Standalone turn if the active one is absent
    // or its last call is more than 15s old.
    const lastCallTs = turn?.calls.at(-1)?.timestamp ?? 0;
    if (!turn || (turn.calls.length > 0 && Date.now() - lastCallTs > 15_000)) {
        _turnCounter++;
        _currentTurnId = _turnCounter;
        store.push({ id: _currentTurnId, label: 'Standalone', timestamp: Date.now(), calls: [] });
        if (store.length > max) store.shift();
        turn = store[store.length - 1];
    }

    turn.calls.push({
        label,
        prompt:        prompt        ?? '',
        response:      response      ?? null,
        error:         errorMsg      ?? null,
        requestBundle: requestBundle ? structuredClone(requestBundle) : null,
        responseDocument: null,
        meta:          null,
        timestamp:     Date.now(),
    });
}

/**
 * Patches the most recent entry with forensic response data.
 * 
 * @param {any}         response          The completed result.
 * @param {string|null} errorMsg          Error summary.
 * @param {object|null} meta              Task-specific metadata.
 * @param {object|null} responseDocument  Mirror of the full response body/JSON.
 */
export function logPatchLast(response, errorMsg, meta = undefined, responseDocument = undefined) {
    const store = (_target === 'workshop') ? _workshopTurns : (_target === 'system' ? _systemTurns : _pipelineTurns);
    const turn  = store.find(t => t.id === _currentTurnId);
    if (!turn || !turn.calls.length) return;
    
    const last = turn.calls[turn.calls.length - 1];
    
    if (response !== undefined)         last.response = response;
    if (errorMsg !== undefined)         last.error    = errorMsg;
    if (meta !== undefined)             last.meta     = meta;
    if (responseDocument !== undefined) last.responseDocument = responseDocument ? structuredClone(responseDocument) : null;
}

// ─── Public API: Retrieval ────────────────────────────────────────────────────

/** Returns pipeline turns (oldest first). */
export function getLogs() {
    return [..._pipelineTurns];
}

/** Returns manual workshop turns (oldest first). */
export function getWorkshopLogs() {
    return [..._workshopTurns];
}

/** Returns system discovery turns (oldest first). */
export function getSystemLogs() {
    return [..._systemTurns];
}