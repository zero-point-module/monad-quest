/**
 * Quest-chest spawner — drops a chest holding the quest's secret item into the world so the
 * in-world chest ALWAYS matches the answer hash the quest master committed on-chain.
 *
 * Mechanism: the Minecraft server runs in offline mode with no opped players, so the bots
 * cannot run /setblock themselves. Instead we reuse the SAME RCON path `make place-chest`
 * uses — `docker compose exec minecraft rcon-cli setblock ...` — which needs no op/cheat.
 * Requires the Dockerized server (ENABLE_RCON) to be up, which it is during a demo. If it
 * isn't reachable, the caller falls back to telling the QM to run `make place-chest`.
 */
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// Repo-root compose file (override with MC_COMPOSE for non-default setups).
const DEFAULT_COMPOSE = fileURLToPath(new URL('../../../../minecraft/server/docker-compose.yml', import.meta.url));

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 20_000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(((stderr || '') + (err.message || '')).trim() || 'command failed'));
            else resolve((stdout || '').trim());
        });
    });
}

/**
 * Spawn a chest at (x,y,z) holding exactly one `itemId`, via server RCON.
 * @param {string} itemId  bare item id, e.g. "golden_apple" (any leading "minecraft:" is stripped)
 * @param {number} x @param {number} y @param {number} z
 * @returns {Promise<{ok:true, item:string, pos:string}>}
 * @throws if the item id is invalid or the RCON call fails (e.g. server down / docker missing).
 */
export async function placeQuestChest(itemId, x, y, z) {
    // Whitelist the id: valid Minecraft item ids are lowercase letters, digits, underscores.
    // This also prevents shell injection since the id is interpolated into the command below.
    const id = String(itemId).trim().toLowerCase().replace(/^minecraft:/, '');
    if (!/^[a-z0-9_]+$/.test(id))
        throw new Error(`invalid item id "${itemId}" — use a plain lowercase id like golden_apple`);

    const [bx, by, bz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const compose = process.env.MC_COMPOSE || DEFAULT_COMPOSE;
    // Single-quote the rcon-cli arg so the NBT braces and inner double-quotes reach the server
    // intact (identical to the `make place-chest` invocation).
    const setblock = `setblock ${bx} ${by} ${bz} minecraft:chest{Items:[{Slot:0b,id:"minecraft:${id}",count:1}]}`;
    const cmd = `docker compose -f "${compose}" exec -T minecraft rcon-cli '${setblock}'`;

    const out = await run(cmd);
    // rcon-cli prints "Changed the block at ..." on success; surface command-parse failures.
    if (/cannot|unknown|expected|incorrect|error/i.test(out))
        throw new Error(out || 'setblock failed');
    return { ok: true, item: id, pos: `${bx} ${by} ${bz}` };
}
