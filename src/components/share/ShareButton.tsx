'use client';
import { useState } from 'react';
import { Share2, Link as LinkIcon, Check, Twitter, Facebook, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ShareButton({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Lien copié ! 📋');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erreur de copie');
    }
  }

  function shareOnTwitter() {
    const tweet = `${title}${description ? ' - ' + description : ''}`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'width=550,height=420',
    );
  }

  function shareOnFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank',
      'width=550,height=420',
    );
  }

  function shareOnWhatsApp() {
    const text = `${title} - ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
      } catch {}
    } else {
      setOpen(true);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition shadow-sm"
      >
        <Share2 className="w-4 h-4" />
        Partager
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            role="presentation"
            className="fixed inset-0 z-[100]"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          />

          {/* Dropdown */}
          <div className="absolute end-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[101] min-w-[240px]">
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-left transition"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <LinkIcon className="w-4 h-4 text-slate-500" />
              )}
              <span className="font-semibold text-sm">{copied ? 'Copié !' : 'Copier le lien'}</span>
            </button>

            <div className="h-px bg-slate-100 my-1" />

            <button
              onClick={shareOnTwitter}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-left transition"
            >
              <Twitter className="w-4 h-4 text-sky-500" />
              <span className="font-semibold text-sm">Partager sur X (Twitter)</span>
            </button>

            <button
              onClick={shareOnFacebook}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-left transition"
            >
              <Facebook className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm">Partager sur Facebook</span>
            </button>

            <button
              onClick={shareOnWhatsApp}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl text-left transition"
            >
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-sm">Partager sur WhatsApp</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
