'use client';
import { useState, useRef } from 'react';
import {
  Eye,
  Download,
  Printer,
  Share2,
  Heart,
  Flag,
  Facebook,
  Twitter,
  Linkedin,
  MessageCircle,
  Mail,
  Link as LinkIcon,
  Check,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Props = {
  resourceId: string;
  numericId?: number | null;
  slug: string;
  title: string;
  fileUrl?: string;
  originalFileKey?: string | null;
  originalFileName?: string | null;
  originalFormat?: string | null;
  isTeacher?: boolean;
  isOwner?: boolean;
};

export default function ResourceActions({
  resourceId,
  numericId,
  slug,
  title,
  fileUrl,
  originalFileKey,
  originalFileName,
  originalFormat,
  isTeacher,
  isOwner,
}: Props) {
  const [favorited, setFavorited] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const url = typeof window !== 'undefined' ? window.location.href : '';

  async function handleFavorite() {
    try {
      const res = await fetch(`/api/favorites/${resourceId}`, { method: 'POST' });
      if (res.status === 401) {
        toast.error('Connectez-vous pour ajouter aux favoris');
        return;
      }
      if (res.ok) {
        setFavorited(true);
        toast.success('Ajouté aux favoris ❤️');
      }
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDownload() {
    try {
      const res = await fetch(`/api/resources/${numericId || resourceId}/download`, { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
        toast.success('Téléchargement lancé ⬇️');
      } else {
        toast.error('Erreur lors du téléchargement');
      }
    } catch {
      toast.error('Erreur');
    }
  }

  function handleDownloadOriginal() {
    if (!originalFileKey) return;
    // Server redirects to the original file URL when ?original=1
    window.open(`/api/resources/${resourceId}/download?original=1`, '_blank');
    toast.success(`Téléchargement de l'original (${originalFormat?.toUpperCase()}) ⬇️`);
  }

  /**
   * Print ONLY the PDF (not the whole site).
   * Uses a hidden iframe loaded with the PDF file directly.
   * The browser's native PDF viewer will then be printed.
   */
  async function handlePrint() {
    if (!fileUrl) {
      // Fallback: open viewer in a new tab and let user print from there
      toast.error("Impossible d'accéder au fichier");
      return;
    }
    setPrinting(true);
    try {
      // Build a print-friendly URL: append #toolbar=0&print=1 hint for some browsers
      const printUrl = fileUrl;

      // Create a hidden iframe to load the PDF
      const iframe = document.createElement('iframe');
      iframe.src = printUrl;
      iframe.style.position = 'fixed';
      iframe.style.right = '-9999px';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.title = 'print-frame';
      printFrameRef.current = iframe;
      document.body.appendChild(iframe);

      // Wait for the PDF to load
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        iframe.onload = done;
        // Safety timeout (some browsers don't always fire onload for PDFs)
        setTimeout(done, 2500);
      });

      // Trigger print in the iframe
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        toast.success('Impression du PDF lancée 🖨️');
      } catch (e) {
        // Fallback: open in a new tab so the user can print from the browser
        console.warn('iframe.print() failed, opening in new tab:', e);
        const w = window.open(printUrl, '_blank');
        if (w) {
          toast("Une nouvelle fenêtre s'est ouverte. Utilisez Ctrl+P pour imprimer.", {
            icon: 'ℹ️',
          });
        } else {
          toast.error('Pop-up bloquée. Autorisez les pop-ups et réessayez.');
        }
      }

      // Cleanup iframe after a delay (give browser time to start the print dialog)
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (printFrameRef.current === iframe) printFrameRef.current = null;
        setPrinting(false);
      }, 4000);
    } catch (e) {
      console.error('Print error:', e);
      toast.error("Erreur lors de l'impression");
      setPrinting(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Lien copié !');
    setTimeout(() => setCopied(false), 2000);
  }

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button onClick={handleDownload} className="btn-primary justify-center text-sm">
          <Download className="w-4 h-4" /> Télécharger PDF
        </button>
        {originalFileKey && isTeacher && (
          <button
            onClick={handleDownloadOriginal}
            className="btn-secondary justify-center text-sm border-blue-200 text-blue-700 hover:bg-blue-50"
            title={
              isOwner
                ? `Votre original ${originalFormat?.toUpperCase()}`
                : `Original ${originalFormat?.toUpperCase()} — réservé aux enseignants`
            }
          >
            <Download className="w-4 h-4" />
            {isOwner
              ? `Original (${originalFormat?.toUpperCase()})`
              : `Original ${originalFormat?.toUpperCase()} 👨‍🏫`}
          </button>
        )}
        <button
          onClick={() => (window.location.href = `/ressources/${numericId}/${slug}/viewer`)}
          className="btn-secondary justify-center text-sm"
        >
          <Eye className="w-4 h-4" /> Lire en ligne
        </button>
        <button
          onClick={handlePrint}
          disabled={printing}
          className="btn-secondary justify-center text-sm disabled:opacity-50"
        >
          {printing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Printer className="w-4 h-4" />
          )}
          {printing ? 'Préparation...' : 'Imprimer'}
        </button>
        <button
          onClick={handleFavorite}
          className={`btn-secondary justify-center text-sm ${favorited ? 'text-red-500 border-red-200 bg-red-50' : ''}`}
        >
          <Heart className={`w-4 h-4 ${favorited ? 'fill-red-500' : ''}`} />{' '}
          {favorited ? 'Favori' : 'Favoris'}
        </button>
        <button
          onClick={() => setShareOpen(!shareOpen)}
          className="btn-secondary justify-center text-sm"
        >
          <Share2 className="w-4 h-4" /> Partager
        </button>
        <button
          onClick={() => toast('Merci pour votre signalement')}
          className="btn-secondary justify-center text-sm"
        >
          <Flag className="w-4 h-4" /> Signaler
        </button>
      </div>

      {shareOpen && (
        <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="text-sm font-semibold mb-3">Partager cette ressource</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-blue-50 transition"
            >
              <Facebook className="w-5 h-5 text-blue-600" />
              <span className="text-[10px] font-semibold">Facebook</span>
            </a>
            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-sky-50 transition"
            >
              <Twitter className="w-5 h-5 text-sky-500" />
              <span className="text-[10px] font-semibold">Twitter</span>
            </a>
            <a
              href={shareLinks.whatsapp}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-green-50 transition"
            >
              <MessageCircle className="w-5 h-5 text-green-600" />
              <span className="text-[10px] font-semibold">WhatsApp</span>
            </a>
            <a
              href={shareLinks.linkedin}
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-blue-50 transition"
            >
              <Linkedin className="w-5 h-5 text-blue-700" />
              <span className="text-[10px] font-semibold">LinkedIn</span>
            </a>
            <a
              href={shareLinks.email}
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-amber-50 transition"
            >
              <Mail className="w-5 h-5 text-amber-600" />
              <span className="text-[10px] font-semibold">Email</span>
            </a>
            <button
              onClick={copyLink}
              className="flex flex-col items-center gap-1 p-3 bg-white rounded-lg hover:bg-slate-100 transition"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <LinkIcon className="w-5 h-5 text-slate-600" />
              )}
              <span className="text-[10px] font-semibold">{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
