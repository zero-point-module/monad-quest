package com.silkmonad.chat;

import org.bukkit.entity.TextDisplay;

/** One floating dialogue bubble (a TextDisplay) above an agent's head. */
public final class Bubble {

    public final TextDisplay display;
    public final long bornAtMillis;
    /** Estimated number of rendered lines (including wrap). Used for stacking math. */
    public final int lineCount;
    /** Flipped true the first tick this bubble enters its fade-out window. */
    public boolean fading = false;

    public Bubble(TextDisplay display, long bornAtMillis, int lineCount) {
        this.display = display;
        this.bornAtMillis = bornAtMillis;
        this.lineCount = lineCount;
    }

    public void remove() {
        if (!display.isDead()) display.remove();
    }
}
