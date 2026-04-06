import { readSecret } from '../../src/endpoints/secrets.js';

export const info = {
    id: 'personalyze',
    name: 'PersonaLyze',
    description: 'Proxies HuggingFace image generation for PersonaLyze extension to avoid CORS restrictions',
};

export async function init(router) {
    router.post('/hf-generate', async (req, res) => {
        try {
            const { model, prompt, width, height } = req.body;
            const apiKey = readSecret(req.user.directories, 'api_key_huggingface');

            if (!apiKey) {
                return res.status(401).json({ error: 'HuggingFace API key not configured.' });
            }

            const url = `https://router.huggingface.co/models/${model}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: { width, height },
                    options: { wait_for_model: true },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                return res.status(response.status).send(text);
            }

            const contentType = response.headers.get('Content-Type');
            if (contentType) res.setHeader('Content-Type', contentType);
            response.body.pipe(res);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

export async function exit() {}
