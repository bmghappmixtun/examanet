'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations, useLocale } from 'next-intl';

export default function ContactForm() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill subject and message from URL query params (e.g. /contact?subject=security&motif=password)
  useEffect(() => {
    const subjectParam = searchParams.get('subject');
    const motifParam = searchParams.get('motif');
    if (subjectParam || motifParam) {
      setForm((prev) => ({
        ...prev,
        subject: subjectParam || prev.subject,
        message: motifParam
          ? `⚠️ Motif : ${motifParam}\n\nBonjour,\n\nJe souhaite signaler un problème concernant mon compte...\n\n[Décrivez ici les détails de l'incident]`
          : prev.message,
      }));
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t('contact.form.errorRequired'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('contact.form.errorSend'));
        return;
      }

      setSent(true);
      toast.success(t('contact.form.success'));
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast.error(t('contact.form.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {sent && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-emerald-900 mb-1">{t('contact.form.sentTitle')}</div>
            <div className="text-emerald-700">{t('contact.form.sentDesc')}</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('contact.form.name')} *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder={t('contact.form.namePlaceholder')}
            />
          </div>
          <div>
            <label className="label">{t('contact.form.email')} *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
              placeholder={t('contact.form.emailPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="label">{t('contact.form.subject')}</label>
          <select
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="input"
          >
            <option value="">{t('contact.form.chooseSubject')}</option>
            <option value="question">{t('contact.form.subjects.question')}</option>
            <option value="bug">{t('contact.form.subjects.bug')}</option>
            <option value="teacher">{t('contact.form.subjects.teacher')}</option>
            <option value="partnership">{t('contact.form.subjects.partnership')}</option>
            <option value="copyright">{t('contact.form.subjects.copyright')}</option>
            <option value="security">{t('contact.form.subjects.security')}</option>
            <option value="compromised">{t('contact.form.subjects.compromised')}</option>
            <option value="other">{t('contact.form.subjects.other')}</option>
          </select>
        </div>

        <div>
          <label className="label">{t('contact.form.message')} *</label>
          <textarea
            required
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={6}
            className="input resize-none"
            placeholder={t('contact.form.messagePlaceholder')}
          />
          <div className="text-xs text-slate-500 mt-1 text-right">{form.message.length} / 2000</div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>{t('contact.form.rgpd')}:</strong> {t('contact.form.rgpdText')}{' '}
            <a href="/cgu" className="underline font-semibold">
              CGU
            </a>
            .
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full sm:w-auto px-8 py-3 inline-flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('contact.form.sending')}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t('contact.form.send')}
            </>
          )}
        </button>
      </form>
    </>
  );
}
