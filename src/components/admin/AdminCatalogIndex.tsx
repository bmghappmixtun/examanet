import { BookOpen, GraduationCap, Layers, Library } from 'lucide-react';

type Stats = {
  subjects: number;
  levels: number;
  classes: number;
  sections: number;
};

export default function AdminCatalogIndex({ stats }: { stats: Stats }) {
  const cards = [
    {
      icon: BookOpen,
      label: 'Matières',
      value: stats.subjects,
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: GraduationCap,
      label: 'Niveaux',
      value: stats.levels,
      color: 'from-sky-500 to-cyan-500',
    },
    {
      icon: Layers,
      label: 'Classes',
      value: stats.classes,
      color: 'from-violet-500 to-purple-500',
    },
    {
      icon: Library,
      label: 'Sections',
      value: stats.sections,
      color: 'from-emerald-500 to-teal-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.2),transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-6 h-6" />
            <h1 className="text-2xl md:text-3xl font-extrabold">Catalogue de la plateforme</h1>
          </div>
          <p className="text-white/90 max-w-2xl">
            Gérez les matières, niveaux, classes et sections de la plateforme. Conforme au programme
            officiel tunisien 2025-2026.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center mb-2 shadow-sm`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{c.value}</div>
              <div className="text-xs text-slate-500">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Quick links to CRUD tabs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <a
          href="#subjects"
          className="group flex items-center gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-200 hover:border-amber-400 transition"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">Matières</div>
            <div className="text-xs text-slate-600">Ajouter / modifier / supprimer</div>
          </div>
          <span className="text-amber-500 group-hover:translate-y-1 transition">↓</span>
        </a>
        <a
          href="#levels"
          className="group flex items-center gap-3 p-4 rounded-xl bg-sky-50 border-2 border-sky-200 hover:border-sky-400 transition"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-500 text-white flex items-center justify-center">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">Niveaux</div>
            <div className="text-xs text-slate-600">Primaire / Collège / Lycée</div>
          </div>
          <span className="text-sky-500 group-hover:translate-y-1 transition">↓</span>
        </a>
        <a
          href="#classes"
          className="group flex items-center gap-3 p-4 rounded-xl bg-violet-50 border-2 border-violet-200 hover:border-violet-400 transition"
        >
          <div className="w-10 h-10 rounded-lg bg-violet-500 text-white flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">Classes</div>
            <div className="text-xs text-slate-600">6 primaire + 3 collège + 4 lycée</div>
          </div>
          <span className="text-violet-500 group-hover:translate-y-1 transition">↓</span>
        </a>
        <a
          href="#sections"
          className="group flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-400 transition"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
            <Library className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">Sections lycée</div>
            <div className="text-xs text-slate-600">7 sections officielles</div>
          </div>
          <span className="text-emerald-500 group-hover:translate-y-1 transition">↓</span>
        </a>
      </div>
    </div>
  );
}
