/**
 * ProviderCard — for iLoveAPI / APIConvert conversion providers.
 *
 * Shows:
 *  - Status pill (Actif / Désactivé)
 *  - Quota progress bar (live or DB)
 *  - Token display (masked with show/hide toggle)
 *  - Edit form (extra fields + quota + notes + enabled)
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Trash2,
  Save,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber, quotaBarColor, clampPercent } from '@/lib/admin/quota';

export type ProviderInfo = {
  id: string;
  provider: string;
  displayName: string | null;
  publicKey: string | null;
  secretKeyRedacted: string;
  hasSecret: boolean;
  enabled: boolean;
  monthlyQuota: number | null;
  apiUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  usage: {
    month: number;
    year: number;
    used: number;
    success: number;
    failed: number;
    totalBytes: number;
    last30Days: number;
    remaining: number | null;
    percentUsed: number | null;
  };
  lastUse: { at: string; success: boolean; fileName: string } | null;
};

export type ProviderField = {
  name: string;
  label: string;
  required: boolean;
  placeholder: string;
  secret?: boolean;
};

export function ProviderCard({
  provider,
  info,
  liveQuota,
  title,
  description,
  docsUrl,
  onChanged,
  refreshing,
  extraFields,
}: {
  provider: string;
  info?: ProviderInfo;
  liveQuota?: { quota?: { total?: number; used?: number; remaining?: number; percent?: number; source?: string; error?: string } } | any;
  title: string;
  description: string;
  docsUrl: string;
  onChanged: () => void;
  refreshing: boolean;
  extraFields: ProviderField[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [monthlyQuota, setMonthlyQuota] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (info) {
      setForm({
        publicKey: info.publicKey || '',
        secretKey: '',
        apiUrl: info.apiUrl || '',
      });
      setEnabled(info.enabled);
      setMonthlyQuota(info.monthlyQuota?.toString() || '');
      setNotes(info.notes || '');
    }
  }, [info]);

  async function save() {
    setSaving(true);
    try {
      const body: any = {
        provider,
        enabled,
        monthlyQuota: monthlyQuota ? parseInt(monthlyQuota, 10) : null,
        notes: notes || null,
      };
      for (const f of extraFields) {
        if (form[f.name] && form[f.name]!.trim()) {
          body[f.name] = form[f.name]!.trim();
        }
      }
      if (!body.secretKey) {
        toast.error('Le token / secret key est requis');
        setSaving(false);
        return;
      }
      const r = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Clé enregistrée');
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer la configuration de ${title} ?`)) return;
    try {
      const r = await fetch(`/api/admin/providers?provider=${provider}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const d = await r.json();
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Supprimé');
      onChanged();
    } catch {
      toast.error('Erreur');
    }
  }

  const configured = !!info;
  const usage = info?.usage;
  const liveQ = liveQuota?.quota;
  const totalQuota = liveQ?.total || info?.monthlyQuota || 0;
  const liveRemaining = liveQ?.remaining;
  const liveUsed = liveQ?.used;
  const percent = liveQ?.percent ?? usage?.percentUsed ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            {title}
            {configured && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {enabled ? 'Actif' : 'Désactivé'}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-slate-700"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Status / Quota display */}
      {configured && (usage || liveQ) && (
        <div className="mb-3 p-3 bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase">
              {liveQ
                ? 'Used credits this month'
                : new Date(usage!.year, usage!.month - 1, 1).toLocaleString('fr-FR', {
                    month: 'long',
                    year: 'numeric',
                  })}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {liveQ
                ? `${formatNumber(liveUsed ?? 0)} / ${formatNumber(totalQuota || 0)} used`
                : `${formatNumber(usage!.used)} / ${formatNumber(info!.monthlyQuota || 0)} used`}
            </span>
          </div>
          {totalQuota > 0 && (
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${quotaBarColor(percent)}`}
                style={{ width: `${clampPercent(percent)}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2 text-xs">
            {liveQ ? (
              <>
                <span className="text-emerald-600 font-bold">
                  ✓ {formatNumber(liveRemaining ?? 0)} restantes
                </span>
                {liveQ.source && <span className="text-slate-400">via {liveQ.source}</span>}
              </>
            ) : (
              <>
                <span className="text-emerald-600 font-bold">
                  ✓ {formatNumber(usage!.success)} OK
                </span>
                {usage!.failed > 0 && (
                  <span className="text-red-600 font-bold">✗ {formatNumber(usage!.failed)}</span>
                )}
                {info!.monthlyQuota && usage!.remaining != null && (
                  <span className="text-slate-500">{formatNumber(usage!.remaining)} restantes</span>
                )}
              </>
            )}
          </div>
          {liveQ?.error && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
              ⚠ {liveQ.error}
            </div>
          )}
        </div>
      )}

      {configured && !editing && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
            <span className="text-slate-500 text-xs">Token / Secret</span>
            <code className="text-xs text-slate-700 font-mono">
              {showSecret ? info?.secretKeyRedacted : '••••••••••••'}
            </code>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="text-slate-400 hover:text-slate-700"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {info?.publicKey && (
            <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
              <span className="text-slate-500 text-xs">Public Key</span>
              <code className="text-xs text-slate-700 font-mono truncate max-w-[200px]">
                {info.publicKey}
              </code>
            </div>
          )}
          {info?.lastUse && (
            <div className="text-xs text-slate-500 p-2">
              Dernier usage: <strong>{new Date(info.lastUse.at).toLocaleString('fr-FR')}</strong>
              {' — '}
              <span className={info.lastUse.success ? 'text-emerald-600' : 'text-red-600'}>
                {info.lastUse.success ? '✓ succès' : '✗ échec'}
              </span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setEditing(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Key className="w-3.5 h-3.5" />
              Modifier
            </button>
            <button
              onClick={remove}
              className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-1.5 text-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          </div>
        </div>
      )}

      {(!configured || editing) && (
        <div className="space-y-3 mt-2">
          {extraFields.map((f) => (
            <div key={f.name}>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={form[f.name] || ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                placeholder={f.placeholder}
                className="input text-sm"
              />
            </div>
          ))}
          <div>
            <label htmlFor="quota" className="block text-xs font-bold text-slate-700 mb-1">
              Quota mensuel (optionnel)
            </label>
            <input id="quota" type="number"
              value={monthlyQuota}
              onChange={(e) => setMonthlyQuota(e.target.value)}
              placeholder="ex: 250 pour iLoveAPI gratuit"
              className="input text-sm"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
            <input id="notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: compte pro Mehdi"
              className="input text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${provider}-enabled`}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor={`${provider}-enabled`} className="text-sm text-slate-700">
              Activé
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Enregistrer
            </button>
            {configured && (
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
