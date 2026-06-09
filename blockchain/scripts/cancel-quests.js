/**
 * Reclaim escrow from stale OPEN quests. Every agent restart creates a fresh quest,
 * so old open quests just sit there holding MON forever — this cancels each one
 * (creator-only, per the contract) and returns the reward to the creator's wallet.
 *
 * By default the NEWEST open quest is kept (it may be live in a running demo);
 * pass --all to cancel that one too.
 *
 *   npm run quests:cancel           # cancel all stale open quests
 *   npm run quests:cancel -- --all  # also cancel the newest open quest
 *
 * Signing keys resolve like the agents do: *_PRIVATE_KEY from agent-backend/keys.json
 * (mirrored into env below) or AGENT_<ID>_PK from the root .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadAgents } from './lib/config.js';
import * as quests from '../quests.js';

// Mirror agent-backend/keys.json (the agents' own key store) into env so the
// bridge's keyByAddress() finds the creators' keys; cwd here is blockchain/, so
// the bridge's cwd-relative ./keys.json lookup misses it otherwise.
const AB_KEYS = path.join(ROOT, 'agent-backend', 'keys.json');
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(AB_KEYS, 'utf8')))) {
    if ((k.endsWith('_PRIVATE_KEY') || k === 'QUEST_FACTORY_ADDRESS') && v && !process.env[k])
      process.env[k] = v;
  }
} catch { /* no agent-backend/keys.json — fall back to .env */ }

// Ops wallets from .env (AGENT_<ID>_PK), mirrored the same way test-quest.js does.
const { agents } = loadAgents();
for (const a of agents) {
  const opsKey = process.env[`AGENT_${a.id.toUpperCase()}_PK`];
  if (opsKey) process.env[`${a.id.toUpperCase()}_PRIVATE_KEY`] = opsKey;
}
const idByAddress = Object.fromEntries(
  agents.filter((a) => a.address).map((a) => [a.address.toLowerCase(), a.id]),
);

const keepLatest = !process.argv.includes('--all');

const latest = await quests.latestQuest();
if (!latest) {
  console.log('\n  No quests on the factory — nothing to cancel.\n');
  process.exit(0);
}

let cancelled = 0;
let reclaimed = 0;
for (let id = 0; id <= latest.questId; id++) {
  const q = id === latest.questId ? latest : await quests.getQuest(id);
  if (q.solved || q.cancelled) {
    console.log(`  #${id} ${q.solved ? 'solved' : 'cancelled'} — skip`);
    continue;
  }
  if (keepLatest && id === latest.questId) {
    console.log(`  #${id} OPEN (${q.reward} MON) — newest quest, kept (pass --all to cancel it too)`);
    continue;
  }
  const creatorId = idByAddress[q.creator.toLowerCase()];
  if (!creatorId) {
    console.log(`  #${id} OPEN (${q.reward} MON) — creator ${q.creator} is not one of our agents, skip`);
    continue;
  }
  const res = await quests.cancelQuest(creatorId, id);
  if (res.ok) {
    cancelled++;
    reclaimed += Number(q.reward);
    console.log(`  #${id} OPEN (${q.reward} MON) — cancelled by ${creatorId}, escrow reclaimed (tx ${res.hash})`);
  } else {
    console.log(`  #${id} OPEN (${q.reward} MON) — cancel FAILED: ${res.reason}`);
  }
}

console.log(`\n  Done: ${cancelled} quest(s) cancelled, ~${reclaimed} MON reclaimed.\n`);
