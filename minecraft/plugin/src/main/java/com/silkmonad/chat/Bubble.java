package com.silkmonad.chat;

import org.bukkit.entity.TextDisplay;

/**
 * One floating dialogue bubble above an agent's head. It's two stacked
 * TextDisplays: {@code back} is the brown frame (scaled up a touch) and
 * {@code front} is the cream panel with the message, nudged toward the camera
 * so it renders over the frame.
 */
public final class Bubble {

    /** Cream panel + the message text — sits in front. */
    public final TextDisplay front;
    /** Dark frame — slightly larger, sits behind, shows as a border ring. */
    public final TextDisplay back;
    public final long bornAtMillis;
    /** Estimated number of rendered lines (including wrap). Used for stacking math. */
    public final int lineCount;
    /** Flipped true the first tick this bubble enters its fade-out window. */
    public boolean fading = false;

    public Bubble(TextDisplay front, TextDisplay back, long bornAtMillis, int lineCount) {
        this.front = front;
        this.back = back;
        this.bornAtMillis = bornAtMillis;
        this.lineCount = lineCount;
    }

    public boolean isDead() {
        return front.isDead() || back.isDead();
    }

    public void remove() {
        if (!front.isDead()) front.remove();
        if (!back.isDead()) back.remove();
    }
}
