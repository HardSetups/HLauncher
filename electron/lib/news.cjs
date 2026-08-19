// Launcher haber beslemesi: depodaki news.json, GitHub raw üzerinden çekilir.
// Sunucu sahibi değil, launcher ekibi içindir; sunucu duyuruları manifestten gelir.
const fs = require('fs');
const path = require('path');
const { httpGetJson } = require('./http.cjs');
const { getRootPath } = require('./paths.cjs');
const log = require('./logger.cjs');

const NEWS_URL = 'https://raw.githubusercontent.com/HardSetups/HLauncher/main/news.json';
const CACHE_MS = 30 * 60 * 1000; // 30 dakika
const MAX_ITEMS = 20;

/** Beslemeyi doğrular ve güvenli/kırpılmış hâlini döndürür; bozuksa null. */
function sanitizeNews(raw) {
    if (!Array.isArray(raw)) return null;
    const items = [];
    for (const item of raw.slice(0, MAX_ITEMS)) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.title !== 'string' || !item.title.trim()) continue;
        const entry = { title: item.title.trim().slice(0, 120) };
        if (typeof item.date === 'string') entry.date = item.date.slice(0, 20);
        if (typeof item.text === 'string') entry.text = item.text.trim().slice(0, 500);
        if (typeof item.url === 'string' && /^https:\/\//.test(item.url)) entry.url = item.url.slice(0, 300);
        items.push(entry);
    }
    return items;
}

async function getNews() {
    const cachePath = path.join(getRootPath(), 'news_cache.json');

    try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (Date.now() - cached.fetchedAt < CACHE_MS && Array.isArray(cached.items)) {
            return cached.items;
        }
    } catch { /* önbellek yoksa/bozuksa ağdan çek */ }

    try {
        const items = sanitizeNews(await httpGetJson(NEWS_URL));
        if (items === null) throw new Error('news.json bir dizi değil');
        fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), items }, null, 2));
        return items;
    } catch (err) {
        log.info(`[NEWS] Haber beslemesi alınamadı: ${err.message}`);
        // Ağ yoksa süresi geçmiş önbellek bile boş listeden iyidir
        try {
            const stale = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Array.isArray(stale.items)) return stale.items;
        } catch { /* hiç önbellek yok */ }
        return [];
    }
}

module.exports = { getNews, sanitizeNews, NEWS_URL };
