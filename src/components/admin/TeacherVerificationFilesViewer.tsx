'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Eye, CheckCircle, Loader2, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

type VerificationFile = {
  id: string;
  fileId?: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  originalFormat: string;
  type: string | null;
  description: string | null;
  year: string | null;
  uploadedAt: string;
  reviewedByAdmin: boolean;
  reviewedAt: string | null;
  reviewNote: string | null;
};

type Teacher = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: string;
  verificationFilesRequestedAt: string | null;
  verificationFilesCount: number;
  verificationFilesReceivedAt: string | null;
  verificationFilesNote: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  COURSE: '📚 Cours',
  DEVOIR: '📝 Devoir',
  EXERCISE: '✏️ Série',
  REVISION: '🔄 Révision',
  EXAM: '📋 Examen',
  BAC_SUBJECT: '🎓 Sujet Bac',
  CORRECTION: '✅ Corrigé',
  OTHER: '📁 Autre',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TeacherVerificationFilesViewer({ teacherId }: { teacherId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [files, setFiles] = useState<VerificationFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  useEffect(() => {
    if (open && !teacher) load();
  }, [open, teacher]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/teacher/${teacherId}/verification-files`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      setTeacher(data.teacher);
      setFiles(data.files);
    } catch (e) {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  async function toggleReviewed(fileId: string, currentValue: boolean) {
    try {
      const res = await fetch(`/api/admin/teacher/${teacherId}/verification-files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, reviewed: !currentValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erreur');
        return;
      }
      setFiles(
        files.map((f) =>
          f.id === fileId
            ? {
                ...f,
                reviewedByAdmin: !currentValue,
                reviewedAt: !currentValue ? new Date().toISOString() : null,
              }
            : f,
        ),
      );
      toast.success(!currentValue ? '✅ Marqué examiné' : 'Marqué non examiné');
    } catch {
      toast.error('Erreur');
    }
  }

  const reviewedCount = files.filter((f) => f.reviewedByAdmin).length;
  const allReviewed = files.length > 0 && reviewedCount === files.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-violet-100 text-violet-700 rounded-md hover:bg-violet-200 transition"
      >
        <FileText className="w-3.5 h-3.5" />
        Voir les {files.length > 0 ? files.length : '?'} fichier(s)
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="presentation"
          onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLDivElement)?.click(); }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white flex-shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl flex-shrink-0">
                  📁
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-extrabold leading-tight">Fichiers de vérification</h2>
                  <p className="text-sm text-violet-100">
                    {teacher?.firstName} {teacher?.lastName} · {teacher?.email}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-lg flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 mx-auto text-violet-500 animate-spin mb-2" />
                  <p className="text-sm text-slate-500">Chargement...</p>
                </div>
              ) : !teacher ? (
                <div className="text-center py-12 text-red-500">Enseignant non trouvé</div>
              ) : files.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <h3 className="font-bold text-slate-900 mb-1">Aucun fichier reçu</h3>
                  <p className="text-sm text-slate-500">
                    Le prof n'a pas encore uploadé ses fichiers de vérification.
                  </p>
                </div>
              ) : (
                <>
                  {/* Review status */}
                  <div
                    className={`mb-4 p-3 rounded-xl border ${allReviewed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
                  >
                    <div className="flex items-center gap-2">
                      {allReviewed ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Clock className="w-5 h-5 text-amber-600" />
                      )}
                      <div className="text-sm font-bold">
                        {reviewedCount}/{files.length} fichier(s) examiné(s)
                      </div>
                    </div>
                  </div>

                  {/* Admin's note (request) */}
                  {teacher.verificationFilesNote && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="text-xs font-bold text-amber-900 mb-1">
                        📝 Message envoyé au prof :
                      </div>
                      <p className="text-xs text-amber-800 whitespace-pre-line line-clamp-3">
                        {teacher.verificationFilesNote}
                      </p>
                    </div>
                  )}

                  {/* Files list */}
                  <div className="space-y-2">
                    {files.map((f) => {
                      const typeLabel = f.type ? TYPE_LABELS[f.type] || f.type : '📁 Non spécifié';
                      return (
                        <div
                          key={f.id}
                          className={`bg-white border-2 rounded-xl p-4 transition ${
                            f.reviewedByAdmin
                              ? 'border-emerald-200 bg-emerald-50/30'
                              : 'border-slate-200 hover:border-violet-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                f.originalFormat === 'pdf'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}
                            >
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <div className="font-bold text-sm text-slate-900 truncate">
                                  {f.fileName}
                                </div>
                                {f.reviewedByAdmin && (
                                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
                                    <CheckCircle className="w-3 h-3 me-0.5" /> Examiné
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                <span>{formatSize(f.fileSize)}</span>
                                <span>•</span>
                                <span>{typeLabel}</span>
                                {f.year && (
                                  <>
                                    <span>•</span>
                                    <span>{f.year}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span>{new Date(f.uploadedAt).toLocaleDateString('fr-FR')}</span>
                              </div>
                              {f.description && (
                                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                  {f.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => {
                                setPreviewUrl(f.fileUrl);
                                setPreviewName(f.fileName);
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-800 px-2.5 py-1.5 rounded-md hover:bg-violet-50 transition"
                            >
                              <Eye className="w-3.5 h-3.5" /> Aperçu
                            </button>
                            <a
                              href={f.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition"
                            >
                              <Download className="w-3.5 h-3.5" /> Télécharger
                            </a>
                            <button
                              onClick={() => toggleReviewed(f.id, f.reviewedByAdmin)}
                              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md transition ${
                                f.reviewedByAdmin
                                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {f.reviewedByAdmin ? (
                                <>
                                  <X className="w-3.5 h-3.5" /> Décocher
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5" /> Marquer examiné
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {files.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 p-4 flex-shrink-0">
                <div className="text-xs text-slate-600 text-center">
                  Quand vous avez tout examiné, retournez sur la liste et cliquez{' '}
                  <strong>Approuver</strong> ou <strong>Rejeter</strong>.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
          role="presentation"
          onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLDivElement)?.click(); }}
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 p-3 flex items-center justify-between text-white flex-shrink-0">
              <div className="text-sm font-bold truncate flex-1">{previewName}</div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-md text-xs font-semibold"
                >
                  Ouvrir dans un nouvel onglet
                </a>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="p-1.5 hover:bg-white/20 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe src={previewUrl} className="w-full flex-1 bg-slate-100" title={previewName} />
          </div>
        </div>
      )}
    </>
  );
}
