/**
 * Quest-chest spawner — drops a chest holding the quest's secret item into the world so the
 * in-world chest ALWAYS matches the answer hash the quest master committed on-chain.
 *
 * Mechanism: the Minecraft server runs in offline mode with no opped players, so the bots
 * cannot run /setblock themselves. Instead we go through the shared RCON runner (mc_rcon.js,
 * the same `docker compose exec rcon-cli` path `make place-chest` uses) — no op/cheat needed.
 * If the server isn't reachable, the caller falls back to telling the QM to run make place-chest.
 */
import { rcon } from './mc_rcon.js';

/**
 * Spawn a chest at (x,y,z) holding exactly one `itemId`, via server RCON.
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

    const [bx, by, bz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const out = await rcon(`setblock ${bx} ${by} ${bz} minecraft:chest{Items:[{Slot:0b,id:"minecraft:${id}",count:1}]}`);
    // rcon-cli prints "Changed the block at ..." on success; surface command-parse failures.
    if (/cannot|unknown|expected|incorrect|error/i.test(out))
        throw new Error(out || 'setblock failed');
    return { ok: true, item: id, pos: `${bx} ${by} ${bz}` };
}
