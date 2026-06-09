/**
 * Runtime bridge to the on-chain QuestFactory on Monad — THE integration seam the
 * agent backend touches (imported by agent-backend/src/agent/commands/{actions,queries}.js).
 *
 * Quest master commits keccak256(bytes(answer)) and escrows native MON via createQuest;
 * the first player to claim the correct answer is paid by the contract atomically.
 *
 * For offline/parallel development without a deployed contract, a file-backed mock with
 * identical signatures lives in ./quests.mock.js — swap the imports there if needed.
 */
import { keccak256, toBytes, parseEther, formatEther, decodeEventLog, BaseError, ContractFunctionRevertedError } from 'viem';
import { readFileSync } from 'fs';
import { publicClient } from './config.js';   // shared read client, Monad testnet
import { getAccount } from './wallets.js';     // { account, walletClient } for an agent

// Full ABI for the functions, events, and custom errors. The errors are included so
// viem can decode reverts from simulateContract into readable messages (e.g. WrongAnswer).
export const QUEST_FACTORY_ABI = [
    {
        type: 'function', name: 'createQuest', stateMutability: 'payable',
        inputs: [{ name: 'answerHash', type: 'bytes32' }, { name: 'description', type: 'string' }],
        outputs: [{ name: 'questId', type: 'uint256' }],
    },
    {
        type: 'function', name: 'claim', stateMutability: 'nonpayable',
        inputs: [{ name: 'questId', type: 'uint256' }, { name: 'answer', type: 'string' }],
        outputs: [],
    },
    {
        type: 'function', name: 'cancelQuest', stateMutability: 'nonpayable',
        inputs: [{ name: 'questId', type: 'uint256' }],
        outputs: [],
    },
    {
        type: 'function', name: 'getQuest', stateMutability: 'view',
        inputs: [{ name: 'questId', type: 'uint256' }],
        outputs: [{
            name: '', type: 'tuple', components: [
                { name: 'creator', type: 'address' },
                { name: 'reward', type: 'uint256' },
                { name: 'answerHash', type: 'bytes32' },
                { name: 'winner', type: 'address' },
                { name: 'solved', type: 'bool' },
                { name: 'cancelled', type: 'bool' },
            ],
        }],
    },
    {
        type: 'function', name: 'questCount', stateMutability: 'view',
        inputs: [], outputs: [{ type: 'uint256' }],
    },
    {
        type: 'event', name: 'QuestCreated', inputs: [
            { indexed: true, name: 'questId', type: 'uint256' },
            { indexed: true, name: 'creator', type: 'address' },
            { indexed: false, name: 'reward', type: 'uint256' },
            { indexed: false, name: 'answerHash', type: 'bytes32' },
            { indexed: false, name: 'description', type: 'string' },
        ],
    },
    {
        type: 'event', name: 'QuestSolved', inputs: [
            { indexed: true, name: 'questId', type: 'uint256' },
            { indexed: true, name: 'winner', type: 'address' },
            { indexed: false, name: 'reward', type: 'uint256' },
        ],
    },
    {
        type: 'event', name: 'QuestCancelled', inputs: [
            { indexed: true, name: 'questId', type: 'uint256' },
        ],
    },
    { type: 'error', name: 'NoReward', inputs: [] },
    { type: 'error', name: 'QuestNotFound', inputs: [] },
    { type: 'error', name: 'QuestClosed', inputs: [] },
    { type: 'error', name: 'WrongAnswer', inputs: [] },
    { type: 'error', name: 'NotCreator', inputs: [] },
    { type: 'error', name: 'TransferFailed', inputs: [] },
];

// Factory address: keys.json (cwd-relative, like MONAD_RPC_URL) or env. Written by the
// deploy script. The agent processes run from agent-backend/, so the address must live in
// agent-backend/keys.json as QUEST_FACTORY_ADDRESS (deploy-quests.js does this for you).
function factoryAddress() {
    let fromKeys;
    try { fromKeys = JSON.parse(readFileSync('./keys.json', 'utf8')).QUEST_FACTORY_ADDRESS; } catch { /* no keys.json */ }
    const addr = fromKeys || process.env.QUEST_FACTORY_ADDRESS;
    if (!addr)
        throw new Error('QUEST_FACTORY_ADDRESS not set — deploy the factory (npm run deploy:quests) and add it to keys.json.');
    return addr;
}

// Actionable text per custom error, so an agent reading the reason can self-correct
// (e.g. realize it has a stale quest id) instead of concluding the contract is broken.
const REVERT_HINTS = {
    WrongAnswer: 'WrongAnswer — that is NOT the secret this quest committed to. You may be claiming the wrong quest id: check !latestQuest and submit the exact item id from the quest chest.',
    QuestClosed: 'QuestClosed — this quest is already solved or cancelled. Stop claiming it.',
    QuestNotFound: 'QuestNotFound — no quest with that id exists. Use !latestQuest to find the current one.',
    NoReward: 'NoReward — a quest needs a non-zero MON reward escrowed.',
    NotCreator: 'NotCreator — only the quest creator can cancel it.',
    TransferFailed: 'TransferFailed — the reward payout transfer failed.',
};

