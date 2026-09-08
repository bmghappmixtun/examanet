import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import ProfileCompletionForm from './ProfileCompletionForm';

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  
  const params = await searchParams;
  const isWelcome = params?.welcome === '1';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            {isWelcome ? '🎉 Bienvenue !' : 'Complétez votre profil'}
          </h1>
          <p className="mt-2 text-slate-600">
            {isWelcome
              ? 'Quelques infos pour personnaliser votre expérience Examanet.'
              : 'Aidez-nous à mieux vous connaître.'}
          </p>
        </div>

        <ProfileCompletionForm
          initialFirstName={user.firstName || ''}
          initialLastName={user.lastName || ''}
          initialEmail={user.email}
          initialSchoolLevel={user.schoolLevel || ''}
          initialClassLevel={user.classLevel || ''}
          initialSchoolName={user.schoolName || ''}
          initialGovernorate={user.governorate || ''}
        />
      </div>
    </div>
  );
}
