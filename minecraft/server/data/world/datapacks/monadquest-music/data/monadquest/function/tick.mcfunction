# MonadQuest default music — loops the 'otherside' disc for everyone (via #minecraft:tick).
# 3900 ticks = 195s = the length of music_disc.otherside. To use a different default track,
# change BOTH the interval below and the disc id (e.g. cat -> 3700, blocks -> 6900).
scoreboard players add #t mq_music 1
execute if score #t mq_music matches 3900.. as @a at @s run playsound minecraft:music_disc.otherside record @s ~ ~ ~ 1000000 1
execute if score #t mq_music matches 3900.. run scoreboard players set #t mq_music 0
