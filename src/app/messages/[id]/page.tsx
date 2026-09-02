// @ts-nocheck
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ArrowLeft } from 'lucide-react';
import ChatWindow from '@/components/social/ChatWindow';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const { id } = await params;

  const conv = await prisma.conversation.findFirst({
    where: {
      id,
      OR: [{ studentId: user.id }, { teacherId: user.id }],
    },
    include: {
      student: {
        select: {
          id: true,
          numericId: true,
          slug: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          schoolName: true,
        },
      },
      teacher: {
        select: {
          id: true,
          numericId: true,
          slug: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          schoolName: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!conv) notFound();

  const other: any = user.id === conv.studentId ? conv.teacher : conv.student;
  const otherName = `${other.firstName || ''} ${other.lastName || ''}`.trim() || 'Utilisateur';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-24 pb-6 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/messages" className="p-2 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link
              href={`/professeurs/${other.numericId}/${other.slug}`}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold flex items-center justify-center overflow-hidden">
                {other.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={other.avatarUrl}
                    alt={otherName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  `${other.firstName?.[0] || ''}${other.lastName?.[0] || ''}`.toUpperCase()
                )}
              </div>
              <div>
                <div className="font-bold group-hover:text-primary-600 transition">{otherName}</div>
                <div className="text-xs text-slate-500">
                  {other.schoolName || (user.id === conv.studentId ? 'Professeur' : 'Élève')}
                </div>
              </div>
            </Link>
          </div>

          <ChatWindow
            conversationId={conv.id}
            currentUserId={user.id}
            initialMessages={conv.messages.map((m) => ({
              id: m.id,
              content: m.content,
              senderId: m.senderId,
              createdAt: m.createdAt.toISOString(),
              sender: m.sender,
            }))}
            otherName={otherName}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
