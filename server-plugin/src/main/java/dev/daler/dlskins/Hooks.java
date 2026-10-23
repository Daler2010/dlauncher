package dev.daler.dlskins;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.model.user.User;
import net.milkbowl.vault.economy.Economy;
import net.sacredlabyrinth.phaed.simpleclans.Clan;
import net.sacredlabyrinth.phaed.simpleclans.ClanPlayer;
import net.sacredlabyrinth.phaed.simpleclans.SimpleClans;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.RegisteredServiceProvider;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Обращения к LuckPerms, Vault и SimpleClans. Классы этих плагинов загружаются
 * только при вызове методов, поэтому без самих плагинов DLauncherSkins тоже работает.
 */
final class Hooks {
    private Hooks() {}

    static boolean has(String plugin) {
        return Bukkit.getPluginManager().isPluginEnabled(plugin);
    }

    /** Основная группа и префикс из LuckPerms (игрок может быть офлайн) */
    static String[] rank(UUID uuid) {
        if (!has("LuckPerms")) return new String[] {"default", null};
        try {
            LuckPerms lp = Bukkit.getServicesManager().load(LuckPerms.class);
            if (lp == null) return new String[] {"default", null};
            User user = lp.getUserManager().getUser(uuid);
            if (user == null) user = lp.getUserManager().loadUser(uuid).get(3, TimeUnit.SECONDS);
            if (user == null) return new String[] {"default", null};
            return new String[] {user.getPrimaryGroup(), user.getCachedData().getMetaData().getPrefix()};
        } catch (Exception e) {
            return new String[] {"default", null};
        }
    }

    /** Баланс через Vault (у нас — экономика Essentials). Вызывать в главном потоке */
    static Double balance(OfflinePlayer player) {
        if (!has("Vault")) return null;
        RegisteredServiceProvider<Economy> rsp = Bukkit.getServicesManager().getRegistration(Economy.class);
        if (rsp == null) return null;
        try {
            return rsp.getProvider().getBalance(player);
        } catch (Exception e) {
            return null;
        }
    }

    /** Клан из SimpleClans: [тег, название] */
    static String[] clan(UUID uuid) {
        if (!has("SimpleClans")) return null;
        try {
            ClanPlayer cp = SimpleClans.getInstance().getClanManager().getAnyClanPlayer(uuid);
            Clan clan = cp == null ? null : cp.getClan();
            return clan == null ? null : new String[] {clan.getTag(), clan.getName()};
        } catch (Exception e) {
            return null;
        }
    }
}
