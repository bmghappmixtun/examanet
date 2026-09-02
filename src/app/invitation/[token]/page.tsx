import { Metadata } from 'next';
import AcceptInvitationClient from './AcceptInvitationClient';

export const metadata: Metadata = {
  title: 'Activer votre compte — Examanet',
  description: 'Activez votre compte enseignant Examanet en quelques clics.',
  robots: 'noindex, nofollow', // Don't index invitation pages
};

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitationClient token={token} />;
}
