export default function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block w-12 h-12 border-4 border-red-200 border-t-red-500 rounded-full animate-spin"></div>
        <p className="mt-3 text-slate-500 text-sm">Chargement de l'administration...</p>
      </div>
    </div>
  );
}
