import Link from 'next/link';
import { Clock, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: { index: false, follow: false },
  title: "En attente d'approbation",
};

export default function EnAttentePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à l'accueil
        </Link>

        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-8 text-center text-white">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-extrabold mb-2">En attente d'approbation</h1>
            <p className="text-amber-50 text-sm">Votre email a été vérifié ✓</p>
          </div>

          <div className="p-8">
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Email vérifié</div>
                  <div className="text-xs text-slate-500">Votre adresse email est confirmée</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Approbation en cours</div>
                  <div className="text-xs text-slate-500">Notre équipe examine votre demande</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Notification par email</div>
                  <div className="text-xs text-slate-500">Vous serez informé dès l'approbation</div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-6">
              <p className="font-semibold mb-1">⏱️ Délai habituel : 24-48h</p>
              <p className="text-xs">
                Notre équipe vérifie chaque demande pour garantir la qualité de la communauté.
              </p>
            </div>

            <Link href="/" className="btn-primary w-full flex items-center justify-center">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
