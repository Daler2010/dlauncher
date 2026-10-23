package dev.daler.dlskins;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
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
import java.util.HexFormat;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Сервер скинов для DLauncher. Лаунчер загружает сюда PNG игрока, а CustomSkinLoader
 * у остальных игроков DLauncher берёт скины по протоколу CustomSkinAPI:
 *   GET  /csl/{ник}.json         — профиль {"username", "skins": {"default"|"slim": hash}}
 *   GET  /csl/textures/{hash}    — сама картинка
 *   PUT  /api/skins/{ник}        — загрузка (заголовки X-DL-Token, X-DL-Model)
 *   DELETE /api/skins/{ник}      — снять скин
 * Ник закрепляется за токеном первого, кто загрузил скин; сбросить — /dlskins reset ник.
 */
public final class DLauncherSkins extends JavaPlugin {

    private static final Pattern NICK = Pattern.compile("^[A-Za-z0-9_]{3,16}$");
    private static final Pattern HASH = Pattern.compile("^[0-9a-f]{64}$");
    private static final int MAX_BODY = 64 * 1024;

    private HttpServer http;
    private File texturesDir;
    private File dataFile;
    private YamlConfiguration data;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        texturesDir = new File(getDataFolder(), "textures");
        texturesDir.mkdirs();
        dataFile = new File(getDataFolder(), "players.yml");
        data = YamlConfiguration.loadConfiguration(dataFile);

        String bind = getConfig().getString("bind", "0.0.0.0");
        int port = getConfig().getInt("port", 8765);
        try {
            http = HttpServer.create(new InetSocketAddress(bind, port), 0);
            http.createContext("/csl/", this::handleCsl);
            http.createContext("/api/skins/", this::handleUpload);
            http.createContext("/api/ping", ex -> send(ex, 200, "application/json", "{\"ok\":true}".getBytes(StandardCharsets.UTF_8)));
            http.setExecutor(Executors.newFixedThreadPool(4));
            http.start();
            getLogger().info("Skin server listening on " + bind + ":" + port);
        } catch (IOException e) {
            getLogger().severe("Cannot bind skin server port " + port + ": " + e.getMessage());
        }
    }

    @Override
    public void onDisable() {
        if (http != null) http.stop(0);
    }

    /* ---------- HTTP ---------- */

    private void handleCsl(HttpExchange ex) throws IOException {
        try (ex) {
            if (!"GET".equals(ex.getRequestMethod())) {
                send(ex, 405, "text/plain", new byte[0]);
                return;
            }
            String rest = ex.getRequestURI().getPath().substring("/csl/".length());
            if (rest.startsWith("textures/")) {
                String hash = rest.substring("textures/".length());
                File file = new File(texturesDir, hash + ".png");
                if (!HASH.matcher(hash).matches() || !file.isFile()) {
                    send(ex, 404, "text/plain", new byte[0]);
                    return;
                }
                ex.getResponseHeaders().set("Cache-Control", "public, max-age=31536000, immutable");
                send(ex, 200, "image/png", Files.readAllBytes(file.toPath()));
                return;
            }
            if (!rest.endsWith(".json")) {
                send(ex, 404, "text/plain", new byte[0]);
                return;
            }
            String nick = rest.substring(0, rest.length() - 5);
            ConfigurationSection player = NICK.matcher(nick).matches() ? playerSection(nick) : null;
            if (player == null || player.getString("hash") == null) {
                send(ex, 404, "application/json", "{}".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String model = "slim".equals(player.getString("model")) ? "slim" : "default";
            String json = "{\"username\":\"" + player.getString("name", nick) + "\",\"skins\":{\"" + model + "\":\"" + player.getString("hash") + "\"}}";
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            send(ex, 200, "application/json", json.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void handleUpload(HttpExchange ex) throws IOException {
        try (ex) {
            String nick = ex.getRequestURI().getPath().substring("/api/skins/".length());
            String token = ex.getRequestHeaders().getFirst("X-DL-Token");
            if (!NICK.matcher(nick).matches() || token == null || token.length() < 32) {
                send(ex, 400, "text/plain", "bad request".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String tokenHash = sha256(token.getBytes(StandardCharsets.UTF_8));
            String method = ex.getRequestMethod();

            synchronized (this) {
                ConfigurationSection player = playerSection(nick);
                String owner = player == null ? null : player.getString("token");
                if (owner != null && !owner.equals(tokenHash)) {
                    send(ex, 403, "text/plain", "nick is claimed".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                if ("DELETE".equals(method)) {
                    if (player != null) player.set("hash", null);
                    saveData();
                    send(ex, 200, "text/plain", "ok".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                if (!"PUT".equals(method)) {
                    send(ex, 405, "text/plain", new byte[0]);
                    return;
                }
                byte[] png = readLimited(ex.getRequestBody());
                if (png == null || !validSkin(png)) {
                    send(ex, 400, "text/plain", "skin must be a 64x64 or 64x32 PNG".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                String hash = sha256(png);
                File file = new File(texturesDir, hash + ".png");
                if (!file.isFile()) Files.write(file.toPath(), png);

                String key = nick.toLowerCase(Locale.ROOT);
                String model = "slim".equals(ex.getRequestHeaders().getFirst("X-DL-Model")) ? "slim" : "classic";
                data.set(key + ".name", nick);
                data.set(key + ".token", tokenHash);
                data.set(key + ".hash", hash);
                data.set(key + ".model", model);
                data.set(key + ".updated", System.currentTimeMillis());
                saveData();
                send(ex, 200, "application/json", ("{\"hash\":\"" + hash + "\"}").getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static void send(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        }
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

    /* ---------- Данные ---------- */

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
        sender.sendMessage("§e/dlskins list§7 — кто загрузил скины");
        sender.sendMessage("§e/dlskins reset <ник>§7 — снять скин и освободить ник");
        return true;
    }
}
