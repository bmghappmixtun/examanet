'use client';

import { useEffect, useState } from 'react';
import { JOURNEY_LABELS, type JourneyEventType } from '@/lib/teacher-journey';

interface JourneyEvent {
  id: string;
  eventType: JourneyEventType;
  page: string | null;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number;
}

interface TeacherInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  status: string;
  currentJourneyStep: string | null;
  lastJourneyAt: number | null;
  isVerifiedTeacher: number;
  createdAt: number;
  lastLoginAt: number | null;
}

interface FlowStep {
  type: JourneyEventType;
  label: string;
  icon: string;
  color: string;
  completed: boolean;
}

interface JourneyData {
  teacher: TeacherInfo;
  events: JourneyEvent[];
  nextRequiredStep: JourneyEventType | null;
  flow: FlowStep[];
}

const COLOR_BG: Record<string, string> = {
  sky: 'bg-sky-100 text-sky-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-700',
};

const COLOR_DOT: Record<string, string> = {
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  slate: 'bg-slate-400',
};

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo} mois`;
}

export default function TeacherJourneyTimeline({ teacherId }: { teacherId: string }) {
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/teacher-journey/${teacherId}`)
      .then((r) => r.json().then((j) => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (status === 200) setData(body);
        else setError(body.error || 'Erreur');
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [teacherId]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin"></div>
          Chargement du parcours...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
        {error || 'Données indisponibles'}
      </div>
    );
  }

  const { teacher, events, nextRequiredStep, flow } = data;

  // Find the "stuck at" step
  const completedSteps = new Set(events.map((e) => e.eventType));
  const lastCompleted = flow.filter((s) => completedSteps.has(s.type)).pop();
  const nextStep = nextRequiredStep ? flow.find((s) => s.type === nextRequiredStep) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-lg">
            🗺️
          </div>
          <div className="text-left">
            <div className="text-[11px] uppercase tracking-wider font-bold text-violet-700">Parcours d'onboarding</div>
            <div className="text-sm font-bold text-slate-900">
              {teacher.firstName} {teacher.lastName}
              <span className="text-slate-400 font-normal"> · {events.length} événement{events.length > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nextStep ? (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Bloqué à : {nextStep.icon} {nextStep.label}
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              ✅ Parcours complet
            </span>
          )}
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 py-4">
          {/* Progress bar — visual flow */}
          <div className="mb-5">
            <div className="flex items-center gap-1 mb-2">
              {flow.map((step, idx) => {
                const isCompleted = completedSteps.has(step.type);
                const isCurrent = lastCompleted?.type === step.type;
                const isNext = nextStep?.type === step.type;
                return (
                  <div key={step.type} className="flex-1 flex flex-col items-center">
                    <div
                      className={`w-full h-1.5 rounded-full transition-all ${
                        isCompleted ? 'bg-emerald-500' : isNext ? 'bg-amber-300' : 'bg-slate-200'
                      }`}
                    />
                    <div
                      className={`mt-1 text-xs ${isCompleted ? 'opacity-100' : 'opacity-40'}`}
                      title={step.label}
                    >
                      {step.icon}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next-step alert */}
          {nextStep && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
              <span className="text-2xl">{nextStep.icon}</span>
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-amber-700">
                  Action attendue du prof
                </div>
                <div className="text-sm font-bold text-amber-900">{nextStep.label}</div>
                {lastCompleted && (
                  <div className="text-xs text-amber-700 mt-0.5">
                    Dernière étape complétée : {lastCompleted.icon} {lastCompleted.label}{' '}
                    ({lastCompleted.type === lastCompleted.type && events.find((e) => e.eventType === lastCompleted.type)
                      ? relativeTime(events.find((e) => e.eventType === lastCompleted.type)!.createdAt)
                      : ''})
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          {events.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <div className="text-3xl mb-2">📭</div>
              <div className="text-sm">Aucun événement tracké pour l'instant.</div>
              <div className="text-xs mt-1">Le tracking commence dès l'inscription ou l'envoi d'invitation.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event, idx) => {
                const meta = JOURNEY_LABELS[event.eventType];
                const colorClass = COLOR_DOT[meta?.color || 'slate'];
                return (
                  <div key={event.id} className="flex items-start gap-3">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center pt-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${colorClass} ring-2 ring-white`}></div>
                      {idx < events.length - 1 && (
                        <div className="w-0.5 h-full bg-slate-200 mt-1" style={{ minHeight: '24px' }}></div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{meta?.icon}</span>
                          <span className="text-sm font-bold text-slate-900">{meta?.fr || event.eventType}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">{relativeTime(event.createdAt)}</div>
                          <div className="text-[10px] text-slate-400">{fmtDate(event.createdAt)}</div>
                        </div>
                      </div>
                      {event.page && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Page: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{event.page}</code>
                        </div>
                      )}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600">
                            Détails
                          </summary>
                          <pre className="mt-1 text-[10px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-slate-600">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
