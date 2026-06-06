# Personalyze

**[WIP]**
**The Visual Novel Continuity Engine for SillyTavern**

Personalyze transforms your text-based roleplays into a dynamic, multi-character Visual Novel. It isn't just a simple "prompt-to-image" script—it is a **stateful narrative engine**. 

Personalyze silently reads the story, tracks multiple characters, understands exactly what they are wearing layer-by-layer (Outerwear, Top, Bottom, Accessories), and automatically generates updated portraits as the scene evolves.

⚠️ **Note:** Personalyze uses a **Split-Screen Visual Novel (VN) interface** as its exclusive display mode. Characters are dynamically rendered in a row at the top of your chat window.

---

## 🛠️ Phase 1: Installation

Personalyze requires both a frontend extension and a backend server plugin to securely route API requests and handle background processing.

**Step 1: Install the Frontend**
1. Open SillyTavern.
2. Go to the **Extensions** menu (the block icon).
3. Click **Install Extension** and paste the GitHub URL for Personalyze.

**Step 2: Install the Backend Plugin**
1. Navigate to your SillyTavern installation folder on your computer.
2. Go to `SillyTavern/public/extensions/Personalyze/plugin`.
3. Copy the entire `Personalyze` folder found inside.
4. Paste that folder into your root `SillyTavern/plugins` directory. *(If the `plugins` folder doesn't exist, create it).*

**Step 3: Authorize the Plugin in `config.yaml`**
1. Open `SillyTavern/config.yaml` in a text editor.
2. Find `enableServerPlugins` and set it to `true`.
3. Find `allowUnsafeExternalRequests` and set it to `true` (or specifically whitelist the domains for your chosen image engines).
4. **Restart your SillyTavern server.**

---

## ⚙️ Phase 2: The "Day Zero" Configuration

Before you start chatting, you need to provide Personalyze with its "Fuel" (Image Generators), its "Brains" (LLMs), and its "Art Direction" (Global Styles).

### 1. The Fuel (Image Generators)
You need an account and API key from a supported image provider. We highly recommend **Runware**, **Fal AI**, or **PiAPI**.

> 💡 **RECOMMENDATION: Use Natural Language Models!**
> Personalyze works best with **Z-Image Turbo** or **Flux.1** models. The extension extracts complex, human-readable clothing descriptions from your story, which these models understand perfectly. 
> *While traditional Diffusion models (SD 1.5, SDXL) are technically supported via custom Blueprints and LoRAs, they rely heavily on comma-separated tags and are notoriously difficult to tune for an automated pipeline.*

1. Open the Personalyze Settings Panel in SillyTavern.
2. Click **Configure Engines**.
3. Navigate to the tab of your chosen provider (e.g., Runware).
4. Paste your API Key and click **Save to Vault**.
5. Select your preferred model (e.g., Z-Image Turbo or Flux.1).
6. Click **Ping** to verify your connection is working.

### 2. The Brains (LLM Connections)
To save you money and tokens, Personalyze uses a "Cascade" system. It uses a cheap model to check *if* a visual change happened, and an expensive model to figure out *what* changed.
1. In the Personalyze Settings Panel, look for the **Connection** dropdowns.
2. **Fast Model (Phases 1-2):** Map this to a fast, cheap LLM profile (e.g., Claude Haiku, Llama-3 8B).
3. **Smart Model (Phase 3+):** Map this to a highly capable LLM profile (e.g., Claude 3.5 Sonnet, GPT-4o).

### 3. The Art Direction (Global Styles)
Characters define *what* they wear, but Styles define *how* it is drawn. 
1. Click the **Workshop** button (the DNA icon) in your top extensions toolbar.
2. Go to the **Global Styles** tab.
3. Ensure you have a style named **Default**.
4. Click **Engine & Model** under Generation Settings, and link this style to the Engine and Model you configured in Step 1.
5. Setup your prompt templates (e.g., `"anime style, highly detailed, masterpiece"`).
6. Click **💾 Save**.

---

## 🎮 Phase 3: First Contact (How to Play)

Now you are ready to chat. Here is what to expect on your first message.

### 1. The Archivist Modal
As soon as a character is mentioned in the chat, generation will pause and the **Archivist Modal** will pop up. 
*   **Don't panic!** This is the system asking for permission to track a newly discovered character. 
*   You **must** click **Create New Character** to register their DNA. If you ignore them, no portrait will generate.

### 2. The Studio (Editing Identity)
Once the character is created, open the **Workshop -> Studio** tab.
*   **Identity Anchor:** This is the character's permanent physical description (e.g., *"Tall, green eyes, scar over left cheek, messy blonde hair"*). If it is blank, click **Scan Chat** to let your Smart LLM find their description in the story, or type it yourself.
*   **Register & Apply:** Click this button at the bottom to commit their initial visual state.

### 3. The Visual Novel Interface
Your characters will now appear at the top of your screen!
*   **Resizing:** Click the fraction button (e.g., `½`, `⅓`) on the right side of your screen to cycle how much space the portraits consume.
*   **The Focus Slot:** Characters in the background will overlap dynamically. Click any background character to pull them to the front-right "Focus Slot."
*   **Controls:** Hover over a portrait to reveal controls to Mirror (flip) the image, Remove them from the scene, or **Refresh** the generation.

### 4. Seed Looping (Easy Rerolls)
If you don't like an outfit generation:
1. Open the character in the **Workshop -> Studio**.
2. Check the **Auto-increment on refresh** box next to their Seed.
3. Click the **Refresh** icon on their portrait card.
4. The system will automatically bump their seed, generate a new variation, and permanently save the new seed to their DNA.

---

## 🔬 Advanced Features

*   **Ensembles:** In the Studio, click **Save as Ensemble** to snapshot a character's current 5-slot wardrobe. You can star (⭐) an ensemble to make it their "Everyday Wear."
*   **Proactive Scene Redressing:** Personalyze detects when characters change locations. It will evaluate the active roster and automatically redress them in the background if their clothes no longer fit the environment (e.g., going from a snowy mountain to a beach).
*   **Vistalyze Integration:** If you use the spatial mapping extension [Vistalyze](https://github.com/SillyTavern/Extension-Vistalyze), Personalyze hooks into it automatically, bypassing redundant LLM scene-checks.
*   **Forensic Flight Recorder:** Having issues? Click the **Logs** button in the Settings Panel. The Flight Recorder tracks the exact JSON payloads, API errors, and prompts sent to the engines over the last few turns. You can copy full "Debug Bundles" with one click.