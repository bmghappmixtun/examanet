'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type Sender = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};
type Msg = { id: string; content: string; senderId: string; createdAt: string; sender: Sender };

export default function ChatWindow({
  conversationId,
  currentUserId,
  initialMessages,
  otherName,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Msg[];
  otherName: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const content = text.trim();
    setText('');
    // Optimistic update
    const optimistic: Msg = {
      id: `temp-${Date.now()}`,
      content,
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      sender: { id: currentUserId, firstName: 'Vous', lastName: '', avatarUrl: null },
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        // Remove optimistic
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        return;
      }
      // Replace optimistic with real message
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? data.message : x)));
    } catch {
      toast.error('Erreur réseau');
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
      style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">Démarrez la conversation avec {otherName} 👋</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${mine ? 'order-2' : ''}`}>
                {!mine && (
                  <div className="text-xs text-slate-500 mb-0.5 ms-1">
                    {m.sender.firstName || 'Utilisateur'}
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2 ${
                    mine
                      ? 'bg-primary-500 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                </div>
                <div
                  className={`text-xs text-slate-400 mt-0.5 ${mine ? 'text-right me-1' : 'ms-1'}`}
                >
                  {new Date(m.createdAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="border-t border-slate-200 p-3 flex gap-2 bg-white">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          placeholder="Écrire un message..."
          className="flex-1 input min-h-[44px] max-h-32 resize-none"
          rows={1}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="px-4 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-300 text-white rounded-xl font-semibold flex items-center gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
