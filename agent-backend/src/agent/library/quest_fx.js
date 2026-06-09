/**
 * Cosmetic quest effects, fired through server RCON (no op/cheat) — pure flair, so callers
 * swallow failures rather than letting them break the on-chain quest flow:
 *   - throwXpBottles:    a burst of bottles o' enchanting when a quest is created (on the QM).
 *   - celebrateFireworks: an instant multi-color firework show on the quest winner.
 *
 * Both command shapes are verified against Paper 1.21.6 (the firework component NBT changed
 * in 1.20.5, so the format here is the new `components:{"minecraft:fireworks":{...}}` one).
 */
import { rcon } from './mc_rcon.js';

const floor = (n) => Math.floor(n);

/**
 * Throw `count` bottles o' enchanting at (x,y,z); they arc out and shatter into XP orbs.
 * @returns {Promise<void>}
 */
export async function throwXpBottles(x, y, z, count = 3) {
    const [bx, by, bz] = [floor(x), floor(y), floor(z)];
    for (let i = 0; i < count; i++) {
        // fan the bottles out a little so they don't stack into a single pop
        const mx = ((i - (count - 1) / 2) * 0.16).toFixed(3);
        const mz = ((i % 2 ? 1 : -1) * 0.12).toFixed(3);
        await rcon(`summon minecraft:experience_bottle ${bx} ${by + 1} ${bz} {Motion:[${mx}d,0.34d,${mz}d]}`);
    }
}

/**
 * Throw `count` splash potions of `potion` at (x,y,z); they arc out and shatter, applying the
 * effect to anyone nearby. `potion` is a bare effect id, e.g. "regeneration".
 * (1.21.6: the thrown-potion entity is `minecraft:splash_potion`, carrying a splash_potion
 * item with a `minecraft:potion_contents` component — both verified on the live server.)
 * @returns {Promise<void>}
 */
export async function throwSplashPotions(x, y, z, count = 5, potion = 'regeneration') {
    const id = String(potion).trim().toLowerCase().replace(/^minecraft:/, '');
    if (!/^[a-z0-9_]+$/.test(id))
        throw new Error(`invalid potion id "${potion}" — use a plain id like regeneration`);
    const [bx, by, bz] = [floor(x), floor(y), floor(z)];
    for (let i = 0; i < count; i++) {
        const mx = ((i - (count - 1) / 2) * 0.16).toFixed(3);
        const mz = ((i % 2 ? 1 : -1) * 0.12).toFixed(3);
        await rcon(`summon minecraft:splash_potion ${bx} ${by + 1} ${bz} {Item:{id:"minecraft:splash_potion",count:1,components:{"minecraft:potion_contents":{potion:"minecraft:${id}"}}},Motion:[${mx}d,0.34d,${mz}d]}`);
    }
}

// A few hand-picked explosions for a "cool" multi-burst (colors are decimal RGB ints).
const FIREWORK_EXPLOSIONS = [
    '{shape:"large_ball",colors:[I;16766720,16711680],fade_colors:[I;16777215],has_trail:true,has_twinkle:true}', // gold+red -> white
    '{shape:"star",colors:[I;3060270,5763719],fade_colors:[I;16776960],has_trail:true,has_twinkle:true}',          // blue+green -> yellow
    '{shape:"burst",colors:[I;11013646,16711935],fade_colors:[I;16777215],has_trail:true,has_twinkle:true}',       // purple+magenta -> white
];

/**
 * Detonate a colorful firework show centered on (x,y,z): several rockets that explode
 * immediately (LifeTime:0), each with a different shape/color set.
 * @returns {Promise<void>}
 */
export async function celebrateFireworks(x, y, z) {
    const [bx, by, bz] = [floor(x), floor(y), floor(z)];
    for (const explosion of FIREWORK_EXPLOSIONS) {
        const nbt = `{LifeTime:0,FireworksItem:{id:"minecraft:firework_rocket",count:1,components:{"minecraft:fireworks":{explosions:[${explosion}]}}}}`;
        await rcon(`summon minecraft:firework_rocket ${bx} ${by + 1} ${bz} ${nbt}`);
    }
}
