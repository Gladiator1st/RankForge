import { Account, AppSettings } from '../types';

function buildProgressBar(pct: number, length = 10): string {
  const p = Math.max(0, Math.min(1, pct));
  const filled = Math.round(p * length);
  const empty = length - filled;
  return '`[' + '█'.repeat(filled) + '░'.repeat(empty) + ']`';
}

function cleanWebhookUrl(url: string): string {
  return url.split('?')[0].replace(/\/+$/, '');
}

export class DiscordService {
  public static async sendTestPing(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return { success: false, message: 'Invalid Discord webhook URL' };
    }

    const payload = {
      username: 'RankForge',
      avatar_url: 'https://raw.githubusercontent.com/Gladiator1st/RankForge/main/assets/app_icon.png',
      embeds: [
        {
          title: '🎯 Discord Webhook Connected Successfully',
          description: 'RankForge is now hooked to this channel. You will receive real-time match completions, Level 20 deliverable alerts, and live dashboard sync.',
          color: 0xff4655, // Riot Red
          fields: [
            { name: 'Status', value: '🟢 Operational', inline: true },
            { name: 'Engine Version', value: 'v2.2.6 (Esports Edition)', inline: true },
            { name: 'Timestamp', value: new Date().toUTCString(), inline: false },
          ],
          footer: { text: 'RankForge • Esports Edition' },
        },
      ],
    };

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        return { success: true, message: 'Test ping delivered to Discord!' };
      }
      return { success: false, message: `Discord error: HTTP ${resp.status}` };
    } catch (err: any) {
      return { success: false, message: `Network failure: ${err.message}` };
    }
  }

  public static async sendLevel20Alert(webhookUrl: string, account: Account): Promise<boolean> {
    if (!webhookUrl) return false;

    const payload = {
      username: 'RankForge',
      avatar_url: 'https://raw.githubusercontent.com/Gladiator1st/RankForge/main/assets/app_icon.png',
      embeds: [
        {
          title: '🏆 Ready For Rank Milestone Reached!',
          description: `Account **${account.username}** has officially hit **Level 20**! It is now eligible for Competitive matchmaking and ready for customer handover.`,
          color: 0x00f5d4, // Cyber Mint
          fields: [
            { name: 'Account Username', value: `\`${account.username}\``, inline: true },
            { name: 'Region', value: (account.region || 'EU').toUpperCase(), inline: true },
            { name: 'Verification', value: account.email_verified ? '🔒 Verified' : '🔓 Unverified', inline: true },
            { name: 'Final Status', value: '✅ Level 20.00 Complete', inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'RankForge • Finished Archive' },
        },
      ],
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return true;
    } catch {
      return false;
    }
  }

  public static async sendMatchFinishedAlert(
    webhookUrl: string,
    data: { accountUsername?: string; prevLevel?: number; level: number; xpGained: number; won?: boolean }
  ): Promise<boolean> {
    if (!webhookUrl) return false;

    const isVictory = data.won === true;
    const isDefeat = data.won === false;

    const title = isVictory
      ? '🏆 Match Victory & XP Synced'
      : isDefeat
        ? '💀 Match Defeat & XP Synced'
        : '⚡ Match Completed & XP Synced';

    const embedColor = isVictory ? 0x10b981 : isDefeat ? 0xef4444 : 0x00f5d4;

    const payload = {
      username: 'RankForge',
      avatar_url: 'https://raw.githubusercontent.com/Gladiator1st/RankForge/main/assets/app_icon.png',
      embeds: [
        {
          title,
          description: `Account **${data.accountUsername || 'Active Player'}** finished a match with ${isVictory ? '**Victory** 🏆' : isDefeat ? '**Defeat** 💀' : '**Match Complete**'}!`,
          color: embedColor,
          fields: [
            { name: 'Outcome', value: isVictory ? '✅ Victory' : isDefeat ? '❌ Defeat' : '⚡ Completed', inline: true },
            { name: 'XP Gained', value: `+${data.xpGained.toLocaleString()} XP`, inline: true },
            { name: 'Updated Level', value: `Level **${data.level.toFixed(2)}**`, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'RankForge • Real-Time Engine' },
        },
      ],
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Upgraded Live Dashboard:
   * Edits a SINGLE persistent Discord message (via PATCH /messages/{id}) instead of flooding the channel.
   * If message was deleted or doesn't exist yet, creates it and returns the new message ID.
   */
  public static async updateLiveDashboard(
    webhookUrl: string,
    accounts: Account[],
    settings: AppSettings
  ): Promise<{ success: boolean; message: string; messageId?: string }> {
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return { success: false, message: 'Invalid or missing Discord Webhook URL' };
    }

    const active = accounts.filter((a) => !a.archived);
    const level20Ready = accounts.filter((a) => a.level >= 20);
    const firstWinReady = active.filter((a) => a.first_win_ready);
    const totalRemainingXp = active.reduce(
      (sum, a) => sum + Math.max(0, a.remaining_xp || (20 - a.level) * 5000),
      0
    );
    const avgLevel =
      active.length > 0
        ? (active.reduce((sum, a) => sum + (a.decimal_level || a.level), 0) / active.length).toFixed(1)
        : '0.0';

    // Top active grinding accounts near level 20
    const topNear20 = [...active]
      .filter((a) => a.level < 20)
      .sort((a, b) => (b.decimal_level || b.level) - (a.decimal_level || a.level))
      .slice(0, 5);

    const topList =
      topNear20.length > 0
        ? topNear20
            .map((a, idx) => {
              const lvl = (a.decimal_level || a.level).toFixed(2);
              const bar = buildProgressBar(a.level / 20);
              const fw = a.first_win_ready ? '🎯 READY (+1,000 AP)' : '⏳ Cooldown';
              return `\`${idx + 1}.\` **${a.username}**\n   ${bar} **Lvl ${lvl}** • ${a.remaining_xp?.toLocaleString() || 0} XP left • ${fw}`;
            })
            .join('\n\n')
        : '_No active grinding accounts in progress_';

    const roleTitle = `⚡ **Solo Grinder Operations**`;

    const payload = {
      username: 'Valorant RFR Live Radar',
      avatar_url: 'https://raw.githubusercontent.com/Gladiator1st/RankForge/main/assets/app_icon.png',
      embeds: [
        {
          title: `🎮 Valorant RFR Live Grinding Dashboard`,
          description: `${roleTitle}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**SPRINT TO RANK — TOP ACCOUNTS**\n${topList}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          color: 0x00f5d4, // Cyber Mint
          fields: [
            { name: '🏆 Ready for Rank', value: `**${level20Ready.length}** accounts`, inline: true },
            { name: '🎯 First Win Bonus', value: `**${firstWinReady.length}** / ${active.length} ready`, inline: true },
            { name: '📈 Average Level', value: `Lvl **${avgLevel}**`, inline: true },
            { name: '⚡ XP Remaining', value: `**${totalRemainingXp.toLocaleString()}** XP`, inline: true },
            { name: '🔄 Live Status', value: `🟢 Auto-Synced`, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'RankForge • Live Single-Message Dashboard' },
        },
      ],
    };

    const baseUrl = cleanWebhookUrl(webhookUrl);
    const existingMsgId = (settings.discord_dashboard_message_id || '').trim();

    // 1. Try editing existing message if ID is known
    if (existingMsgId) {
      try {
        const patchResp = await fetch(`${baseUrl}/messages/${existingMsgId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (patchResp.ok) {
          return {
            success: true,
            message: `Updated existing Discord Live Dashboard (Message ID: ${existingMsgId})`,
            messageId: existingMsgId,
          };
        }

        // If 404, message was manually deleted in Discord; fall through to post new message
        console.warn(`[DiscordService] Existing message ${existingMsgId} returned ${patchResp.status}. Creating fresh dashboard...`);
      } catch (err) {
        console.warn('[DiscordService] Failed to patch existing dashboard, creating new:', err);
      }
    }

    // 2. Post fresh message with ?wait=true to capture and store message ID
    try {
      const postResp = await fetch(`${baseUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!postResp.ok) {
        return { success: false, message: `Discord error: HTTP ${postResp.status}` };
      }

      const data = (await postResp.json()) as any;
      const newMsgId = data.id || '';

      return {
        success: true,
        message: `Created new Live Discord Dashboard message!`,
        messageId: newMsgId,
      };
    } catch (err: any) {
      return { success: false, message: `Network failure: ${err.message}` };
    }
  }

  public static async sendRosterDigest(webhookUrl: string, accounts: Account[]): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl) return { success: false, message: 'Discord webhook URL is not configured' };

    const activeAccounts = accounts.filter((a) => !a.archived);
    const readyAccounts = activeAccounts.filter((a) => a.first_win_ready && a.level < 20);
    const finishedAccounts = activeAccounts.filter((a) => a.level >= 20);
    const avgLevel =
      activeAccounts.length > 0
        ? (activeAccounts.reduce((sum, a) => sum + (a.decimal_level || a.level), 0) / activeAccounts.length).toFixed(1)
        : '0.0';

    const topReadyList =
      readyAccounts.length > 0
        ? readyAccounts
            .slice(0, 5)
            .map((a) => `• **${a.username}** (Lvl ${a.decimal_level || a.level}) — 🎯 READY`)
            .join('\n')
        : '_No accounts currently in ready state_';

    const payload = {
      username: 'RankForge',
      avatar_url: 'https://raw.githubusercontent.com/Gladiator1st/RankForge/main/assets/app_icon.png',
      embeds: [
        {
          title: '📋 Roster Radar Grinding Digest',
          description: `Summary of active progression across your **${activeAccounts.length} account** roster:`,
          color: 0xffb800, // Gold
          fields: [
            { name: '🎯 First Win Queue', value: `**${readyAccounts.length}** accounts ready`, inline: true },
            { name: '🏆 Ready For Rank', value: `**${finishedAccounts.length}** completed`, inline: true },
            { name: '📈 Average Level', value: `Lvl **${avgLevel}**`, inline: true },
            { name: '⚡ Priority Accounts Ready for +1,000 AP', value: topReadyList, inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'RankForge • Grinding Operations' },
        },
      ],
    };

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        return { success: true, message: 'Roster Radar digest posted to Discord!' };
      }
      return { success: false, message: `Discord error: HTTP ${resp.status}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
