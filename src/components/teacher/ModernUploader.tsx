'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  WifiOff,
  Pause,
  Play,
  RotateCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Stage = 'idle' | 'preparing' | 'uploading' | 'processing' | 'success' | 'error' | 'paused';

type Props = {
  endpoint: string;
  fieldName?: string;
  maxSizeMB?: number;
  accept?: string;
  onSuccess?: (data: any) => void;
  onError?: (err: any) => void;
  // Pre-fill the form data alongside the file
  formFields?: Record<string, string>;
  // Reset trigger (e.g., after successful submit)
  resetKey?: number;
};

const STAGE_CONFIG: Record<Stage, { label: string; color: string; icon: any }> = {
  idle: { label: 'En attente', color: 'slate', icon: Upload },
  preparing: { label: 'Préparation...', color: 'amber', icon: Loader2 },
  uploading: { label: 'Envoi en cours', color: 'cyan', icon: Upload },
  processing: { label: 'Traitement...', color: 'blue', icon: Loader2 },
  success: { label: 'Envoyé ✓', color: 'emerald', icon: CheckCircle2 },
  error: { label: 'Erreur', color: 'red', icon: AlertCircle },
  paused: { label: 'En pause', color: 'amber', icon: Pause },
};

/**
 * Modern file uploader with:
 *  - Drag & drop with animated feedback
 *  - Multi-stop gradient progress bar with shimmer + glow
 *  - Animated circular progress ring (concentric)
 *  - Real-time speed (MB/s) + ETA + bytes counter
 *  - Stage indicators (preparing → uploading → processing → success)
 *  - Animated floating file icon
 *  - Pause/Resume + Cancel + Retry
 *  - Offline detection (auto-pause + resume)
 *  - Particle confetti on success
 *  - Cubic-bezier easing, GPU-accelerated animations
 *  - Native XMLHttpRequest for upload progress (fetch doesn't support it)
 */
