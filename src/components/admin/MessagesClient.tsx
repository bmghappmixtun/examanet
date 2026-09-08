'use client';
import { useState, useMemo } from 'react';
import {
  Mail,
  MailOpen,
  Archive,
  ArchiveRestore,
  Trash2,
  Search,
  Filter,
  X,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Bug,
  HelpCircle,
  GraduationCap,
  Handshake,
  Copyright,
  Inbox,
  Eye,
  Reply,
  ChevronRight,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string; // PENDING | REPLIED | ARCHIVED
  repliedAt: number | null;
  createdAt: number;
};

const SUBJECT_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  question: { label: 'Question', icon: HelpCircle, color: 'text-blue-700', bg: 'bg-blue-100' },
  bug: { label: 'Bug', icon: Bug, color: 'text-red-700', bg: 'bg-red-100' },
  teacher: { label: 'Devenir prof', icon: GraduationCap, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  partnership: { label: 'Partenariat', icon: Handshake, color: 'text-purple-700', bg: 'bg-purple-100' },
  copyright: { label: 'Copyright', icon: Copyright, color: 'text-amber-700', bg: 'bg-amber-100' },
  other: { label: 'Autre', icon: Mail, color: 'text-slate-700', bg: 'bg-slate-100' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  PENDING: { label: 'En attente', color: 'text-amber-700', bg: 'bg-amber-100', icon: Clock },
  REPLIED: { label: 'Répondu', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
  ARCHIVED: { label: 'Archivé', color: 'text-slate-600', bg: 'bg-slate-100', icon: Archive },
};

function timeAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 604_800_000) return `il y a ${Math.floor(diff / 86_400_000)} j`;
  return new Date(ms).toLocaleDateString('fr-FR');
}

