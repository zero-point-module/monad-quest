const settings = {
    "minecraft_version": "auto", // or specific version like "1.21.6"
    "host": "localhost", // local Docker server (minecraft/server/docker-compose.yml)
    "port": 25565, // set to -1 to automatically scan for open ports
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": true, // opens UI in browser on startup
    
    "base_profile": "assistant", // survival, assistant, creative, or god_mode
    "profiles": [
        // MonadQuest cast — personas + funded wallets defined in ../agents.json
        "./profiles/questmaster.json",
        "./profiles/aria.json",
        "./profiles/kai.json",
        // gpt/claude/andy share wallets with the personas above, so leave them off.
        // "./andy.json",
        // "./profiles/gpt.json",
        // "./profiles/claude.json",
        // "./profiles/gemini.json",
        // "./profiles/llama.json",
        // "./profiles/qwen.json",
        // "./profiles/grok.json",
        // "./profiles/mistral.json",
        // "./profiles/deepseek.json",
        // "./profiles/mercury.json",
        // "./profiles/andy-4.2.json",

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],

    "load_memory": false, // load memory from previous session
    // NOTE: crash/force restarts reload memory regardless of load_memory above
    // (agent_process.js restarts with load_memory=true) — `make reset` wipes
    // bots/*/memory.json so a stale quest id can never leak into a fresh run.
    "init_message": "Introduce yourself in one short line that fits your persona, then get on with your role.", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly

    "speak": false,
    // allows all bots to speak through text-to-speech. 
    // specify speech model inside each profile with format: {provider}/{model}/{voice}.
    // if set to "system" it will use basic system text-to-speech. 
    // Works on windows and mac, but linux requires you to install the espeak package through your package manager eg: `apt install espeak` `pacman -S espeak`.

    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": false, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": false, // allows vision model to interpret screenshots as inputs
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 3, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "show_command_syntax": "shortened", // "full", "shortened", or "none" — shortened keeps chat fun to watch: the spoken line plus "*used command*" instead of raw command syntax
    "narrate_behavior": false, // chat simple automatic actions ('Picking up item!') — off so bots act instead of narrating every step
    "chat_bot_messages": true, // publicly chat messages to other bots

    "blockchain_enabled": true, // enable on-chain token trading commands (!payToken, !verifyPayment, !tokenBalance, !walletAddress) on Monad testnet. auto-generates a wallet per agent on first run.

    "spawn_timeout": 30, // num seconds allowed for the bot to spawn before throwing error. Increase when spawning takes a while.
    "block_place_delay": 0, // delay between placing blocks (ms) if using newAction. helps avoid bot being kicked by anti-cheat mechanisms on servers.
  
    "log_all_prompts": false, // log ALL prompts to file
};

export default settings;
