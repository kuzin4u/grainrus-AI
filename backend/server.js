// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.PROXY_API_KEY || process.env.DEEPSEEK_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://openai.api.proxyapi.ru/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'deepseek/deepseek-chat';
// const MODEL_NAME='openrouter/openrouter/free';
if (!API_KEY) console.error('❌ API-ключ не задан!');

// Системный промпт с инструкциями по прогнозированию
const SYSTEM_PROMPT = `Ты — помощник, который обновляет финансовую модель солодовенной компании "ГрейнРус". 
Пользователь присылает вопрос и историю текущих предустановок для параметров (год → значение). 
Твоя задача – извлечь из вопроса, какой параметр и какой год нужно обновить, и предложить новое значение.

Правила:
1. Если пользователь явно указал новое число – используй его.
2. Если число не указано, но есть год – ты должен рассчитать **прогноз** на основе предоставленной истории (тренд за предыдущие годы). Например, для цены ячменя – вычисли линейный тренд или средний рост и округли до разумного целого.
3. Если данных для тренда недостаточно (менее двух точек), используй простое увеличение на 2-5% от последнего известного значения или оставь без изменений с уведомлением.
4. Всегда проверяй, чтобы новое значение было в допустимых пределах:
   - barley (цена ячменя): 10000 – 26000
   - yield (урожайность): 20 – 55
   - demand (спрос): 70 – 130
   - basePrice (базовая цена солода): 25000 – 45000
   - load (загрузка): 45 – 98
   - waste (потери): 2 – 12
   - energy (сушка): 60 – 140
   - contracts: 0 – 90
   - craft: 0 – 30
   - capex: 0 – 500
   - draffPrice: 0 – 3000
   - draffVolume: 0 – 100
   - dryRootsPrice: 0 – 5000
   - dryRootsVolume: 0 – 20

Ответ должен быть ТОЛЬКО JSON-объектом в формате:
{
  "2026": { "barley": 23500 },
  "2027": { "energy": 90 }
}
Если параметр не указан – не включай его. Если год не указан – не включай.
Не добавляй пояснений, только JSON.`;

app.get('/', (req, res) => {
    res.send('✅ GreinRus AI Server (forecast version) running. Use POST /ask');
});

app.post('/ask', async (req, res) => {
    const { question, history } = req.body; // history – строка с предустановками
    if (!question) return res.status(400).json({ error: 'Missing question' });

    // Если history передана, добавляем её к вопросу для контекста
    let fullQuestion = question;
    if (history) {
        fullQuestion = `${question}\n\nИстория текущих предустановок (год → значения):\n${history}`;
    }

    console.log(`[Request] ${fullQuestion.substring(0, 200)}...`);

    if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

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
                    { role: 'user', content: fullQuestion }
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
        if (!answer) return res.status(500).json({ error: 'Empty response' });

        let json = null;
        try {
            json = JSON.parse(answer);
        } catch(e) {
            const match = answer.match(/\{[\s\S]*\}/);
            if (match) {
                try { json = JSON.parse(match[0]); } catch(inner) {}
            }
        }
        if (json && typeof json === 'object') {
            console.log('[Success]', json);
            return res.json({ success: true, updates: json });
        } else {
            console.warn('[Warning] Could not extract JSON, raw:', answer);
            return res.json({ success: false, error: 'Не удалось извлечь JSON', raw: answer });
        }
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`   Model: ${MODEL_NAME}`);
    console.log(`   API Key present: ${API_KEY ? 'Yes' : 'No'}`);
});
