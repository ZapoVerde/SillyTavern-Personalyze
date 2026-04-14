
# PersonaLyze — Project Principles
*Read before writing any code. Applies to every session.*

---

## 1. The Core Philosophy: Narrative Source of Truth
PersonaLyze manages **Visual Character Continuity**. The chat ledger is the only database that matters. 

We do not trust external databases or global settings for a character's current narrative state. If a character puts on a "Winter Coat" in Turn 50 of a story, that visual state belongs to that specific story branch. If the user forks the chat at Turn 40, the "Winter Coat" must not exist in the new branch. All visual transitions and identity definitions are permanently embedded in the chronological chat record.

## 2. Layered Visual States (Ensembles, not Outfits)
Characters do not wear monolithic "outfits." Visual state is tracked as a composite of independent layers (e.g., outerwear, top, bottom, accessories) alongside expressive states (emotion, pose). 

*   **Incremental Updates:** When a character "takes off their jacket," the system only updates the outerwear layer; the rest of the visual state persists automatically.
*   **Ensembles:** When a user wants to save a specific combination of layers for future use, it is saved as an "Ensemble" (a complete wardrobe snapshot), not a rigid costume.

## 3. Separation of Narrative and Render Logic
To keep the chat ledger pure, we strictly separate *what* is happening in the story from *how* it is drawn.

*   **The Narrative DNA:** Lives in the chat. It dictates the character's physical identity, current clothing, and emotion.
*   **Global Styles:** Lives in the user's global settings. It dictates the aesthetic (e.g., Anime vs. Realistic), the specific image generation engine, resolution overrides, and LoRAs.
*   **The Rule:** You should be able to instantly swap a chat's Global Style to render the exact same narrative moments in a completely different art style, without modifying the underlying character data.

## 4. Proactive and Reactive Detection (The Cascade)
Detection follows a highly optimized cascade designed to halt as early as possible to minimize LLM costs and latency.

*   **Phase 0: Scene Proactivity:** When the narrative shifts locations, the system evaluates the entire active roster. Do their current outfits still make sense for the new environment? If not, a background redress is triggered.
*   **Phase 1: Subject Identification:** A cheap check (using text heuristics first, falling back to a fast LLM) to identify exactly who is acting in the current message.
*   **Phase 2: The Change Gate:** A fast LLM determines if the active subject actually changed their appearance, emotion, or pose. If no, the pipeline halts.
*   **Phase 3: Layered Extraction:** Only when a change is confirmed does the Smart LLM perform an extraction, targeting only the specific visual layers that were modified.

## 5. Multi-Character Presence (The Roster)
The system assumes a scene can have multiple actors at any given time. Characters are added to the active roster dynamically as they enter the narrative, and their independent visual states are tracked and generated in parallel. A change to one character's state does not disrupt the persistence of another's.

## 6. Eventual Consistency (The Two-Write Pattern)
Image generation is asynchronous, slow, and prone to failure. To keep the chronological chat record accurate and perfectly synced with the text, we use a two-step commitment process:

1.  **Narrative Intent:** As soon as a visual change is confirmed by the LLM (or user), the transition is immediately written to the chat record. The system now knows *what* the character looks like, even if the image doesn't exist yet.
2.  **Asset Completion:** The heavy image generation runs in the background. Once the file is safely written to the user's hard drive, the system goes back and patches the original transition record with the file pointer.

## 7. Just-in-Time Self-Healing
The system must recover gracefully from missing assets (e.g., a user purged their image folder to save space). 
*   **Requirement-Driven:** The system does not preemptively regenerate missing images buried deep in the chat history. It only heals missing portraits if they are required for the *current* active screen or if the user explicitly requests a refresh.

## 8. The Three Kinds of Code
All code must belong to one of three categories to ensure predictable stability. No module may mix these responsibilities:

1.  **Pure Functions:** Takes data in, returns derived data out. No external reads or writes. It does not know the UI exists. It does not know about settings. 
2.  **Stateful Owners:** The strictly bounded gatekeepers of runtime memory. If a component needs to update the "Active Character," it must ask the stateful owner to do it.
3.  **IO Executors:** The workers. They manipulate the DOM, talk to LLMs, write to the hard drive, or call external APIs. They contain absolutely zero narrative or state-derivation logic.

Here is the new section for **PLZ_principles.md**, drafted to be code-agnostic and focused on the philosophy of transparency and observability.

***

## 9. Forensic Observability and System Audit
Transparency and technical traceability are non-negotiable. Because the system relies on a multi-stage, multi-model pipeline, the user must have access to a "Forensic Flight Recorder" that captures every byte exchanged between the extension and external services.

*   **Total Mirror Protocol:** Every exchange—whether a narrative inference, an image generation request, or a background discovery task—must be captured in a rolling in-memory audit log. This includes successes, transient blips, and hard failures.
*   **The Three-Tier Log Architecture:**
    1.  **Narrative Pipeline:** Captures the last **two complete turn pairs** (four distinct narrative events). This is the primary tool for diagnosing "logic hallucinations" or incorrect subject identification.
    2.  **Workshop & Manual Tools:** Captures the last **three manual interactions** (Anchor Scans, Force Costume extractions, or Style tests). 
    3.  **System Discovery & Infrastructure:** Captures the last **five background events**, including model discovery queries, LoRA registry fetches, and engine connectivity pings. This ensures that "missing model" errors or "failed loads" are immediately traceable to the source API response.
*   **Deep-Trace Data Payloads:** To facilitate immediate troubleshooting without code changes, every log entry must contain:
    1.  **The Request Bundle:** The exact JSON payload, headers (masked), and technical parameters (seed, guidance, architecture) dispatched to the provider.
    2.  **The Response Document:** The raw, un-redacted response document. For successful calls, this includes the content/asset reference. For failed calls (400, 500, etc.), this must include the **complete Error JSON** or HTML body returned by the service.
    3.  **Network Metadata:** Precise execution timestamps (start/end), latency measurements, and provider-specific task identifiers (e.g., PiAPI Task IDs).
*   **The "Forensic" UI Standard:** The Log Viewer must render technical data in a monospace, syntax-aware format. It must prioritize "pretty-printed" JSON and provide a "Copy Debug Bundle" feature to allow users to export the full request/response pair for external validation.
*   **Fail-Loud Exception Handling:** The IO layer must never "swallow" a technical response. If a service returns an error, the system must **clone the response stream**, extract the body, and hydrate the audit log with the actual service document before bubbling the error to the UI.

---