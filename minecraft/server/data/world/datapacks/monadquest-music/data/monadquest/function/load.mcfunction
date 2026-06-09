# MonadQuest default music — runs once on world load (via #minecraft:load).
# Set up the loop timer and preload it to the interval so the track starts almost
# immediately after the server boots.
scoreboard objectives add mq_music dummy
scoreboard players set #t mq_music 3900
