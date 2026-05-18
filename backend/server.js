require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- НАСТРОЙКИ API (через переменные окружения) ----------
const API_KEY = process.env.PROXY_API_KEY; // || process.env.DEEPSEEK_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://openai.api.proxyapi.ru/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'openrouter/openrouter/free';
// -----------------------------------------------------------------

// Простой GET-ответ для проверки работы сервера
app.get('/', (req, res) => {
    res.send(`
        <h2>🌾 GreinRus AI Server is running</h2>
        <p>Use POST request to <code>/ask</code> endpoint.</p>
        <p>Example (curl): <code>curl -X POST https://grainrus-ai.onrender.com/ask -H "Content-Type: application/json" -d '{"question": "обнови цену ячменя на 2026 до 23000"}'</code></p>
    `);
});

const SYSTEM_PROMPT = `Ты — помощник, который обновляет финансовую модель солодовенной компании "ГрейнРус". 
Пользователь пришлёт вопрос, содержащий просьбу обновить предустановленные параметры для одного или нескольких годов (2025,2026,2027,2028). 
Ты должен извлечь из вопроса новые числовые значения для параметров: barley (цена ячменя, руб/т), yield (урожайность, ц/га), demand (спрос на пиво, %), basePrice (базовая цена солода, руб/т), load (целевая загрузка, %), waste (потери, %), energy (эффективность сушки, %), contracts (долгосрочные контракты, %), craft (доля крафта, %).

Ответ должен быть ТОЛЬКО JSON-объектом в формате:
{
  "2026": { "barley": 23500, "demand": 92, ... },
  "2027": { "energy": 90, ... }
}
Если значение не указано — не включай его. Если год не указан — не включай. Всегда проверяй разумность диапазонов (barley 10000-26000, yield 20-55, demand 70-130, basePrice 25000-45000, load 45-98, waste 2-12, energy 60-140, contracts 0-90, craft 0-30).
Не добавляй пояснений, только JSON.`;

if (!API_KEY) {
    console.error('❌ Ошибка: не задан API-ключ. Укажите переменную PROXY_API_KEY или DEEPSEEK_API_KEY');
    // не выходим, чтобы сервер всё равно поднялся, но будет возвращать ошибку 500 на /ask
}

app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: 'Missing question' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'API key not configured on server' });
    }

    console.log(`[Request] Question: ${question.substring(0, 80)}...`);
    console.log(`[Model] Using: ${MODEL_NAME}`);

    try {
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: question }
                ],
                temperature: 0.2,
                max_tokens: 1000
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('API error:', data.error);
            return res.status(500).json({ error: data.error.message || 'API error' });
        }

        const answer = data.choices?.[0]?.message?.content;
        if (!answer) {
            return res.status(500).json({ error: 'Empty response from API' });
        }

        let json = null;
        try {
            json = JSON.parse(answer);
        } catch (e) {
            const match = answer.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    json = JSON.parse(match[0]);
                } catch (innerErr) {}
            }
        }

        if (json && typeof json === 'object') {
            console.log('[Success] JSON extracted');
            return res.json({ success: true, updates: json });
        } else {
            console.warn('[Warning] Could not extract JSON, raw:', answer);
            return res.json({
                success: false,
                error: 'Не удалось извлечь JSON из ответа AI',
                raw: answer
            });
        }
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`   API Base URL: ${API_BASE_URL}`);
    console.log(`   Model: ${MODEL_NAME}`);
    console.log(`   API Key present: ${API_KEY ? 'Yes' : 'No'}`);
});
