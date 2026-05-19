// server.js (расширенный, для деплоя на Render)
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- НАСТРОЙКИ API (ProxyAPI / DeepSeek) ----------
const API_KEY = process.env.PROXY_API_KEY || process.env.DEEPSEEK_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://openai.api.proxyapi.ru/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'deepseek-chat';
// const MODEL_NAME='openrouter/openrouter/free';
if (!API_KEY) {
    console.error('❌ Ошибка: не задан API-ключ. Укажите PROXY_API_KEY или DEEPSEEK_API_KEY');
}

const SYSTEM_PROMPT = `Ты — помощник, который обновляет финансовую модель солодовенной компании "ГрейнРус". 
Пользователь может попросить изменить любые из следующих параметров для годов 2025, 2026, 2027, 2028:

Основные (уже были):
- barley (цена ячменя, руб/т)
- yield (урожайность, ц/га)
- demand (спрос на пиво, %)
- basePrice (базовая цена солода, руб/т)
- load (целевая загрузка, %)
- waste (потери, %)
- energy (эффективность сушки, % расхода)
- contracts (долгосрочные контракты, %)
- craft (доля крафтовых клиентов, %)

Новые параметры:
- capex (инвестиционные затраты, млн ₽/год) – целые числа от 0 до 500
- draffPrice (цена солодовой дробины, руб/т) – от 0 до 3000
- draffVolume (объём дробины, тыс. т/год) – от 0 до 100
- dryRootsPrice (цена сухих ростков, руб/т) – от 0 до 5000
- dryRootsVolume (объём сухих ростков, тыс. т/год) – от 0 до 20

Ответ должен быть ТОЛЬКО JSON-объектом в формате:
{
  "2026": { "barley": 23500, "demand": 92, "capex": 50, "draffPrice": 600, ... },
  "2027": { "energy": 90, "dryRootsPrice": 1200 }
}
Если параметр не указан — не включай его. Если год не указан — не включай. Всегда проверяй разумность диапазонов.
Не добавляй пояснений, только JSON.`;

app.get('/', (req, res) => {
    res.send('✅ GreinRus AI Server is running. Use POST /ask');
});

app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Missing question' });

    console.log(`[Request] ${question.substring(0, 100)}...`);

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
        if (!answer) return res.status(500).json({ error: 'Empty response from API' });

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
            console.log('[Success] JSON extracted');
            return res.json({ success: true, updates: json });
        } else {
            console.warn('[Warning] Raw answer:', answer);
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
