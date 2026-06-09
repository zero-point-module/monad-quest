package com.silkmonad.chat;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextComponent;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Styles agent chat inline:
 *  - command usage — raw syntax ({@code !claim(4, "x")}, bare {@code !latestQuest})
 *    and mindcraft's shortened form {@code *used claim*}, whose asterisk markers
 *    are STRIPPED for display ("used claim"). ON-CHAIN commands (quest/wallet/token
 *    calls that hit Monad) get bold Monad purple; every other command bold teal;
 *  - markdown bold ({@code **text**}) in bold amber, markers stripped.
 *
 * Runs at HIGH priority and rewrites {@link AsyncChatEvent#message(Component)},
 * so every MONITOR consumer downstream (the delivered chat line, the dialogue
 * bubbles) receives the already-styled component. Plain segments stay uncolored,
 * which lets the bubble panel apply its own ink via colorIfAbsent.
 */
public final class CommandHighlightListener implements Listener {

    /** Monad brand purple — reserved for commands that touch the chain. */
    private static final TextColor ONCHAIN_COLOR = TextColor.color(0x836EF9);
    /** Teal for ordinary in-world commands (move, search, view...). */
    private static final TextColor COMMAND_COLOR = TextColor.color(0x1D9E75);
    /** Warm amber for **markdown bold** — distinct from both command colors. */
    private static final TextColor EMPHASIS_COLOR = TextColor.color(0xCC7A00);

    /** Command names (lowercase, no '!') that read or write Monad. */
    private static final java.util.Set<String> ONCHAIN_COMMANDS = java.util.Set.of(
            "createquest", "claim", "cancelquest", "latestquest", "queststatus",
            "mybalance", "walletaddress", "paytoken", "verifypayment", "tokenbalance");

    /** Alternation, first match wins:
     *  groups 1/2: `**bold text**` (whole / inner)
     *  groups 3/4: `*used commandname*` (whole / name)
     *  group  5:   `!commandName` with optional (...) arg list */
    private static final Pattern PATTERN = Pattern.compile(
            "(\\*\\*([^*]+?)\\*\\*)"
            + "|(\\*used ([A-Za-z_][A-Za-z0-9_]*)\\*)"
            + "|(![A-Za-z_][A-Za-z0-9_]*(?:\\([^)]*\\))?)");

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Component highlighted = highlight(event.message());
        if (highlighted != null) event.message(highlighted);
    }

    /**
     * Rebuild {@code message} with command/emphasis segments styled (markers
     * stripped). Returns null when nothing matches (leave the event untouched)
     * or the message already carries styling we'd clobber (anything beyond a
     * plain single-node text component).
     */
    static Component highlight(Component message) {
        // Only rewrite simple unstyled text — agent chat is always plain. Anything
        // styled/composed (other plugins, system broadcasts) passes through as-is.
        if (!(message instanceof TextComponent tc) || !tc.children().isEmpty()
                || tc.color() != null || tc.decorations().containsValue(TextDecoration.State.TRUE))
            return null;

        String plain = PlainTextComponentSerializer.plainText().serialize(message);
        Matcher m = PATTERN.matcher(plain);
        if (!m.find()) return null;

        TextComponent.Builder out = Component.text();
        int last = 0;
        do {
            if (m.start() > last)
                out.append(Component.text(plain.substring(last, m.start())));
            if (m.group(2) != null)        // **bold** → amber, markers stripped
                out.append(Component.text(m.group(2), EMPHASIS_COLOR, TextDecoration.BOLD));
            else if (m.group(4) != null)   // *used cmd* → markers stripped
                out.append(Component.text("used " + m.group(4), commandColor(m.group(4)), TextDecoration.BOLD));
            else {                         // !cmd(...) → as written
                String name = m.group().substring(1).replaceFirst("\\(.*$", "");
                out.append(Component.text(m.group(), commandColor(name), TextDecoration.BOLD));
            }
            last = m.end();
        } while (m.find());
        if (last < plain.length())
            out.append(Component.text(plain.substring(last)));
        return out.build();
    }

    /** Purple for chain-touching commands, teal for everything else. */
    private static TextColor commandColor(String commandName) {
        return ONCHAIN_COMMANDS.contains(commandName.toLowerCase()) ? ONCHAIN_COLOR : COMMAND_COLOR;
    }
}