export default function MessagesClient({
  initialMessages,
  stats,
}: {
  initialMessages: ContactMessage[];
  stats: { total: number; pending: number; replied: number; archived: number; thisWeek: number };
}) {
  const [messages, setMessages] = useState<ContactMessage[]>(initialMessages);
  const [stats_, setStats] = useState(stats);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'REPLIED' | 'ARCHIVED'>('PENDING');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId),
    [messages, selectedId]
  );

  // Filtered list
  const filtered = useMemo(() => {
    let list = messages;
    if (filter !== 'ALL') list = list.filter((m) => m.status === filter);
    if (subjectFilter !== 'ALL') list = list.filter((m) => (m.subject || 'other') === subjectFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q) ||
          (m.subject || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [messages, filter, subjectFilter, search]);

  // Refresh stats
  async function refreshStats() {
    // Re-fetch from server (handled by next/router refresh in the page)
    window.location.reload();
  }

  async function performAction(id: string, action: 'reply' | 'archive' | 'unarchive' | 'delete') {
    if (action === 'delete' && !confirm('Supprimer définitivement ce message ?')) return;
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/contact-messages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      // Update local state
      if (action === 'delete') {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        if (selectedId === id) setSelectedId(null);
        toast.success('Message supprimé');
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status:
                    action === 'reply'
                      ? 'REPLIED'
                      : action === 'archive'
                      ? 'ARCHIVED'
                      : 'PENDING',
                  repliedAt: action === 'reply' ? Date.now() : m.repliedAt,
                }
              : m
          )
        );
        const labels = {
          reply: 'Marqué comme répondu',
          archive: 'Archivé',
          unarchive: 'Remis en attente',
        };
        toast.success(labels[action]);
      }
      refreshStats();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingId(null);
    }
  }

  function replyByEmail(msg: ContactMessage) {
    const subject = `Re: [Examanet] ${msg.subject || 'Votre message'}`;
    const body = `Bonjour ${msg.name},\n\nMerci pour votre message.\n\n`;
    window.open(`mailto:${msg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">📧 Messages</h1>
          <p className="text-slate-500 mt-1">
            Messages reçus via le formulaire de contact (<code>/contact</code>).
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 font-semibold mb-1">Total</div>
          <div className="text-2xl font-extrabold text-slate-900">{stats_.total}</div>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
          <div className="text-xs text-amber-700 font-semibold mb-1">En attente</div>
          <div className="text-2xl font-extrabold text-amber-700">{stats_.pending}</div>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4">
          <div className="text-xs text-emerald-700 font-semibold mb-1">Répondus</div>
          <div className="text-2xl font-extrabold text-emerald-700">{stats_.replied}</div>
        </div>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-600 font-semibold mb-1">Archivés</div>
          <div className="text-2xl font-extrabold text-slate-600">{stats_.archived}</div>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4">
          <div className="text-xs text-blue-700 font-semibold mb-1">Cette semaine</div>
          <div className="text-2xl font-extrabold text-blue-700">{stats_.thisWeek}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">Statut :</span>
          {[
            { k: 'PENDING', label: 'En attente', count: stats_.pending, color: 'amber' },
            { k: 'REPLIED', label: 'Répondus', count: stats_.replied, color: 'emerald' },
            { k: 'ARCHIVED', label: 'Archivés', count: stats_.archived, color: 'slate' },
            { k: 'ALL', label: 'Tous', count: stats_.total, color: 'blue' },
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k as any)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filter === f.k
                  ? 'bg-blue-600 text-white shadow-md'
                  : `${f.color === 'amber' ? 'bg-amber-50 text-amber-700' : ''}${
                      f.color === 'emerald' ? 'bg-emerald-50 text-emerald-700' : ''
                    }${f.color === 'slate' ? 'bg-slate-100 text-slate-700' : ''}${
                      f.color === 'blue' ? 'bg-blue-50 text-blue-700' : ''
                    } hover:opacity-80`
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">Sujet :</span>
          <button
            onClick={() => setSubjectFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              subjectFilter === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tous
          </button>
          {Object.entries(SUBJECT_META).map(([k, m]) => {
            const count = messages.filter((msg) => (msg.subject || 'other') === k).length;
            return (
              <button
                key={k}
                onClick={() => setSubjectFilter(k)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
                  subjectFilter === k ? 'bg-blue-600 text-white' : `${m.bg} ${m.color} hover:opacity-80`
                }`}
              >
                <m.icon className="w-3 h-3" />
                {m.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, message..."
            className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Two-pane list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">
                {filter === 'PENDING' ? 'Aucun message en attente 🎉' : 'Aucun message'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
              {filtered.map((msg) => {
                const subjMeta = SUBJECT_META[msg.subject || 'other'] || SUBJECT_META.other;
                const statMeta = STATUS_META[msg.status] || STATUS_META.PENDING;
                const isSelected = selectedId === msg.id;
                return (
                  <li key={msg.id}>
                    <button
                      onClick={() => setSelectedId(msg.id)}
                      className={`w-full text-left p-3 hover:bg-slate-50 transition ${
                        isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${subjMeta.bg} ${subjMeta.color}`}
                            >
                              <subjMeta.icon className="w-3 h-3" />
                              {subjMeta.label}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${statMeta.bg} ${statMeta.color}`}
                            >
                              <statMeta.icon className="w-3 h-3" />
                              {statMeta.label}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {msg.name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{msg.email}</div>
                          <div className="text-xs text-slate-700 mt-1 line-clamp-2">
                            {msg.message}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 whitespace-nowrap mt-1">
                          {timeAgo(msg.createdAt)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {(() => {
                      const sm = SUBJECT_META[selected.subject || 'other'] || SUBJECT_META.other;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${sm.bg} ${sm.color}`}
                        >
                          <sm.icon className="w-3.5 h-3.5" />
                          {sm.label}
                        </span>
                      );
                    })()}
                    {(() => {
                      const stm = STATUS_META[selected.status] || STATUS_META.PENDING;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${stm.bg} ${stm.color}`}
                        >
                          <stm.icon className="w-3.5 h-3.5" />
                          {stm.label}
                        </span>
                      );
                    })()}
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-900">{selected.name}</h2>
                  <a
                    href={`mailto:${selected.email}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {selected.email}
                  </a>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                  title="Fermer"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="text-xs text-slate-500 mb-3 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Reçu {timeAgo(selected.createdAt)}
                </span>
                {selected.repliedAt && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Répondu {timeAgo(selected.repliedAt)}
                  </span>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-slate-700 whitespace-pre-wrap border border-slate-200">
                {selected.message}
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.status !== 'REPLIED' && (
                  <button
                    onClick={() => replyByEmail(selected)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                  >
                    <Reply className="w-4 h-4" />
                    Répondre par email
                  </button>
                )}
                {selected.status !== 'REPLIED' && (
                  <button
                    onClick={() => performAction(selected.id, 'reply')}
                    disabled={loadingId === selected.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {loadingId === selected.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Marquer comme répondu
                  </button>
                )}
                {selected.status !== 'ARCHIVED' ? (
                  <button
                    onClick={() => performAction(selected.id, 'archive')}
                    disabled={loadingId === selected.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Archive className="w-4 h-4" />
                    Archiver
                  </button>
                ) : (
                  <button
                    onClick={() => performAction(selected.id, 'unarchive')}
                    disabled={loadingId === selected.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                    Désarchiver
                  </button>
                )}
                <button
                  onClick={() => performAction(selected.id, 'delete')}
                  disabled={loadingId === selected.id}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <MailOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">Sélectionnez un message pour le lire</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
