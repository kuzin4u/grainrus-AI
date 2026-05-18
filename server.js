// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- НАСТРОЙКИ API (через переменные окружения) ----------
// Используйте PROXY_API_KEY, DEEPSEEK_API_KEY или другую переменную
const API_KEY = process.env.PROXY_API_KEY || process.env.DEEPSEEK_API_KEY;
// Базовый URL API-шлюза (можно переопределить через переменную)
const API_BASE_URL = process.env.API_BASE_URL || 'https://openai.api.proxyapi.ru/v1/chat/completions';
// Имя модели (можно переопределить через переменную)
const MODEL_NAME = process.env.MODEL_NAME || 'deepseek-chat';
// -----------------------------------------------------------------

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

// Проверка наличия API-ключа
if (!API_KEY) {
    console.error('❌ Ошибка: не задан API-ключ. Укажите переменную PROXY_API_KEY или DEEPSEEK_API_KEY в настройках Render.');
    process.exit(1);
}

app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: 'Missing question' });
    }

    console.log(`[Request] Question: ${question.substring(0, 80)}...`);
    console.log(`[Model] Using: ${MODEL_NAME}`);
    console.log(`[API] URL: ${API_BASE_URL}`);

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

        // Пытаемся извлечь JSON
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