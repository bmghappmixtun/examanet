// @ts-nocheck
import { redirect } from 'next/navigation';
import { getInitials } from '@/lib/text-utils';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function MessagesInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ studentId: user.id }, { teacherId: user.id }] },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      teacher: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, schoolName: true },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { content: true, senderId: true, createdAt: true },
      },
    },
  });

  const convsWithUnread = await Promise.all(
    conversations.map(async (c) => {
      const unread = await prisma.message.count({
        where: { conversationId: c.id, isRead: false, senderId: { not: user.id } },
      });
      return { ...c, unread };
    }),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-24 pb-10 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <Link
              href={user.role === 'TEACHER' ? '/enseignant' : '/mon-compte'}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <MessageCircle className="w-7 h-7 text-primary-500" />
              Messages
            </h1>
          </div>

          {convsWithUnread.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h2 className="text-xl font-bold mb-2">Aucun message</h2>
              <p className="text-slate-500">
                {user.role === 'TEACHER'
                  ? 'Les élèves pourront vous écrire depuis votre profil.'
                  : 'Visitez le profil d\'un professeur et cliquez sur "Message" pour démarrer une conversation.'}
              </p>
              {user.role === 'STUDENT' && (
                <Link href="/professeurs" className="btn-primary inline-flex mt-4">
                  Découvrir les professeurs
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {convsWithUnread.map((conv) => {
                const other = user.id === conv.studentId ? conv.teacher : conv.student;
                const otherName =
                  `${other.firstName || ''} ${other.lastName || ''}`.trim() || 'Utilisateur';
                const initials = getInitials(other.firstName, other.lastName);
                const lastMsg = conv.messages[0];

                return (
                  <Link
                    key={conv.id}
                    href={`/messages/${conv.id}`}
                    className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition ${conv.unread > 0 ? 'bg-primary-50/30' : ''}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {other.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={other.avatarUrl}
                          alt={otherName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate ${conv.unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}
                        >
                          {otherName}
                        </span>
                        {lastMsg && (
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {timeAgo(new Date(lastMsg.createdAt))}
                          </span>
                        )}
                      </div>
                      {lastMsg ? (
                        <p
                          className={`text-sm truncate mt-0.5 ${conv.unread > 0 ? 'text-slate-700' : 'text-slate-500'}`}
                        >
                          {lastMsg.senderId === user.id && (
                            <span className="text-slate-400">Vous : </span>
                          )}
                          {lastMsg.content}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400 italic mt-0.5">Aucun message</p>
                      )}
                    </div>
                    {conv.unread > 0 && (
                      <span className="bg-primary-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
                        {conv.unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