export default function ModernUploader({
  endpoint,
  fieldName = 'file',
  maxSizeMB = 50,
  accept = '.pdf,.docx,.doc,.odt',
  onSuccess,
  onError,
  formFields = {},
  resetKey = 0,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [particles, setParticles] = useState<
    Array<{ id: number; x: number; y: number; color: string; delay: number }>
  >([]);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastLoadedRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const speedSamplesRef = useRef<number[]>([]);

  // Network detection
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
      const onOnline = () => {
        setIsOnline(true);
        if (stage === 'uploading' && isPaused) handleResume();
      };
      const onOffline = () => {
        setIsOnline(false);
        if (stage === 'uploading') handlePause();
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }
  }, [stage, isPaused]);

  // Reset on resetKey change
  useEffect(() => {
    cancelUpload();
    setFile(null);
    setStage('idle');
    setProgress(0);
    setUploaded(0);
    setSpeed(0);
    setEta(null);
    setError(null);
    setIsPaused(false);
    setParticles([]);
  }, [resetKey]);

  // Compute speed (smoothed over last 5 samples)
  const computeSpeed = useCallback((bytesPerSec: number) => {
    const samples = speedSamplesRef.current;
    samples.push(bytesPerSec);
    if (samples.length > 5) samples.shift();
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }, []);

  const ALLOWED_EXT = ['.pdf', '.docx', '.doc', '.odt'];
  const ALLOWED_MIME = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.oasis.opendocument.text',
  ];
  const ALLOWED_LABEL = 'PDF, Word (.docx, .doc), OpenOffice (.odt)';

  function selectFile(f: File | null) {
    if (!f) return;
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    const ok = ALLOWED_EXT.includes(ext) || ALLOWED_MIME.includes(f.type);
    if (!ok) {
      toast.error(`Type non supporté. Formats acceptés: ${ALLOWED_LABEL}`);
      return;
    }
    if (f.size > maxSizeMB * 1024 * 1024) {
      toast.error(`Le fichier dépasse ${maxSizeMB} Mo`);
      return;
    }
    setFile(f);
    setError(null);
    // Auto-start upload
    setTimeout(() => startUpload(f), 300);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  }

  function startUpload(f: File) {
    setStage('preparing');
    setProgress(0);
    setUploaded(0);
    setError(null);
    setIsPaused(false);
    speedSamplesRef.current = [];
    startTimeRef.current = Date.now();
    lastLoadedRef.current = 0;
    lastTimeRef.current = Date.now();

    // Small delay to show "preparing" state
    setTimeout(() => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const formData = new FormData();
      formData.append(fieldName, f);
      Object.entries(formFields).forEach(([k, v]) => formData.append(k, v));

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        if (isPaused) return;
        const now = Date.now();
        const deltaTime = (now - lastTimeRef.current) / 1000;
        const deltaBytes = e.loaded - lastLoadedRef.current;
        const instantSpeed = deltaTime > 0 ? deltaBytes / deltaTime : 0;
        const smoothSpeed = computeSpeed(instantSpeed);
        setSpeed(smoothSpeed);
        setUploaded(e.loaded);
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(pct);
        if (smoothSpeed > 0) {
          const remaining = (e.total - e.loaded) / smoothSpeed;
          setEta(remaining);
        }
        lastLoadedRef.current = e.loaded;
        lastTimeRef.current = now;
        if (stage === 'preparing') setStage('uploading');
      });

      xhr.upload.addEventListener('load', () => {
        setStage('processing');
        setProgress(100);
      });

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            setStage('success');
            triggerConfetti();
            toast.success('📄 Fichier uploadé ! Remplissez les infos puis cliquez sur Publier.');
            onSuccess?.(data);
          } else {
            const err = data?.error || `Erreur ${xhr.status}`;
            setStage('error');
            setError(err);
            toast.error(err);
            onError?.(err);
          }
        } catch (e) {
          setStage('error');
          setError('Réponse serveur invalide');
          toast.error('Réponse serveur invalide');
          onError?.(e);
        }
      });

      xhr.addEventListener('error', () => {
        if (stage !== 'paused') {
          setStage('error');
          setError('Erreur réseau');
          toast.error('Erreur réseau');
          onError?.('Erreur réseau');
        }
      });

      xhr.addEventListener('abort', () => {
        if (stage !== 'paused') {
          setStage('idle');
          setProgress(0);
        }
      });

      xhr.open('POST', endpoint);
      xhr.send(formData);
    }, 600);
  }

  function handlePause() {
    if (xhrRef.current && stage === 'uploading') {
      xhrRef.current.abort();
      setIsPaused(true);
      setStage('paused');
    }
  }

  function handleResume() {
    if (file && stage === 'paused') {
      setIsPaused(false);
      startUpload(file);
    }
  }

  function cancelUpload() {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }

  function retry() {
    if (file) {
      setError(null);
      startUpload(file);
    }
  }

  function triggerConfetti() {
    const colors = ['#0EA5E9', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'];
    const newParticles = Array.from({ length: 40 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: -20,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.3,
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 2500);
  }

  const cfg = STAGE_CONFIG[stage];
  const StageIcon = cfg.icon;
  const pct = Math.min(100, progress);
  const totalSize = file?.size || 0;
  const totalSizeStr = formatBytes(totalSize);
  const uploadedStr = formatBytes(uploaded);
  const speedStr = formatBytes(speed) + '/s';
  const etaStr = eta !== null && eta < Infinity ? formatTime(eta) : '—';

  return (
    <div className="relative">
      {/* Confetti */}
      {particles.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
          {particles.map((p) => (
            <span
              key={p.id}
              className="confetti-piece"
              style={{
                left: `${p.x}%`,
                top: `${p.y}px`,
                background: p.color,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      {!file ? (
        // ============== DRAG & DROP ZONE ==============
        <div
          role="region"
          aria-label="Zone de dépôt de fichier"
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`relative overflow-hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-500 p-10 group
            ${
              dragOver
                ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-cyan-50 scale-[1.02]'
                : 'border-slate-300 bg-gradient-to-br from-slate-50 to-white hover:border-primary-400 hover:bg-gradient-to-br hover:from-primary-50/40 hover:to-cyan-50/40'
            }`}
        >
          {/* Animated background blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -start-20 w-64 h-64 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-700 animate-blob" />
            <div className="absolute -bottom-20 -end-20 w-64 h-64 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-700 animate-blob animation-delay-2000" />
            <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700 animate-blob animation-delay-4000" />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => selectFile(e.target.files?.[0] || null)}
            className="hidden"
          />

          <div className="relative flex flex-col items-center gap-4 text-center">
            {/* Animated upload icon with rings */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-400 to-cyan-400 opacity-30 blur-xl animate-pulse-slow" />
              <div
                className={`relative w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-primary-500/30 transition-transform duration-500 ${dragOver ? 'scale-110 rotate-12' : 'group-hover:scale-110'}`}
              >
                <Upload className="w-10 h-10 text-white" strokeWidth={2.5} />
                {/* Pulse rings */}
                <span className="absolute inset-0 rounded-full border-2 border-primary-400 animate-ping" />
                <span className="absolute inset-0 rounded-full border-2 border-primary-400 animate-ping animation-delay-1000" />
              </div>
              <Sparkles className="absolute -top-2 -end-2 w-6 h-6 text-amber-400 animate-spin-slow" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold bg-gradient-to-r from-primary-600 to-cyan-600 bg-clip-text text-transparent">
                {dragOver ? '✨ Relâchez pour envoyer !' : 'Glissez-déposez votre fichier'}
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                ou{' '}
                <span className="text-primary-600 font-bold underline decoration-2 underline-offset-4">
                  cliquez pour parcourir
                </span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-3 text-xs text-slate-400 flex-wrap">
                <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full">PDF</span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">DOCX</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">DOC</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">ODT</span>
                <span className="text-slate-400">• Max {maxSizeMB} Mo</span>
                <span className="flex items-center gap-1 text-amber-500">
                  <Zap className="w-3 h-3" /> Word → PDF auto
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // ============== UPLOAD IN PROGRESS / COMPLETE CARD ==============
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Top gradient bar - dynamic based on stage */}
          <div
            className={`h-1.5 w-full bg-gradient-to-r transition-all duration-700 ${
              stage === 'success'
                ? 'from-emerald-400 via-emerald-500 to-teal-500'
                : stage === 'error'
                  ? 'from-red-400 via-red-500 to-rose-500'
                  : stage === 'paused'
                    ? 'from-amber-400 via-amber-500 to-orange-500'
                    : 'from-cyan-400 via-primary-500 to-blue-500'
            }`}
          />

          <div className="p-5">
            {/* File info row */}
            <div className="flex items-start gap-4 mb-4">
              {/* Floating file icon with circular progress ring */}
              <div className="relative flex-shrink-0">
                {/* Glow */}
                {(stage === 'uploading' || stage === 'processing') && (
                  <div className="absolute inset-0 rounded-full bg-primary-400 blur-xl opacity-40 animate-pulse" />
                )}
                {/* Circular progress SVG */}
                <svg className="relative w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <defs>
                    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06B6D4" />
                      <stop offset="50%" stopColor="#0EA5E9" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  {/* Background ring */}
                  <circle cx="32" cy="32" r="28" stroke="#E2E8F0" strokeWidth="4" fill="none" />
                  {/* Progress ring */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="url(#progressGrad)"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 300ms cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                </svg>
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {stage === 'success' ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 animate-bounce-once" />
                  ) : stage === 'error' ? (
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  ) : (
                    <FileText
                      className={`w-7 h-7 text-slate-600 ${stage === 'uploading' ? 'animate-float' : ''}`}
                    />
                  )}
                </div>
              </div>

              {/* File details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1
                    ${
                      stage === 'success'
                        ? 'bg-emerald-100 text-emerald-700'
                        : stage === 'error'
                          ? 'bg-red-100 text-red-700'
                          : stage === 'paused'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-primary-100 text-primary-700'
                    }`}
                  >
                    <StageIcon
                      className={`w-3 h-3 ${stage === 'preparing' || stage === 'processing' || stage === 'uploading' ? 'animate-spin' : ''}`}
                    />
                    {cfg.label}
                  </span>
                  {!isOnline && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1">
                      <WifiOff className="w-3 h-3" /> Hors ligne
                    </span>
                  )}
                </div>
                <div className="font-bold text-slate-900 truncate">{file.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {file.type || 'application/pdf'} · {totalSizeStr}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 flex-shrink-0">
                {stage === 'uploading' && (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="p-2 hover:bg-slate-100 rounded-lg"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {stage === 'paused' && (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                    title="Reprendre"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {stage === 'error' && (
                  <button
                    type="button"
                    onClick={retry}
                    className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"
                    title="Réessayer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                )}
                {stage !== 'uploading' && stage !== 'processing' && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelUpload();
                      setFile(null);
                      setStage('idle');
                    }}
                    className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                    title="Retirer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* BIG PROGRESS BAR - the centerpiece */}
            <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
              {/* Glow under bar */}
              <div
                className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 via-primary-500 to-blue-500 opacity-30 blur-md transition-all"
                style={{ width: `${pct}%` }}
              />
              {/* Main bar */}
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary-500 to-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${pct}%` }}
              >
                {/* Shimmer effect */}
                {stage === 'uploading' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                )}
              </div>
              {/* Percentage in middle (when bar > 10%) */}
              {pct > 10 && pct < 100 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-extrabold text-white drop-shadow-sm">
                    {pct}%
                  </span>
                </div>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                  Vitesse
                </div>
                <div className="font-extrabold text-slate-900 mt-0.5 flex items-center justify-center gap-1">
                  {stage === 'uploading' ? speedStr : '—'}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                  Restant
                </div>
                <div className="font-extrabold text-slate-900 mt-0.5">
                  {stage === 'uploading' ? etaStr : stage === 'success' ? '✓ Terminé' : '—'}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                  Transféré
                </div>
                <div className="font-extrabold text-slate-900 mt-0.5">
                  {uploadedStr} / {totalSizeStr}
                </div>
              </div>
            </div>

            {/* Error message */}
            {stage === 'error' && error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold">Échec de l'envoi</div>
                  <div className="text-xs">{error}</div>
                </div>
              </div>
            )}

            {/* Success message */}
            {stage === 'success' && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm text-emerald-700 animate-fade-in">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 font-semibold">
                  Fichier uploadé avec succès ! Remplissez les infos et cliquez sur Publier pour
                  soumettre à approbation.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (!b || b < 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(seconds: number): string {
  if (!seconds || seconds === Infinity || isNaN(seconds)) return '—';
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
