// Fetches an AI-generated weekly "fresh pack" for the logged-in kid.
// The backend caches per (student, game_key, iso_week) so it's cheap.
// Returns null on any failure — callers fall back to expanded default pools.
import { api } from "./api";

const _cache = new Map(); // in-memory dedup within a session

export async function fetchFreshPack(gameKey) {
    if (!gameKey) return null;
    if (_cache.has(gameKey)) return _cache.get(gameKey);
    const p = (async () => {
        try {
            const { data } = await api.get(`/games/fresh-pack/${gameKey}`);
            return data && data.content ? data.content : null;
        } catch {
            return null;
        }
    })();
    _cache.set(gameKey, p);
    return p;
}

export function invalidateFreshPack(gameKey) {
    if (gameKey) _cache.delete(gameKey);
    else _cache.clear();
}
