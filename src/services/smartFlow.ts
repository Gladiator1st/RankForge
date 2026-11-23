import { Account, RiotStatus } from '../types';

export interface CooldownEntry {
  ready: boolean;
  seconds: number;
  countdown: string;
}

export interface SmartFlowRecommendation {
  account: Account | null;
  reason: string;
  tooltip: string;
  badge: 'first_win' | 'close_to_rank' | 'cooldown' | 'all_completed';
}

/**
 * Identify if an account in the active grinding roster is currently connected in Riot Client.
 * Strictly checks non-archived, non-delivered, and non-personal roster accounts.
 * Returns null if the user is on their personal account or if Riot Client is idle.
 */
export function findActiveRosterAccount(
  accounts: Account[],
  riotStatus: RiotStatus | null | undefined
): Account | null {
  if (!riotStatus || !riotStatus.is_connected) return null;

  const loginLower = riotStatus.login_username?.toLowerCase().trim();
  const gameNameLower = riotStatus.game_name?.toLowerCase().trim();
  const fullRiotIdLower = (riotStatus.game_name && riotStatus.tag_line)
    ? `${riotStatus.game_name}#${riotStatus.tag_line}`.toLowerCase().trim()
    : null;
  const puuid = riotStatus.puuid;

  // Active grinding roster accounts: not archived
  const grindingAccounts = accounts.filter((a) => !a.archived);

  const matched = grindingAccounts.find((a) => {
    const uname = (a.username || '').toLowerCase().trim();
    const riotId = (a.stats?.riot_id || '').toLowerCase().trim();

    if (loginLower && uname === loginLower) return true;
    if (gameNameLower && uname === gameNameLower) return true;
    if (fullRiotIdLower && (uname === fullRiotIdLower || riotId === fullRiotIdLower)) return true;
    if (puuid && (a.id === puuid || (a as any).puuid === puuid)) return true;

    // Check if account username in roster is stored as "user#tag"
    if (uname.includes('#')) {
      const unameWithoutTag = uname.split('#')[0].trim();
      if (loginLower && unameWithoutTag === loginLower) return true;
      if (gameNameLower && unameWithoutTag === gameNameLower) return true;
    }

    return false;
  });

  if (!matched) return null;

  // Seamlessly overlay immediate live stats from Riot Client if available
  return {
    ...matched,
    level: riotStatus.current_level ?? matched.level,
    current_xp: riotStatus.current_xp ?? matched.current_xp,
    decimal_level: riotStatus.decimal_level ?? matched.decimal_level,
    remaining_xp: riotStatus.remaining_xp ?? matched.remaining_xp,
    first_win_ready: riotStatus.first_win_ready !== undefined ? riotStatus.first_win_ready : matched.first_win_ready,
  };
}

/**
 * Intelligent Auto-Rotation Engine for Valorant RFR Grinders.
 * Analyzes active accounts and determines the optimal account to grind next based on:
 * 1. Immediate First Win Bonus (+1,000 AP) Availability.
 * 2. Proximity to Level 20 (finishing high level accounts first).
 * 3. Shortest cooldown expiration.
 */
export function getSmartFlowRecommendation(
  accounts: Account[],
  cooldownMap: Map<string, CooldownEntry>,
  options?: { excludeAccountId?: string }
): SmartFlowRecommendation {
  const excludeId = options?.excludeAccountId;

  const active = accounts.filter((a) => {
    if (excludeId && a.id === excludeId) return false;
    if (a.archived) return false;
    if (a.level >= 20 || (a.remaining_xp !== undefined && a.remaining_xp <= 0)) return false;
    if (a.health_status === 'banned') return false;
    return true;
  });

  if (active.length === 0) {
    return {
      account: null,
      reason: 'All active accounts have reached Level 20 or roster is empty!',
      tooltip: 'All active accounts have reached Level 20 or roster is empty',
      badge: 'all_completed',
    };
  }

  // Tier 1: First Win bonus ready right now (+1,000 AP multiplier)
  const firstWinReady = active.filter((a) => {
    const cd = cooldownMap.get(a.id);
    return cd ? cd.ready : a.first_win_ready ?? true;
  });

  if (firstWinReady.length > 0) {
    // Sort closest to Level 20 first
    firstWinReady.sort((a, b) => (b.decimal_level || b.level) - (a.decimal_level || a.level));
    const best = firstWinReady[0];
    const lvlStr = best.decimal_level ? best.decimal_level.toFixed(2) : best.level;
    return {
      account: best,
      reason: `🎯 First Win Ready (+1,000 AP) • Lvl ${lvlStr}`,
      tooltip: `Auto-Rotate: ${best.username} • First Win Ready (+1,000 AP) • Lvl ${lvlStr}`,
      badge: 'first_win',
    };
  }

  // Tier 2: Accounts closest to rank (Level 15+) even if bonus on cooldown
  const nearRank = active.filter((a) => (a.decimal_level || a.level) >= 15);
  if (nearRank.length > 0) {
    nearRank.sort((a, b) => (b.decimal_level || b.level) - (a.decimal_level || a.level));
    const best = nearRank[0];
    const lvlStr = best.decimal_level ? best.decimal_level.toFixed(2) : best.level;
    const cd = cooldownMap.get(best.id);
    return {
      account: best,
      reason: `⚡ Sprint to Rank Ready • Lvl ${lvlStr} (${cd?.countdown || 'In Cooldown'})`,
      tooltip: `Auto-Rotate: ${best.username} • Sprint to Rank (Lvl ${lvlStr} • In Cooldown)`,
      badge: 'close_to_rank',
    };
  }

  // Tier 3: Lowest cooldown seconds left
  const sortedByCooldown = [...active].sort((a, b) => {
    const cdA = cooldownMap.get(a.id)?.seconds ?? a.first_win_seconds ?? 999999;
    const cdB = cooldownMap.get(b.id)?.seconds ?? b.first_win_seconds ?? 999999;
    return cdA - cdB;
  });

  const best = sortedByCooldown[0];
  const cd = cooldownMap.get(best.id);
  const lvlStr = best.decimal_level ? best.decimal_level.toFixed(2) : best.level;

  return {
    account: best,
    reason: `⏳ Shortest Cooldown • Lvl ${lvlStr} (${cd?.countdown || 'Pending'})`,
    tooltip: `Auto-Rotate: ${best.username} • Shortest Cooldown Queue (Lvl ${lvlStr})`,
    badge: 'cooldown',
  };
}
