import FournisseursClient from './FournisseursClient';

export const metadata = {
  title: 'Fournisseurs & abonnements — Admin',
  robots: { index: false, follow: false },
};

export default function FournisseursPage() {
  return <FournisseursClient />;
}
