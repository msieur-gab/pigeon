// 256 unique nature-themed words for seed phrases
// 16 bytes = 16 words (1 byte maps to 1 word index 0-255)

export const WORDLIST = [
    // 0-31: Sky & Weather
    'dawn', 'dusk', 'mist', 'haze', 'glow', 'beam', 'rays', 'cloud',
    'storm', 'wind', 'gust', 'breeze', 'drift', 'float', 'soar', 'glide',
    'frost', 'snow', 'sleet', 'hail', 'fog', 'dew', 'rime', 'thunder',
    'rainbow', 'drought', 'thaw', 'chill', 'warmth', 'shade', 'gleam', 'flash',
    
    // 32-63: Water
    'river', 'creek', 'brook', 'stream', 'pond', 'lake', 'marsh', 'delta',
    'rain', 'drop', 'wave', 'tide', 'foam', 'pool', 'well', 'falls',
    'ocean', 'shore', 'coast', 'reef', 'cove', 'bay', 'gulf', 'strait',
    'ripple', 'splash', 'surge', 'spray', 'eddy', 'rapid', 'shoal', 'deep',
    
    // 64-95: Earth & Stone
    'stone', 'rock', 'cliff', 'cave', 'ridge', 'peak', 'slope', 'vale',
    'dust', 'sand', 'clay', 'soil', 'loam', 'peat', 'chalk', 'ite',
    'boulder', 'pebble', 'gravel', 'shard', 'flint', 'slate', 'granite', 'basalt',
    'crater', 'gorge', 'ravine', 'canyon', 'mesa', 'butte', 'dune', 'bluff',
    
    // 96-127: Plants & Trees  
    'oak', 'elm', 'pine', 'fir', 'yew', 'birch', 'cedar', 'maple',
    'leaf', 'bark', 'root', 'branch', 'twig', 'bough', 'trunk', 'crown',
    'fern', 'vine', 'reed', 'rush', 'sedge', 'grass', 'moss', 'lichen',
    'rose', 'lily', 'iris', 'daisy', 'aster', 'poppy', 'clover', 'thyme',
    
    // 128-159: Birds
    'wren', 'lark', 'finch', 'robin', 'sparrow', 'thrush', 'dove', 'swift',
    'hawk', 'owl', 'crow', 'raven', 'heron', 'crane', 'egret', 'swan',
    'nest', 'egg', 'chick', 'flock', 'roost', 'perch', 'wing', 'feather',
    'falcon', 'osprey', 'kite', 'tern', 'gull', 'plover', 'stork', 'ibis',
    
    // 160-191: Animals
    'fox', 'hare', 'deer', 'elk', 'wolf', 'bear', 'lynx', 'otter',
    'moth', 'bee', 'ant', 'wasp', 'beetle', 'cricket', 'spider', 'snail',
    'salmon', 'trout', 'pike', 'carp', 'bass', 'cod', 'sole', 'eel',
    'badger', 'weasel', 'mink', 'vole', 'shrew', 'mole', 'stoat', 'ferret',
    
    // 192-223: Places & Time
    'grove', 'glade', 'dell', 'hollow', 'meadow', 'field', 'pasture', 'moor',
    'forest', 'copse', 'thicket', 'hedge', 'garden', 'orchard', 'trail', 'path',
    'summer', 'autumn', 'winter', 'year', 'moon', 'sun', 'star', 'comet',
    'night', 'day', 'noon', 'eve', 'hour', 'moment', 'season', 'cycle',
    
    // 224-255: Qualities & Materials
    'wild', 'calm', 'still', 'quiet', 'soft', 'gentle', 'bright', 'pale',
    'vast', 'wide', 'tall', 'old', 'young', 'true', 'pure', 'clear',
    'bone', 'horn', 'shell', 'amber', 'quartz', 'jade', 'copper', 'silver',
    'honey', 'wax', 'silk', 'wool', 'down', 'fur', 'scale', 'grain'
];

// Verify we have exactly 256 unique words
if (WORDLIST.length !== 256) {
    console.error(`WORDLIST has ${WORDLIST.length} words, expected 256`);
}
const uniqueCheck = new Set(WORDLIST);
if (uniqueCheck.size !== 256) {
    console.error(`WORDLIST has duplicates: ${WORDLIST.length - uniqueCheck.size} duplicates found`);
}

// Encode 16 bytes to 16 words (1 byte = 1 word)
export function bytesToWords(bytes) {
    if (bytes.length !== 16) {
        throw new Error('Expected 16 bytes');
    }
    return Array.from(bytes).map(b => WORDLIST[b]);
}

// Decode 16 words back to 16 bytes
export function wordsToBytes(words) {
    if (words.length !== 16) {
        throw new Error(`Expected 16 words, got ${words.length}`);
    }
    
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        const word = words[i].toLowerCase();
        const idx = WORDLIST.indexOf(word);
        if (idx === -1) {
            throw new Error(`Unknown word: "${words[i]}"`);
        }
        bytes[i] = idx;
    }
    return bytes;
}

// Validate word list
export function validateWords(words) {
    if (words.length !== 16) return false;
    return words.every(w => WORDLIST.includes(w.toLowerCase()));
}
