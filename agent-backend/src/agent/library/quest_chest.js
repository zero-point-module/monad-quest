/**
 * Quest-chest spawner — drops a chest holding the quest's secret item into the world so the
 * in-world chest ALWAYS matches the answer hash the quest master committed on-chain.
 *
 * Mechanism: the Minecraft server runs in offline mode with no opped players, so the bots
 * cannot run /setblock themselves. Instead we go through the shared RCON runner (mc_rcon.js,
 * the same `docker compose exec rcon-cli` path `make place-chest` uses) — no op/cheat needed.
 * If the server isn't reachable, the caller falls back to telling the QM to run make place-chest.
 *
 * Stale-chest cleanup: `make reset` never touches the world, so every session's chest would
 * pile up — and !searchForBlock returns the NEAREST chest, sending players to an OLD chest
 * whose item no longer matches the current quest (a guaranteed WrongAnswer). To prevent that,
 * every placement is recorded in ./quest-chests.json (cwd-relative, lands in agent-backend/)
 * and previously recorded chests are removed before the new one spawns.
 */
import { readFileSync, writeFileSync } from 'fs';
import { rcon } from './mc_rcon.js';

const CHESTS_PATH = './quest-chests.json';

function readPlaced() {
    try {
        const list = JSON.parse(readFileSync(CHESTS_PATH, 'utf8'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function savePlaced(list) {
    writeFileSync(CHESTS_PATH, JSON.stringify(list, null, 2) + '\n');
}

/** Remove every previously placed quest chest (best-effort; failures don't block). */
async function clearOldChests() {
    for (const c of readPlaced()) {
        try {
            await rcon(`setblock ${c.x} ${c.y} ${c.z} minecraft:air`);
        } catch { /* server hiccup — the new placement matters more */ }
    }
    savePlaced([]);
}

/**
 * Spawn a chest at (x,y,z) holding exactly one `itemId`, via server RCON.
 * Removes the previous session's quest chest(s) first so players can't open a
 * stale chest with an old secret.
 * @param {string} itemId  bare item id, e.g. "golden_apple" (any leading "minecraft:" is stripped)
 * @param {number} x @param {number} y @param {number} z
 * @returns {Promise<{ok:true, item:string, pos:string}>}
 * @throws if the item id is invalid or the RCON call fails (e.g. server down / docker missing).
 */
export async function placeQuestChest(itemId, x, y, z) {
    // Whitelist the id: valid Minecraft item ids are lowercase letters, digits, underscores.
    // Keeps the value clean before it goes into the NBT.
    const id = String(itemId).trim().toLowerCase().replace(/^minecraft:/, '');
    if (!/^[a-z0-9_]+$/.test(id))
        throw new Error(`invalid item id "${itemId}" — use a plain lowercase id like golden_apple`);

    await clearOldChests();

    const [bx, by, bz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const out = await rcon(`setblock ${bx} ${by} ${bz} minecraft:chest{Items:[{Slot:0b,id:"minecraft:${id}",count:1}]}`);
    // rcon-cli prints "Changed the block at ..." on success; surface command-parse failures.
    if (/cannot|unknown|expected|incorrect|error/i.test(out))
        throw new Error(out || 'setblock failed');

    savePlaced([{ x: bx, y: by, z: bz }]);
    return { ok: true, item: id, pos: `${bx} ${by} ${bz}` };
}
