package com.silkmonad.chat;

import com.silkmonad.SilkMonadPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Display;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Transformation;
import org.joml.AxisAngle4f;
import org.joml.Vector3f;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

/**
 * Floating dialogue bubbles directly above each agent's head. The newest message
 * sits just above the head; previous messages stack upward as new ones arrive.
 *
 * Each bubble is TWO TextDisplays for a framed look that reads cleanly against
 * the world: a warm-brown {@code back} frame scaled up anisotropically (slim X,
 * larger Y — the bubble is wide, so even thickness needs uneven scale) and
 * shifted down half the extra height so the border rings the panel evenly, and
 * a bone/cream {@code front} panel with dark "ink" text nudged toward the
 * camera so it renders over the frame.
 *
 * Depth/overlap: displays use seeThrough=true so a bubble is never CUT OFF by
 * world geometry (trees, walls, the block the agent stands beside). Without the
 * depth buffer sorting panel-vs-frame, the panel relies on a generous local +Z
 * nudge toward the camera ({@code FRONT_Z}) to render over its frame; stacked
 * bubbles never overlap spatially, so they don't smear against each other.
 *
 * Lifetime: a bubble holds fully visible for {@code hold-ms}, then fades out
 * smoothly over {@code fade-ms} (stepped every tick) before despawning. The
 * three knobs live in config.yml ({@code bubbles.hold-ms/fade-ms/max}).
 */
public final class BubbleManager {

    // ── cadence ──────────────────────────────────────────────────────────────
    /** Run every tick so both follow and fade are smooth (20 Hz). */
    private static final long TICK_INTERVAL = 1L;
    /** Position-interpolation window for each follow teleport (ticks). */
    private static final int TELEPORT_DURATION = 2;

    // ── geometry ─────────────────────────────────────────────────────────────
    /** Y of the NEWEST bubble — above the head AND above the username tag. */
    private static final double HEAD_OFFSET = 2.6;
    /** Approximate vertical space taken by one rendered line of TextDisplay text. */
    private static final double LINE_HEIGHT = 0.30;
    /** Gap between two stacked bubbles. */
    private static final double GAP = 0.12;
    /** Same line width we configure on the TextDisplay (pixels). */
    private static final int LINE_WIDTH_PX = 180;
    /** Approximate Minecraft default-font glyph width in pixels. */
    private static final double AVG_CHAR_PX = 6.0;
    /** Don't re-teleport unless the target moved at least this far (squared blocks). */
    private static final double MOVE_EPSILON_SQ = 1.0e-4;

    // ── layered look (cream panel framed by a warm brown border) ─────────────
    private static final int CREAM_R = 242, CREAM_G = 233, CREAM_B = 208;
    private static final int BROWN_R = 107, BROWN_G = 68, BROWN_B = 35; // border frame (parchment brown)
    private static final TextColor INK = TextColor.color(0x2A2620);      // front text
    private static final TextColor BORDER_INK = TextColor.color(0x6B4423); // back text (hidden on brown)
    private static final float FRONT_SCALE = 1.00f;
    /** The bubble is much WIDER than tall, so a uniform back-scale gives fat side
     *  borders and hairline top/bottom ones. Scale the frame anisotropically:
     *  a small X bump and a bigger Y bump for visually even border thickness. */
    private static final float BACK_SCALE_X = 1.015f;
    private static final float BACK_SCALE_Y = 1.12f;
    /** Approximate world-space height of one rendered TextDisplay line (blocks).
     *  Used to drop the back frame so the border surrounds the panel EVENLY: a
     *  TextDisplay's quad grows UPWARD from its origin, so a scaled-up back layer
     *  alone shows no bottom border at all. */
    private static final float TEXT_BLOCK_HEIGHT = 0.25f;
    /** Local +Z is toward the camera for CENTER billboards; pushes the panel over
     *  the frame so the center never z-fights. Generous because seeThrough skips
     *  the depth buffer — distance-to-camera is all that orders the two layers. */
    private static final float FRONT_Z = 0.05f;

