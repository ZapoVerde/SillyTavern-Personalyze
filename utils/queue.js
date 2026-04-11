/**
 * @file data/default-user/extensions/personalyze/utils/queue.js
 * @stamp {"utc":"2026-04-14T09:00:00.000Z"}
 * @architectural-role Utility / Concurrency Mechanic
 * @description
 * Implements a TaskQueue to manage parallel execution of asynchronous operations.
 * Essential for the Multi-Character pipeline to prevent overwhelming the LLM
 * or Image APIs when multiple characters update simultaneously.
 *
 * @api-declaration
 * class TaskQueue
 *   constructor(concurrency = 2)
 *   enqueue(taskFn) → Promise<any>
 *
 * @contract
 *   assertions:
 *     purity: pure mechanic
 *     state_ownership: [internal queue, active counter]
 *     external_io: none
 */

/**
 * Manages the execution of asynchronous tasks with a fixed concurrency limit.
 */
export class TaskQueue {
    /**
     * @param {number} concurrency - Maximum number of tasks to run at once.
     */
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    /**
     * Adds a task to the queue and returns a promise that resolves
     * when the task eventually completes.
     * 
     * @param {() => Promise<any>} taskFn - An async function to execute.
     * @returns {Promise<any>}
     */
    async enqueue(taskFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ taskFn, resolve, reject });
            this._process();
        });
    }

    /**
     * Attempts to start the next task(s) if under the concurrency limit.
     * @private
     */
    async _process() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.running++;
        const { taskFn, resolve, reject } = this.queue.shift();

        try {
            const result = await taskFn();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.running--;
            this._process();
        }
    }
}