// Extract the custom error name from a viem revert; fall back to viem's message.
function revertReason(e) {
    const revert = e instanceof BaseError
        ? e.walk((err) => err instanceof ContractFunctionRevertedError)
        : null;
    const name = revert?.data?.errorName;
    return (name && (REVERT_HINTS[name] || name)) || e.shortMessage || e.message;
}

// Normalize on BOTH create and claim so the item the bot reads from a chest
// ("Golden_Apple") matches what the QM committed. The contract hashes raw bytes;
// because every call here normalizes first, the on-chain compare is exact.
const normalize = (s) => String(s).trim().toLowerCase();
export const answerHash = (secret) => keccak256(toBytes(normalize(secret)));

/**
 * QM creates a quest, escrowing `rewardMon` native MON. Waits for the receipt to read
 * the questId back from the QuestCreated event (the QM needs it to announce).
 * @returns {{ hash, questId, factory, from }}
 */
export async function createQuest(agentName, secret, rewardMon, description = '') {
    const { walletClient, account } = getAccount(agentName);
    const address = factoryAddress();
    const hash = await walletClient.writeContract({
        address, abi: QUEST_FACTORY_ABI, functionName: 'createQuest',
        args: [answerHash(secret), description], value: parseEther(String(rewardMon)),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    let questId;
    for (const lg of receipt.logs) {
        try {
            const d = decodeEventLog({ abi: QUEST_FACTORY_ABI, data: lg.data, topics: lg.topics });
            if (d.eventName === 'QuestCreated') { questId = Number(d.args.questId); break; }
        } catch { /* not our event */ }
    }
    return { hash, questId, factory: address, from: account.address };
}

/**
 * Player submits `answer` for `questId`. Simulates first so a wrong / already-solved
 * answer comes back as a clean reason WITHOUT spending gas; only a viable claim is sent.
 * @returns {{ ok, won, hash?, reason? }}
 */
export async function claim(agentName, questId, answer) {
    const { walletClient, account } = getAccount(agentName);
    const address = factoryAddress();
    const args = [BigInt(questId), normalize(answer)];
    try {
        await publicClient.simulateContract({
            address, abi: QUEST_FACTORY_ABI, functionName: 'claim',
            args, account: account.address,
        });
    } catch (e) {
        // WrongAnswer / QuestClosed / QuestNotFound surface here without a tx.
        return { ok: false, won: false, reason: revertReason(e) };
    }
    const hash = await walletClient.writeContract({
        address, abi: QUEST_FACTORY_ABI, functionName: 'claim', args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success')
        return { ok: false, won: false, hash, reason: 'transaction reverted on-chain — most likely a rival claimed first (QuestClosed).' };
    return { ok: true, won: true, hash };
}

/**
 * Creator reclaims the escrow of an open quest. Simulates first so NotCreator /
 * QuestClosed come back as a clean reason without spending gas.
 * @returns {{ ok, hash?, reason? }}
 */
export async function cancelQuest(agentName, questId) {
    const { walletClient, account } = getAccount(agentName);
    const address = factoryAddress();
    const args = [BigInt(questId)];
    try {
        await publicClient.simulateContract({
            address, abi: QUEST_FACTORY_ABI, functionName: 'cancelQuest',
            args, account: account.address,
        });
    } catch (e) {
        return { ok: false, reason: revertReason(e) };
    }
    const hash = await walletClient.writeContract({
        address, abi: QUEST_FACTORY_ABI, functionName: 'cancelQuest', args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    return { ok: receipt.status === 'success', hash };
}

/**
 * The newest quest on the factory (highest id) — the one players should target.
 * Restarted sessions create fresh quests, so stale remembered ids point at old,
 * unwinnable quests; this is the authoritative "current quest" lookup.
 * @returns {Promise<null | { questId, creator, reward, solved, cancelled, winner, answerHash }>}
 */
export async function latestQuest() {
    const count = await publicClient.readContract({
        address: factoryAddress(), abi: QUEST_FACTORY_ABI, functionName: 'questCount',
    });
    if (count === 0n) return null;
    const questId = Number(count - 1n);
    return { questId, ...(await getQuest(questId)) };
}

/**
 * Read a quest's on-chain state.
 * @returns {{ creator, reward, solved, cancelled, winner, answerHash }} (reward in whole MON)
 */
export async function getQuest(questId) {
    const q = await publicClient.readContract({
        address: factoryAddress(), abi: QUEST_FACTORY_ABI, functionName: 'getQuest', args: [BigInt(questId)],
    });
    return {
        creator: q.creator, reward: formatEther(q.reward), solved: q.solved,
        cancelled: q.cancelled, winner: q.winner, answerHash: q.answerHash,
    };
}