    private final SilkMonadPlugin plugin;
    private final Map<UUID, Deque<Bubble>> bubbles = new HashMap<>();

    // Tunables (config.yml → bubbles.*).
    private final long holdMillis;
    private final long fadeMillis;
    private final int maxBubbles;

    private BukkitTask task;
    private boolean enabled = true;

    public BubbleManager(SilkMonadPlugin plugin) {
        this.plugin = plugin;
        this.holdMillis = Math.max(0L, plugin.getConfig().getLong("bubbles.hold-ms", 4000L));
        this.fadeMillis = Math.max(1L, plugin.getConfig().getLong("bubbles.fade-ms", 600L));
        this.maxBubbles = Math.max(1, plugin.getConfig().getInt("bubbles.max", 4));
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** Toggle bubbles on/off. When disabling, despawns any currently-visible bubbles. */
    public boolean toggle() {
        enabled = !enabled;
        if (!enabled) clearAll();
        return enabled;
    }

    public void start() {
        if (task != null) task.cancel();
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, TICK_INTERVAL, TICK_INTERVAL);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
        clearAll();
    }

    private void clearAll() {
        for (Deque<Bubble> dq : bubbles.values()) {
            for (Bubble b : dq) b.remove();
        }
        bubbles.clear();
    }

    /** Call on the main thread when a player/agent sends a chat message. */
    public void onChat(Player speaker, Component message) {
        if (!enabled) return;
        String plain = PlainTextComponentSerializer.plainText().serialize(message);
        if (plain.isBlank()) return; // nothing to show

        Deque<Bubble> dq = bubbles.computeIfAbsent(speaker.getUniqueId(), k -> new ArrayDeque<>());
        // Trim oldest to make room for the newcomer.
        while (dq.size() >= maxBubbles) {
            Bubble oldest = dq.pollLast();
            if (oldest != null) oldest.remove();
        }

        int lineCount = estimateLineCount(plain);
        Location loc = stackBase(speaker); // tick() repositions every frame

        // The back quad grows upward from the origin, so half its extra height must
        // shift DOWN for the frame to ring the panel evenly (incl. a bottom border).
        float backDrop = -((BACK_SCALE_Y - FRONT_SCALE) * lineCount * TEXT_BLOCK_HEIGHT) / 2f;
        // Back: brown frame, scaled up, its (brown) text hidden — only the border shows.
        TextDisplay back = spawnLayer(loc, message.color(BORDER_INK),
                Color.fromARGB(255, BROWN_R, BROWN_G, BROWN_B), BACK_SCALE_X, BACK_SCALE_Y, backDrop, 0f, (byte) 0);
        // Front: cream panel + dark text, nudged toward the camera to sit over the frame.
        TextDisplay front = spawnLayer(loc, message.colorIfAbsent(INK),
                Color.fromARGB(255, CREAM_R, CREAM_G, CREAM_B), FRONT_SCALE, FRONT_SCALE, 0f, FRONT_Z, (byte) -1);

        dq.push(new Bubble(front, back, System.currentTimeMillis(), lineCount));
    }

    public void onQuit(UUID uuid) {
        Deque<Bubble> dq = bubbles.remove(uuid);
        if (dq != null) for (Bubble b : dq) b.remove();
    }

