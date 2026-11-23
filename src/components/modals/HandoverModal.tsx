import React, { useEffect, useState } from 'react';
import { X, Gift, Copy, Check, Archive, Sparkles, Layers } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Account } from '../../types';
import { sound } from '../../services/soundEffects';

interface HandoverModalProps {
  account: Account | null;
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onArchive: (id: string) => void;
}

export const HandoverModal: React.FC<HandoverModalProps> = ({
  account,
  accounts,
  isOpen,
  onClose,
  onArchive,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Sync selected account and fire celebration ONCE when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    if (account) {
      setSelectedId(account.id);
    } else {
      const firstFinished = accounts.find((a) => a.level >= 20);
      if (firstFinished) {
        setSelectedId(firstFinished.id);
      } else if (accounts.length > 0) {
        setSelectedId(accounts[0].id);
      }
    }

    sound.playLevelUpFanfare();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#00F5D4', '#FF4655', '#FFB800'],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const currentAccount = accounts.find((a) => a.id === selectedId) || account || accounts[0];
  if (!currentAccount) return null;

  const isLevel20 = currentAccount.level >= 20;

  const discordSlip = `\`\`\`yaml
=== VALORANT READY FOR RANK (RFR) HANDOVER ===
Account:   ${currentAccount.username}
Password:  ${currentAccount.password || '[NO PASSWORD SAVED]'}
Region:    ${(currentAccount.region || 'EU').toUpperCase()}
Level:     ${currentAccount.decimal_level ? currentAccount.decimal_level.toFixed(2) : currentAccount.level}
Status:    ${isLevel20 ? 'Ready for Rank (Competitive Unlocked)' : 'Grinding in Progress'}
Delivered: ${new Date().toLocaleDateString()}
==============================================
\`\`\``;

  const rawCombo = `${currentAccount.username}:${currentAccount.password || ''}`;
  const tsvLine = `${currentAccount.username}\t${currentAccount.password || ''}\t${(currentAccount.region || 'EU').toUpperCase()}\t${currentAccount.decimal_level || currentAccount.level}\tDelivered`;

  const copyText = (text: string, type: string) => {
    sound.playSuccessDing();
    window.rfrApi?.copyToClipboard(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyAllFinished = () => {
    const finished = accounts.filter((a) => a.level >= 20);
    if (finished.length === 0) return;

    const allSlips = finished
      .map(
        (a) => `\`\`\`yaml
=== VALORANT READY FOR RANK (RFR) HANDOVER ===
Account:   ${a.username}
Password:  ${a.password || '[NO PASSWORD SAVED]'}
Region:    ${(a.region || 'EU').toUpperCase()}
Level:     ${a.decimal_level ? a.decimal_level.toFixed(2) : a.level}
Status:    Ready for Rank (Competitive Unlocked)
Delivered: ${new Date().toLocaleDateString()}
==============================================
\`\`\``
      )
      .join('\n\n');

    copyText(allSlips, 'all_discord');
  };

  const handleArchiveAndClose = () => {
    sound.playTacticalClick();
    onArchive(currentAccount.id);
    onClose();
  };

  const finishedCount = accounts.filter((a) => a.level >= 20).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-val-card border border-val-mint/50 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl shadow-val-mint/10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-val-border bg-gradient-to-r from-val-bg via-val-card to-val-bg shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-val-mint/20 border border-val-mint/40 flex items-center justify-center text-val-mint shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-1.5">
                Delivery Handover Slips
                <Sparkles className="w-3.5 h-3.5 text-val-mint" />
              </h3>
              <span className="text-[11px] text-val-muted">
                1-click buyer & customer handover slips for Discord, Eldorado, and G2G
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-val-muted hover:text-white hover:bg-val-border transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Account Selector Row & Batch Export */}
          <div className="bg-val-bg border border-val-border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="text-xs font-semibold text-val-muted whitespace-nowrap">
                Select Account:
              </span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-val-card border border-val-border focus:border-val-mint rounded-lg text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.username} (Lvl {acc.decimal_level ? acc.decimal_level.toFixed(2) : acc.level}) {acc.level >= 20 ? '🏆 Ready' : ''}
                  </option>
                ))}
              </select>
            </div>

            {finishedCount > 0 && (
              <button
                onClick={handleCopyAllFinished}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-gold/40 text-xs font-bold text-val-gold transition-all shrink-0"
                title="Copy formatted delivery slips for all Level 20 accounts at once"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {copiedType === 'all_discord'
                    ? 'Copied All!'
                    : `Copy All Finished (${finishedCount})`}
                </span>
              </button>
            )}
          </div>

          {/* Primary Discord Markdown Embed Slip */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-val-muted uppercase tracking-wider">
                Discord Markdown Embed Slip
              </span>
              <button
                onClick={() => copyText(discordSlip, 'discord')}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-val-mint/15 hover:bg-val-mint/25 border border-val-mint/40 text-xs text-val-mint font-bold transition-all active:scale-95"
              >
                {copiedType === 'discord' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedType === 'discord' ? 'Copied Slip!' : 'Copy Discord Slip'}</span>
              </button>
            </div>
            <pre className="p-3 bg-val-bg border border-val-border rounded-lg text-xs font-mono text-val-light overflow-x-auto whitespace-pre leading-relaxed select-all">
              {discordSlip}
            </pre>
          </div>

          {/* Quick Line Formats (Combo & TSV) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Raw user:pass combo */}
            <div className="p-3 bg-val-bg border border-val-border rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold text-val-muted block mb-1">
                  Eldorado / G2G Combo (user:pass)
                </span>
                <span className="text-xs font-mono text-white truncate block">
                  {rawCombo}
                </span>
              </div>
              <div className="mt-2.5 flex justify-end">
                <button
                  onClick={() => copyText(rawCombo, 'raw')}
                  className="flex items-center gap-1 text-xs text-val-light hover:text-white bg-val-card px-2.5 py-1 rounded border border-val-border hover:border-val-borderHover transition-all font-medium"
                >
                  {copiedType === 'raw' ? (
                    <Check className="w-3 h-3 text-val-mint" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedType === 'raw' ? 'Copied' : 'Copy Combo'}</span>
                </button>
              </div>
            </div>

            {/* TSV / Spreadsheet Format */}
            <div className="p-3 bg-val-bg border border-val-border rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-semibold text-val-muted block mb-1">
                  Spreadsheet TSV Format
                </span>
                <span className="text-xs font-mono text-white truncate block">
                  {currentAccount.username} • {currentAccount.region?.toUpperCase() || 'EU'}
                </span>
              </div>
              <div className="mt-2.5 flex justify-end">
                <button
                  onClick={() => copyText(tsvLine, 'tsv')}
                  className="flex items-center gap-1 text-xs text-val-light hover:text-white bg-val-card px-2.5 py-1 rounded border border-val-border hover:border-val-borderHover transition-all font-medium"
                >
                  {copiedType === 'tsv' ? (
                    <Check className="w-3 h-3 text-val-mint" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedType === 'tsv' ? 'Copied' : 'Copy TSV'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-val-border flex items-center justify-between">
            <button
              onClick={handleArchiveAndClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-val-card hover:bg-val-cardHover border border-val-border text-xs text-val-muted hover:text-white transition-colors"
              title="Move this account to the Finished Accounts Archive Vault"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Move '{currentAccount.username}' to Archive</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-val-mint hover:bg-teal-300 text-black text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-val-mint/20 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
