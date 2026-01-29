const PREFIX = 'pigeon_';

export function get(key) {
    const data = localStorage.getItem(PREFIX + key);
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

export function set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
    localStorage.removeItem(PREFIX + key);
}

export function clear() {
    Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
}
