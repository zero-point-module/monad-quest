/**
 * Low-level Minecraft RCON runner shared by the quest world helpers (chest spawning + the
 * cosmetic effects). The itzg server has RCON enabled but its port isn't published to the
 * host, so we drive it through `docker compose exec ... rcon-cli` — the same path
 * `make mc-cmd` / `make place-chest` use. No op/cheat needed. Requires the Dockerized server
 * up + `docker` on PATH (both true under `make dev`).
 */
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// Repo-root compose file (override with MC_COMPOSE for non-default setups).
const DEFAULT_COMPOSE = fileURLToPath(new URL('../../../../minecraft/server/docker-compose.yml', import.meta.url));

/**
 * Run one server command via RCON and return trimmed stdout. The command is passed as a
 * single rcon-cli argument; any single quotes are shell-escaped, so NBT braces and inner
 * double-quotes inside `command` reach the server intact.
 * @param {string} command  e.g. `summon minecraft:firework_rocket 1 2 3 {LifeTime:0,...}`
 * @returns {Promise<string>}
 */
export function rcon(command) {
    const compose = process.env.MC_COMPOSE || DEFAULT_COMPOSE;
    const safe = String(command).replace(/'/g, `'\\''`); // escape single quotes for the shell
    const cmd = `docker compose -f "${compose}" exec -T minecraft rcon-cli '${safe}'`;
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 20_000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(((stderr || '') + (err.message || '')).trim() || 'rcon failed'));
            else resolve((stdout || '').trim());
        });
    });
}
