<div align="center">

# 🗡️ MonadQuest

### On-chain quests for autonomous AI agents, played in Minecraft, settled on Monad

[![Built on Monad](https://img.shields.io/badge/Built_on-Monad_Testnet-836EF9?style=for-the-badge)](https://monad.xyz)
[![Agents](https://img.shields.io/badge/Agents-mindcraft--ce-1D9E75?style=for-the-badge)](https://github.com/mindcraft-ce/mindcraft-ce)
[![License](https://img.shields.io/badge/License-MIT-444441?style=for-the-badge)](#-license)

</div>

Somewhere in a quiet Minecraft world, a **Quest Master** buries a secret in a chest and seals a promise on-chain: a real **MON** bounty, escrowed in a **smart contract on Monad**, waiting for whoever finds it first. Two autonomous **adventurer agents** wake up, read the clue, and set off. They roam, they search, they crack the chest open. The moment one of them whispers the right answer to the chain, the contract pays out. Instantly, atomically, irreversibly. No referee, no trust, no take-backs: just a treasure hunt where **the blockchain itself crowns the winner**.

## ✨ What it is

Three things, wired into one loop:

- **A world.** A real Minecraft server.
- **A cast.** Autonomous LLM agents (one quest master, two rival adventurers), each with a persona and a wallet.
- **A contract.** A `QuestFactory` on Monad testnet that escrows the reward and crowns the first correct solver.

## ⚡ Why Monad?

A live race between agents is a brutal little workload: a burst of contract calls that all need to settle _now_, with a single winner decided on-chain.

- **~1s blocks + single-slot finality** mean the race is decided in seconds: the agent submits, the tx finalizes, the reward lands, all inside the demo loop.
- **First-correct-wins is enforced atomically:** the winning `claim` flips the quest to _solved_ and pays out in one transaction; every later claim reverts.
- **Negligible gas + EVM-equivalence** make it rational to put the _whole game_ on-chain with boring, standard tooling: viem, Foundry, native MON.

## 🔁 How a quest works

1. The Quest Master hides a secret item in a chest and calls `createQuest`, escrowing a MON reward and committing to `keccak256(answer)`.
2. It announces the quest id, the reward, and a clue in Minecraft chat.
3. The two adventurers race: explore, open the chest (`!viewChest`), read the secret.
4. First to `!claim(questId, answer)` with the right answer wins: the contract pays the MON reward to their wallet and marks the quest solved.

## 🚀 Quick start (Makefile)

Everything runs through `make`. Run `make` with no arguments anytime to see the full target list.

```bash
make install     # once: install deps for blockchain/ + agent-backend/
make chain       # when contracts change: wallets + faucet + deploy QuestFactory
make mc-up       # once per session: start the local Minecraft server (Docker)
make dev         # the loop: reset quest state + run the agents (repeat this!)
```

That's it: `install` once, `mc-up` once, then `make dev` over and over while you iterate. When you're done, `make mc-down` stops the server (the world is kept).

**Other handy targets:**

| Command | What it does |
| ------- | ------------ |
| `make mc-logs` | Tail the Minecraft server logs |
| `make mc-console` | Open an interactive server console (RCON) |
| `make mc-cmd CMD="time set day"` | Run a single server command |
| `make place-chest SECRET=golden_apple` | Place the quest chest with the secret item |
| `make reset` | Stop agents + wipe quest state (never touches the world) |

> [!IMPORTANT]
> The agents read config relative to their own folder, so your keys **must** live at `agent-backend/keys.json` (copy `agent-backend/keys.example.json` and fill it in). The agents also need **Node 20** (`nvm use` picks it up from `.nvmrc`), and `make dev` checks this for you.

## 🧰 Stack

| Layer     | Tech                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| World     | Minecraft Java server (Paper, offline, peaceful, superflat)                     |
| Agents    | [mindcraft-ce](https://github.com/mindcraft-ce/mindcraft-ce) · Mineflayer · LLM |
| Bridge    | Node + [viem](https://viem.sh)                                                  |
| Contracts | Solidity · Foundry · `QuestFactory` (native-MON escrow)                         |
| Chain     | Monad Testnet                                                                   |

## 📜 License

MIT, see [LICENSE](LICENSE).
