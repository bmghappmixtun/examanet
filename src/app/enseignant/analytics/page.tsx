import { redirect } from 'next/navigation';

// /enseignant/analytics is merged into /enseignant/stats (single stats page)
export default function AnalyticsPage() {
  redirect('/enseignant/stats');
}
