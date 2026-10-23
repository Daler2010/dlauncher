package dev.daler.dlskins;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.Statistic;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Сервер DLauncher на Paper. Встроенный HTTP отдаёт:
 *   GET  /csl/{ник}.json, /csl/textures/{hash}  — скины и плащи рангов для CustomSkinLoader (CustomSkinAPI)
 *   PUT/DELETE /api/skins/{ник}                — загрузка скина из лаунчера (X-DL-Token, X-DL-Model, X-DL-Cape)
 *   GET  /api/profile/{ник}                    — профиль: ранг, баланс, клан, статистика
 *   GET  /api/server                           — онлайн и топы
 * Ник закрепляется за токеном первого, кто загрузил скин; сбросить — /dlskins reset ник.
 */
public final class DLauncherSkins extends JavaPlugin {

    private static final Pattern NICK = Pattern.compile("^[A-Za-z0-9_]{3,16}$");
    private static final Pattern HASH = Pattern.compile("^[0-9a-f]{64}$");
    private static final int MAX_BODY = 64 * 1024;
    private static final String[] RANK_CAPES = {"vip", "premium", "elite", "legend", "titan", "helper", "moder", "admin"};
    private static final String[] FREE_CAPES = {
        "creeper", "ender", "nether", "sculk", "diamond", "emerald", "redstone", "galaxy", "pumpkin", "cherry",
        "ocean", "lava", "frost", "bee", "dragon", "axolotl", "rainbow", "tnt", "warrior", "love"
    };

    private HttpServer http;
    private File texturesDir;
    private File dataFile;
    private YamlConfiguration data;
    /** группа LuckPerms → хеш текстуры плаща ранга */
    private final Map<String, String> capes = new HashMap<>();
    /** id → хеш плащей, которые может выбрать любой игрок (порядок сохраняем) */
    private final Map<String, String> freeCapes = new java.util.LinkedHashMap<>();
    /** ник → [группа, префикс, время] — чтобы не дёргать LuckPerms на каждый запрос */
    private final Map<String, Object[]> rankCache = new ConcurrentHashMap<>();
    private volatile String serverCache;
    private volatile long serverCacheAt;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        texturesDir = new File(getDataFolder(), "textures");
        texturesDir.mkdirs();
        dataFile = new File(getDataFolder(), "players.yml");
        data = YamlConfiguration.loadConfiguration(dataFile);
        loadCapes();