    private void tick() {
        long now = System.currentTimeMillis();
        long total = holdMillis + fadeMillis;

        Iterator<Map.Entry<UUID, Deque<Bubble>>> mit = bubbles.entrySet().iterator();
        while (mit.hasNext()) {
            Map.Entry<UUID, Deque<Bubble>> entry = mit.next();
            Player p = Bukkit.getPlayer(entry.getKey());
            Deque<Bubble> dq = entry.getValue();

            // Speaker gone (offline/dead) → drop their whole stack.
            if (p == null || !p.isOnline() || p.isDead()) {
                for (Bubble b : dq) b.remove();
                mit.remove();
                continue;
            }

            Location base = stackBase(p);
            World world = base.getWorld();
            double y = base.getY();

            // Iterate newest (head) → oldest (tail), stacking upward.
            Iterator<Bubble> it = dq.iterator();
            while (it.hasNext()) {
                Bubble b = it.next();

                // Externally removed (e.g. /kill) → forget it; those below slide down.
                if (b.isDead()) {
                    b.remove();
                    it.remove();
                    continue;
                }

                long age = now - b.bornAtMillis;
                if (age >= total) { // fully expired
                    b.remove();
                    it.remove();
                    continue;
                }

                // Follow the agent — only teleport when the target actually moved.
                Location target = new Location(world, base.getX(), y, base.getZ());
                Location cur = b.front.getLocation();
                if (!world.equals(cur.getWorld()) || cur.distanceSquared(target) > MOVE_EPSILON_SQ) {
                    b.front.teleport(target);
                    b.back.teleport(target);
                }

                // Fade-out window: step both layers' alpha (and front text) toward 0.
                if (age >= holdMillis) {
                    b.fading = true;
                    double progress = (age - holdMillis) / (double) fadeMillis; // 0..1
                    int alpha = (int) Math.round(255.0 * (1.0 - Math.min(1.0, progress)));
                    if (alpha < 0) alpha = 0;
                    b.front.setBackgroundColor(Color.fromARGB(alpha, CREAM_R, CREAM_G, CREAM_B));
                    b.front.setTextOpacity((byte) alpha);
                    b.back.setBackgroundColor(Color.fromARGB(alpha, BROWN_R, BROWN_G, BROWN_B));
                }

                y += b.lineCount * LINE_HEIGHT + GAP;
            }

            if (dq.isEmpty()) mit.remove();
        }
    }

    /** Spawn one configured TextDisplay layer at {@code loc}. */
    private static TextDisplay spawnLayer(Location loc, Component text, Color background,
                                          float scaleX, float scaleY, float yOffset, float zOffset, byte textOpacity) {
        TextDisplay td = (TextDisplay) loc.getWorld().spawnEntity(loc, EntityType.TEXT_DISPLAY);
        td.setBillboard(Display.Billboard.CENTER);     // always face the viewer
        td.setSeeThrough(true);                        // never cut off by blocks (FRONT_Z orders the layers)
        td.setShadowed(false);                         // crisp dark text on cream
        td.setPersistent(false);                       // never written to the world save
        td.setLineWidth(LINE_WIDTH_PX);
        td.setDefaultBackground(false);                // use our colour, not the dark default
        td.setBackgroundColor(background);
        td.setBrightness(new Display.Brightness(15, 15)); // full-bright: legible at night
        td.setTeleportDuration(TELEPORT_DURATION);
        td.setTransformation(new Transformation(
                new Vector3f(0f, yOffset, zOffset),
                new AxisAngle4f(),
                new Vector3f(scaleX, scaleY, 1f),
                new AxisAngle4f()));
        td.text(text);
        if (textOpacity != (byte) -1) td.setTextOpacity(textOpacity);
        return td;
    }

    /** Base of the column — centred directly above the agent's head. */
    private static Location stackBase(Player p) {
        Location feet = p.getLocation();
        return new Location(feet.getWorld(), feet.getX(), feet.getY() + HEAD_OFFSET, feet.getZ());
    }

    /** Rough rendered-line count for a message: explicit newlines + wrap. */
    private static int estimateLineCount(String plain) {
        int total = 0;
        for (String segment : plain.split("\n", -1)) {
            int chars = Math.max(1, segment.length());
            int wrapped = (int) Math.ceil((chars * AVG_CHAR_PX) / LINE_WIDTH_PX);
            total += Math.max(1, wrapped);
        }
        return Math.max(1, total);
    }
}
