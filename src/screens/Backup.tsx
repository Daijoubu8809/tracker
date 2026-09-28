import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { useSettings } from '../hooks';
import { BACKUP_REMINDER_DAYS, daysSinceBackup, exportData, importData, summarize } from '../lib/backup';
import { db, saveSettings } from '../lib/db';
import { todayISO } from '../lib/dates';
import { useApp } from '../state';

export async function downloadBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = await exportData();
  const json = JSON.stringify(data);
  const name = `plate-tracker-backup-${todayISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // On phones the share sheet lets you "Save to Files" / Drive / AirDrop.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Plate Tracker backup' });
      await saveSettings({ lastBackupAt: Date.now(), backupSnoozeUntil: null });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await saveSettings({ lastBackupAt: Date.now(), backupSnoozeUntil: null });
  return 'downloaded';
}

export function BackupCard() {
  const s = useSettings();
  const { toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack" aria-labelledby="backup-h">
      <h2 id="backup-h">Backup</h2>
      <p className="small muted">
        Your data lives only on this phone. Export a backup file now and then (save it to Files, iCloud Drive, or Google Drive). Importing
        merges with what’s here — nothing gets duplicated.
      </p>
      <p className="small">
        Last backup: <b>{s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleDateString() : 'never'}</b>
      </p>
      <div className="grid-2">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void downloadBackup()
              .then((r) => r !== 'cancelled' && toast('Backup exported'))
              .finally(() => setBusy(false));
          }}
        >
          Export backup
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Choose backup file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          void f
            .text()
            .then((t) => importData(t))
            .then((r) => setStatus(r.ok ? { ok: true, text: `Imported: ${summarize(r)}` } : { ok: false, text: r.error ?? 'Import failed.' }))
            .catch(() => setStatus({ ok: false, text: 'Couldn’t read that file.' }))
            .finally(() => setBusy(false));
        }}
      />
      {status ? (
        <div className={`banner ${status.ok ? '' : 'danger'}`} role="status">
          {status.text}
        </div>
      ) : null}
    </section>
  );
}

/** Gentle nudge on Today when there's been no backup for 7+ days. */
export function BackupReminder() {
  const s = useSettings();
  const { toast } = useApp();
  const firstDataAt = useLiveQuery(async () => (await db.entries.orderBy('date').first())?.createdAt ?? null, [], null);
  const days = daysSinceBackup(s.lastBackupAt, firstDataAt);
  if (days == null || days < BACKUP_REMINDER_DAYS) return null;
  if (s.backupSnoozeUntil && Date.now() < s.backupSnoozeUntil) return null;
  return (
    <div className="banner stack" role="note">
      <span className="small">
        {s.lastBackupAt ? `It’s been ${days} days since your last backup.` : 'You haven’t backed up yet.'} Your log only lives on this
        phone — a quick export keeps it safe.
      </span>
      <div className="row">
        <button type="button" className="btn small primary" onClick={() => void downloadBackup().then((r) => r !== 'cancelled' && toast('Backup exported'))}>
          Back up now
        </button>
        <button type="button" className="btn small ghost" onClick={() => void saveSettings({ backupSnoozeUntil: Date.now() + 3 * 86_400_000 })}>
          Later
        </button>
      </div>
    </div>
  );
}