        String bind = getConfig().getString("bind", "0.0.0.0");
        int port = getConfig().getInt("port", 8765);
        try {
            http = HttpServer.create(new InetSocketAddress(bind, port), 0);
            http.createContext("/csl/", ex -> guard(ex, this::handleCsl));
            http.createContext("/api/skins/", ex -> guard(ex, this::handleUpload));
            http.createContext("/api/profile/", ex -> guard(ex, this::handleProfile));
            http.createContext("/api/server", ex -> guard(ex, this::handleServer));
            http.createContext("/api/capes", ex -> guard(ex, this::handleCapes));
            http.createContext("/api/ping", ex -> guard(ex, e -> send(e, 200, "application/json", "{\"ok\":true}")));
            http.setExecutor(Executors.newFixedThreadPool(6));
            http.start();
            getLogger().info("DLauncher server listening on " + bind + ":" + port + ", rank capes: " + capes.keySet() + ", free capes: " + freeCapes.size());
        } catch (IOException e) {
            getLogger().severe("Cannot bind port " + port + ": " + e.getMessage());
        }
    }

    @Override
    public void onDisable() {
        if (http != null) http.stop(0);
    }

    /* ---------- Плащи ---------- */

    /**
     * Плащи: plugins/DLauncherSkins/capes/rank/{группа}.png — за ранги,
     * capes/free/{id}.png — на выбор любому игроку. Свои картинки можно подложить туда же и сделать /dlskins reload.
     */
    private void loadCapes() {
        capes.clear();
        freeCapes.clear();
        loadCapeDir("rank", RANK_CAPES, capes);
        loadCapeDir("free", FREE_CAPES, freeCapes);
    }

    private void loadCapeDir(String sub, String[] defaults, Map<String, String> into) {
        File dir = new File(getDataFolder(), "capes/" + sub);
        dir.mkdirs();
        for (String id : defaults) {
            if (!new File(dir, id + ".png").exists()) saveResource("capes/" + sub + "/" + id + ".png", false);
        }
        File[] files = dir.listFiles((d, n) -> n.endsWith(".png"));
        if (files == null) return;
        java.util.Arrays.sort(files, Comparator.comparingInt(f -> {
            int i = java.util.Arrays.asList(defaults).indexOf(f.getName().replace(".png", ""));
            return i < 0 ? Integer.MAX_VALUE : i;
        }));
        for (File f : files) {
            try {
                byte[] png = Files.readAllBytes(f.toPath());
                String hash = sha256(png);
                File tex = new File(texturesDir, hash + ".png");
                if (!tex.isFile()) Files.write(tex.toPath(), png);
                into.put(f.getName().substring(0, f.getName().length() - 4).toLowerCase(Locale.ROOT), hash);
            } catch (IOException e) {
                getLogger().warning("Cannot load cape " + f.getName());
            }
        }
    }

    /** Выбор игрока: "rank" (по умолчанию), "off" или id свободного плаща. Старое true/false тоже понимаем */
    private String capeChoice(ConfigurationSection player) {
        if (player == null) return "rank";
        Object v = player.get("cape");
        if (v instanceof Boolean b) return b ? "rank" : "off";
        return v == null ? "rank" : v.toString();
    }

    private String normalizeChoice(String header) {
        if (header == null) return null;
        String c = header.toLowerCase(Locale.ROOT);
        if (c.equals("on")) return "rank";
        if (c.equals("rank") || c.equals("off") || freeCapes.containsKey(c)) return c;
        return null;
    }

    private static UUID offlineUuid(String nick) {
        return UUID.nameUUIDFromBytes(("OfflinePlayer:" + nick).getBytes(StandardCharsets.UTF_8));
    }

    /** [группа, префикс] с кэшем на минуту */
    private String[] rankOf(String nick) {
        String key = nick.toLowerCase(Locale.ROOT);
        Object[] cached = rankCache.get(key);
        if (cached != null && System.currentTimeMillis() - (long) cached[2] < 60_000) return new String[] {(String) cached[0], (String) cached[1]};
        String[] rank = Hooks.rank(offlineUuid(nick));
        rankCache.put(key, new Object[] {rank[0], rank[1], System.currentTimeMillis()});
        return rank;
    }

    private String capeOf(String nick) {
        String choice = capeChoice(playerSection(nick));
        if (choice.equals("off")) return null;
        if (freeCapes.containsKey(choice)) return freeCapes.get(choice);
        return capes.get(rankOf(nick)[0].toLowerCase(Locale.ROOT));
    }

    /* ---------- HTTP: скины ---------- */

    private void handleCsl(HttpExchange ex) throws IOException {
        String rest = ex.getRequestURI().getPath().substring("/csl/".length());
        if (rest.startsWith("textures/")) {
            String hash = rest.substring("textures/".length());
            File file = new File(texturesDir, hash + ".png");
            if (!HASH.matcher(hash).matches() || !file.isFile()) {
                send(ex, 404, "text/plain", "");
                return;
            }
            ex.getResponseHeaders().set("Cache-Control", "public, max-age=31536000, immutable");
            send(ex, 200, "image/png", Files.readAllBytes(file.toPath()));
            return;
        }
        if (!rest.endsWith(".json")) {
            send(ex, 404, "text/plain", "");
            return;
        }
        String nick = rest.substring(0, rest.length() - 5);
        if (!NICK.matcher(nick).matches()) {
            send(ex, 404, "application/json", "{}");
            return;
        }
        ConfigurationSection player = playerSection(nick);
        String skin = player == null ? null : player.getString("hash");
        String cape = capeOf(nick);
        if (skin == null && cape == null) {
            send(ex, 404, "application/json", "{}");
            return;
        }
        StringBuilder json = new StringBuilder("{\"username\":").append(q(player == null ? nick : player.getString("name", nick)));
        if (skin != null) {
            String model = "slim".equals(player.getString("model")) ? "slim" : "default";
            json.append(",\"skins\":{").append(q(model)).append(':').append(q(skin)).append('}');
        }
        if (cape != null) json.append(",\"cape\":").append(q(cape));
        json.append('}');
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        send(ex, 200, "application/json", json.toString());
    }

    private void handleUpload(HttpExchange ex) throws IOException {
        String nick = ex.getRequestURI().getPath().substring("/api/skins/".length());
        String token = ex.getRequestHeaders().getFirst("X-DL-Token");
        if (!NICK.matcher(nick).matches() || token == null || token.length() < 32) {
            send(ex, 400, "text/plain", "bad request");
            return;
        }
        String tokenHash = sha256(token.getBytes(StandardCharsets.UTF_8));
        String method = ex.getRequestMethod();
        String capeHeader = normalizeChoice(ex.getRequestHeaders().getFirst("X-DL-Cape"));

        synchronized (this) {
            ConfigurationSection player = playerSection(nick);
            String owner = player == null ? null : player.getString("token");
            if (owner != null && !owner.equals(tokenHash)) {
                send(ex, 403, "text/plain", "nick is claimed");
                return;
            }
            String key = nick.toLowerCase(Locale.ROOT);
            if ("DELETE".equals(method)) {
                // Скин снимаем, но привязку ника и настройку плаща оставляем
                data.set(key + ".name", nick);
                data.set(key + ".token", tokenHash);
                data.set(key + ".hash", null);
                if (capeHeader != null) data.set(key + ".cape", capeHeader);
                saveData();
                send(ex, 200, "text/plain", "ok");
                return;
            }
            if (!"PUT".equals(method)) {
                send(ex, 405, "text/plain", "");
                return;
            }
            byte[] png = readLimited(ex.getRequestBody());
            if (png == null || !validSkin(png)) {
                send(ex, 400, "text/plain", "skin must be a 64x64 or 64x32 PNG");
                return;
            }
            String hash = sha256(png);
            File file = new File(texturesDir, hash + ".png");
            if (!file.isFile()) Files.write(file.toPath(), png);

            String model = "slim".equals(ex.getRequestHeaders().getFirst("X-DL-Model")) ? "slim" : "classic";
            data.set(key + ".name", nick);
            data.set(key + ".token", tokenHash);
            data.set(key + ".hash", hash);
            data.set(key + ".model", model);
            if (capeHeader != null) data.set(key + ".cape", capeHeader);
            data.set(key + ".updated", System.currentTimeMillis());
            saveData();
            send(ex, 200, "application/json", "{\"hash\":" + q(hash) + "}");
        }
    }

    /* ---------- HTTP: профиль, онлайн, топы ---------- */

    private void handleProfile(HttpExchange ex) throws Exception {
        String nick = ex.getRequestURI().getPath().substring("/api/profile/".length());
        if (!NICK.matcher(nick).matches()) {
            send(ex, 400, "application/json", "{}");
            return;
        }
        UUID uuid = offlineUuid(nick);
        String[] rank = rankOf(nick);
        String[] clan = Hooks.clan(uuid);
        // Статистика и баланс — только из главного потока сервера
        Map<String, Object> stats = Bukkit.getScheduler().callSyncMethod(this, () -> {
            Map<String, Object> m = new HashMap<>();
            OfflinePlayer p = Bukkit.getOfflinePlayer(uuid);
            m.put("known", p.hasPlayedBefore() || p.isOnline());
            m.put("online", p.isOnline());
            m.put("balance", Hooks.balance(p));
            m.put("kills", stat(p, Statistic.PLAYER_KILLS));
            m.put("deaths", stat(p, Statistic.DEATHS));
            m.put("mobKills", stat(p, Statistic.MOB_KILLS));
            m.put("playMinutes", stat(p, Statistic.PLAY_ONE_MINUTE) / 20 / 60);
            m.put("firstPlayed", p.getFirstPlayed());
            m.put("lastSeen", p.isOnline() ? System.currentTimeMillis() : p.getLastSeen());
            return m;
        }).get(5, TimeUnit.SECONDS);

        ConfigurationSection player = playerSection(nick);
        StringBuilder json = new StringBuilder("{");
        json.append("\"name\":").append(q(player == null ? nick : player.getString("name", nick)));
        json.append(",\"group\":").append(q(rank[0]));
        json.append(",\"prefix\":").append(q(rank[1]));
        json.append(",\"cape\":").append(q(capeOf(nick)));
        json.append(",\"capeAvailable\":").append(capes.containsKey(rank[0].toLowerCase(Locale.ROOT)));
        json.append(",\"capeChoice\":").append(q(capeChoice(player)));
        json.append(",\"clan\":").append(clan == null ? "null" : "{\"tag\":" + q(clan[0]) + ",\"name\":" + q(clan[1]) + "}");
        for (Map.Entry<String, Object> e : stats.entrySet()) {
            json.append(',').append(q(e.getKey())).append(':').append(e.getValue() == null ? "null" : e.getValue().toString());
        }
        json.append('}');
        send(ex, 200, "application/json", json.toString());
    }

    /** Каталог плащей для галереи в лаунчере */
    private void handleCapes(HttpExchange ex) throws IOException {
        StringBuilder json = new StringBuilder("{\"rank\":[");
        appendCapes(json, capes);
        json.append("],\"free\":[");
        appendCapes(json, freeCapes);
        json.append("]}");
        send(ex, 200, "application/json", json.toString());
    }

    private static void appendCapes(StringBuilder json, Map<String, String> map) {
        boolean first = true;
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"id\":").append(q(e.getKey())).append(",\"hash\":").append(q(e.getValue())).append('}');
        }
    }

    private void handleServer(HttpExchange ex) throws Exception {
        if (serverCache == null || System.currentTimeMillis() - serverCacheAt > 60_000) {
            serverCache = buildServerInfo();
            serverCacheAt = System.currentTimeMillis();
        }
        send(ex, 200, "application/json", serverCache);
    }

    private record Row(String name, double balance, int kills, int minutes) {}

    private String buildServerInfo() throws Exception {
        record Snapshot(List<String> online, int max, List<Row> rows) {}
        Snapshot snap = Bukkit.getScheduler().callSyncMethod(this, () -> {
            List<String> online = new ArrayList<>();
            for (Player p : Bukkit.getOnlinePlayers()) online.add(p.getName());
            List<Row> rows = new ArrayList<>();
            for (OfflinePlayer p : Bukkit.getOfflinePlayers()) {
                if (p.getName() == null) continue;
                Double bal = Hooks.balance(p);
                rows.add(new Row(p.getName(), bal == null ? 0 : bal, stat(p, Statistic.PLAYER_KILLS), stat(p, Statistic.PLAY_ONE_MINUTE) / 20 / 60));
            }
            return new Snapshot(online, Bukkit.getMaxPlayers(), rows);
        }).get(10, TimeUnit.SECONDS);

        StringBuilder json = new StringBuilder("{\"max\":").append(snap.max()).append(",\"online\":[");
        for (int i = 0; i < snap.online().size(); i++) {
            String name = snap.online().get(i);
            if (i > 0) json.append(',');
            json.append("{\"name\":").append(q(name)).append(",\"group\":").append(q(rankOf(name)[0])).append('}');
        }
        json.append("],\"tops\":{");
        json.append("\"balance\":").append(top(snap.rows(), Comparator.comparingDouble(Row::balance), r -> String.valueOf(Math.round(r.balance()))));
        json.append(",\"kills\":").append(top(snap.rows(), Comparator.comparingInt(Row::kills), r -> String.valueOf(r.kills())));
        json.append(",\"playtime\":").append(top(snap.rows(), Comparator.comparingInt(Row::minutes), r -> String.valueOf(r.minutes())));
        json.append("}}");
        return json.toString();
    }

    private static String top(List<Row> rows, Comparator<Row> by, java.util.function.Function<Row, String> value) {
        List<Row> sorted = new ArrayList<>(rows);
        sorted.sort(by.reversed());
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < Math.min(5, sorted.size()); i++) {
            if (i > 0) json.append(',');
            json.append("{\"name\":").append(q(sorted.get(i).name())).append(",\"value\":").append(value.apply(sorted.get(i))).append('}');
        }
        return json.append(']').toString();
    }

    private static int stat(OfflinePlayer p, Statistic s) {
        try {
            return p.getStatistic(s);
        } catch (Exception e) {
            return 0;
        }
    }

    /* ---------- Утилиты ---------- */

    private interface Handler {
        void handle(HttpExchange ex) throws Exception;
    }

    private void guard(HttpExchange ex, Handler handler) {
        try (ex) {
            handler.handle(ex);
        } catch (Exception e) {
            getLogger().warning("HTTP " + ex.getRequestURI() + ": " + e);
            try {
                send(ex, 500, "text/plain", "error");
            } catch (IOException ignored) {
                // ответ уже начат
            }
        }
    }

    private static void send(HttpExchange ex, int status, String type, String body) throws IOException {
        send(ex, status, type, body.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type + (type.startsWith("image") ? "" : "; charset=utf-8"));
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        }
    }

    /** Строка в JSON (или null) */
    private static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        byte[] body = in.readNBytes(MAX_BODY + 1);
        return body.length > MAX_BODY ? null : body;
    }

    private static boolean validSkin(byte[] png) {
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
            return img != null && img.getWidth() == 64 && (img.getHeight() == 64 || img.getHeight() == 32);
        } catch (IOException e) {
            return false;
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private ConfigurationSection playerSection(String nick) {
        return data.getConfigurationSection(nick.toLowerCase(Locale.ROOT));
    }

    private void saveData() {
        try {
            data.save(dataFile);
        } catch (IOException e) {
            getLogger().warning("Cannot save players.yml: " + e.getMessage());
        }
    }

    /* ---------- Команда ---------- */

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 2 && args[0].equalsIgnoreCase("reset")) {
            synchronized (this) {
                data.set(args[1].toLowerCase(Locale.ROOT), null);
                saveData();
            }
            sender.sendMessage("§aСкин и привязка ника " + args[1] + " сброшены — ник снова свободен.");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("list")) {
            synchronized (this) {
                var keys = data.getKeys(false);
                sender.sendMessage("§eСкинов на сервере: " + keys.size());
                for (String key : keys) {
                    sender.sendMessage("§7- " + data.getString(key + ".name", key) + " (" + data.getString(key + ".model", "classic") + ")");
                }
            }
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("reload")) {
            loadCapes();
            rankCache.clear();
            serverCache = null;
            sender.sendMessage("§aПлащи перезагружены: ранги " + capes.keySet() + ", на выбор " + freeCapes.size());
            return true;
        }
        sender.sendMessage("§e/dlskins list§7 — кто загрузил скины");
        sender.sendMessage("§e/dlskins reset <ник>§7 — снять скин и освободить ник");
        sender.sendMessage("§e/dlskins reload§7 — перечитать плащи из папки capes");
        return true;
    }
}
