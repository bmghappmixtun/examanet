// @ts-nocheck
// Drizzle ORM schema for Cloudflare Workers
// ISOLATED BRANCH: feature/cf-isolated
//
// Mirrors the 32 Prisma models in prisma/schema.prisma.
// Manually written because drizzle-kit pull needs a DB connection.
// Uses Postgres column types (camelCase columns in Prisma → snake_case in Drizzle).

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  uniqueIndex,
  index,
  varchar,
  doublePrecision,
  jsonb,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================
// ENUMS (as PG enums, even though Prisma uses strings)
// ============================================================
// Note: Prisma uses String for enums (SQLite compat). We keep that for now.
// CF POC: we'll treat enum-like fields as text.

// ============================================================
// USER
// ============================================================
export const users = pgTable('User', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('emailVerifiedAt', { withTimezone: true }),
  passwordHash: text('passwordHash'),
  role: text('role').default('STUDENT').notNull(),
  status: text('status').default('PENDING_OTP').notNull(),

  oauthProvider: text('oauthProvider'),
  oauthId: text('oauthId'),

  firstName: text('firstName'),
  lastName: text('lastName'),
  firstNameAr: text('firstNameAr'),
  lastNameAr: text('lastNameAr'),
  avatarUrl: text('avatarUrl'),
  bio: text('bio'),
  phone: text('phone'),
  website: text('website'),
  schoolLevel: text('schoolLevel'),
  classLevel: text('classLevel'),
  section: text('section'),
  schoolName: text('schoolName'),
  schoolNameAr: text('schoolNameAr'),
  governorate: text('governorate'),

  teachingSubjects: text('teachingSubjects'),
  teachingLevels: text('teachingLevels'),
  cvUrl: text('cvUrl'),
  diploma: text('diploma'),
  isVerifiedTeacher: boolean('isVerifiedTeacher').default(false).notNull(),
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  approvedById: text('approvedById'),

  numericId: integer('numericId').unique(),
  slug: text('slug').notNull(),

  preferredLang: text('preferredLang').default('fr').notNull(),
  themePref: text('themePref').default('light').notNull(),
  notifyEmail: boolean('notifyEmail').default(true).notNull(),
  notifyInApp: boolean('notifyInApp').default(true).notNull(),

  invitationStatus: text('invitationStatus'),
  invitationSentAt: timestamp('invitationSentAt', { withTimezone: true }),
  invitationActivatedAt: timestamp('invitationActivatedAt', { withTimezone: true }),
  lastInvitationId: text('lastInvitationId').unique(),
  mustChangePassword: boolean('mustChangePassword').default(false).notNull(),
  passwordSetAt: timestamp('passwordSetAt', { withTimezone: true }),

  failedLoginCount: integer('failedLoginCount').default(0).notNull(),
  lockedUntil: timestamp('lockedUntil', { withTimezone: true }),
  lastFailedLoginAt: timestamp('lastFailedLoginAt', { withTimezone: true }),

  verificationFilesRequestedAt: timestamp('verificationFilesRequestedAt', { withTimezone: true }),
  verificationFilesRequestedById: text('verificationFilesRequestedById'),
  verificationFilesNote: text('verificationFilesNote'),
  verificationFilesCount: integer('verificationFilesCount').default(0).notNull(),
  verificationFilesReceivedAt: timestamp('verificationFilesReceivedAt', { withTimezone: true }),

  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('lastLoginAt', { withTimezone: true }),
}, (t) => ({
  roleStatusIdx: index('User_role_status_idx').on(t.role, t.status),
  emailIdx: index('User_email_idx').on(t.email),
}));

// ============================================================
// OTP CODE
// ============================================================
export const otpCodes = pgTable('OtpCode', {
  id: text('id').primaryKey().notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumedAt', { withTimezone: true }),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userPurposeIdx: index('OtpCode_userId_purpose_idx').on(t.userId, t.purpose),
}));

// ============================================================
// SESSION
// ============================================================
export const sessions = pgTable('Session', {
  id: text('id').primaryKey().notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  userAgent: text('userAgent'),
  ipAddress: text('ipAddress'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('Session_userId_idx').on(t.userId),
}));

// ============================================================
// LEVEL
// ============================================================
export const levels = pgTable('Level', {
  id: text('id').primaryKey().notNull(),
  slug: text('slug').notNull().unique(),
  nameFr: text('nameFr').notNull(),
  nameAr: text('nameAr').notNull(),
  order: integer('order').default(0).notNull(),
});

// ============================================================
// CLASS
// ============================================================
export const classes = pgTable('Class', {
  id: text('id').primaryKey().notNull(),
  levelId: text('levelId').notNull().references(() => levels.id),
  slug: text('slug').notNull().unique(),
  nameFr: text('nameFr').notNull(),
  nameAr: text('nameAr').notNull(),
  order: integer('order').default(0).notNull(),
});

// ============================================================
// SECTION
// ============================================================
export const sections = pgTable('Section', {
  id: text('id').primaryKey().notNull(),
  classId: text('classId').notNull().references(() => classes.id),
  slug: text('slug').notNull(),
  nameFr: text('nameFr').notNull(),
  nameAr: text('nameAr').notNull(),
}, (t) => ({
  uniq: unique('Section_classId_slug_key').on(t.classId, t.slug),
}));

// ============================================================
// SUBJECT
// ============================================================
export const subjects = pgTable('Subject', {
  id: text('id').primaryKey().notNull(),
  slug: text('slug').notNull().unique(),
  nameFr: text('nameFr').notNull(),
  nameAr: text('nameAr').notNull(),
  icon: text('icon'),
  color: text('color'),
  order: integer('order').default(0).notNull(),
});

// ============================================================
// RESOURCE
// ============================================================
export const resources = pgTable('Resource', {
  id: text('id').primaryKey().notNull(),
  numericId: integer('numericId').unique(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  summary: text('summary'),
  type: text('type').notNull(),
  status: text('status').default('DRAFT').notNull(),

  fileKey: text('fileKey').notNull(),
  fileUrl: text('fileUrl').notNull().unique(),
  fileSize: integer('fileSize').default(0).notNull(),
  pageCount: integer('pageCount'),
  thumbnailKey: text('thumbnailKey'),
  thumbnailUrl: text('thumbnailUrl'),

  classId: text('classId').references(() => classes.id),
  sectionId: text('sectionId').references(() => sections.id),
  subjectId: text('subjectId').notNull().references(() => subjects.id),
  teacherId: text('teacherId').references(() => users.id),

  trimester: text('trimester'),
  year: text('year'),
  tags: text('tags'),
  language: text('language').default('fr').notNull(),

  metaDescription: text('metaDescription'),
  descriptionGeneratedAt: timestamp('descriptionGeneratedAt', { withTimezone: true }),
  descriptionSource: text('descriptionSource'),

  headerData: jsonb('headerData'),
  schoolName: text('schoolName'),
  teacherNameAr: text('teacherNameAr'),

  homeworkSubtype: text('homeworkSubtype'),
  homeworkNumber: integer('homeworkNumber'),
  schoolType: text('schoolType'),
  product: text('product'),

  hasCorrection: boolean('hasCorrection').default(false).notNull(),
  correctionSummary: text('correctionSummary'),

  viewsCount: integer('viewsCount').default(0).notNull(),
  downloadsCount: integer('downloadsCount').default(0).notNull(),
  sharesCount: integer('sharesCount').default(0).notNull(),
  favoritesCount: integer('favoritesCount').default(0).notNull(),
  commentsCount: integer('commentsCount').default(0).notNull(),
  avgRating: doublePrecision('avgRating').default(0).notNull(),
  ratingCount: integer('ratingCount').default(0).notNull(),

  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  approvedById: text('approvedById').references(() => users.id),
  rejectionReason: text('rejectionReason'),
  publishedAt: timestamp('publishedAt', { withTimezone: true }),

  originalFileKey: text('originalFileKey'),
  originalFileName: text('originalFileName'),
  originalFormat: text('originalFormat'),
  originalFileSize: integer('originalFileSize'),

  libraryFileId: text('libraryFileId').unique(),
  importedByAdmin: boolean('importedByAdmin').default(false).notNull(),
  importedAt: timestamp('importedAt', { withTimezone: true }),
  importedFrom: text('importedFrom'),
  originalSubmissionId: text('originalSubmissionId'),

  pendingEdit: jsonb('pendingEdit'),
  editStatus: text('editStatus'),
  editRequestedAt: timestamp('editRequestedAt', { withTimezone: true }),
  editRequestedById: text('editRequestedById').references(() => users.id),
  editReviewedAt: timestamp('editReviewedAt', { withTimezone: true }),
  editReviewedById: text('editReviewedById').references(() => users.id),
  editRejectionReason: text('editRejectionReason'),
  editSummary: text('editSummary'),

  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugIdx: index('Resource_slug_idx').on(t.slug),
  statusPubIdx: index('Resource_status_publishedAt_idx').on(t.status, t.publishedAt),
  subjClassIdx: index('Resource_subjectId_classId_idx').on(t.subjectId, t.classId),
  teacherIdx: index('Resource_teacherId_idx').on(t.teacherId),
  typeIdx: index('Resource_type_idx').on(t.type),
}));

// ============================================================
// RESOURCE CONTENT
// ============================================================
export const resourceContents = pgTable('ResourceContent', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().unique().references(() => resources.id, { onDelete: 'cascade' }),
  fullText: text('fullText'),
  pageCount: integer('pageCount'),
  wordCount: integer('wordCount'),
  extractionMethod: text('extractionMethod'),
  extractionDurationMs: integer('extractionDurationMs'),
  extractionError: text('extractionError'),
  extractedAt: timestamp('extractedAt', { withTimezone: true }).defaultNow().notNull(),
  modelUsed: text('modelUsed'),
});

// ============================================================
// RESOURCE METADATA
// ============================================================
export const resourceMetadata = pgTable('ResourceMetadata', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().unique().references(() => resources.id, { onDelete: 'cascade' }),
  profNames: text('profNames').array(),
  schoolName: text('schoolName'),
  year: text('year'),
  type: text('type'),
  subtype: text('subtype'),
  subject: text('subject'),
  generalSubject: text('generalSubject'),
  dossierTechnique: text('dossierTechnique'),
  systemName: text('systemName'),
  courseSubject: text('courseSubject'),
  duration: text('duration'),
  level: text('level'),
  keyPoints: text('keyPoints').array(),
  shortKeyPoints: text('shortKeyPoints').array(),
  topics: text('topics').array(),
  difficulty: text('difficulty'),
  estimatedTimeMinutes: integer('estimatedTimeMinutes'),
  prerequisites: text('prerequisites').array(),
  keyInsights: text('keyInsights').array(),
  exerciseInsights: text('exerciseInsights').array(),
  extractedAt: timestamp('extractedAt', { withTimezone: true }).defaultNow().notNull(),
  modelUsed: text('modelUsed'),
}, (t) => ({
  systemNameIdx: index('ResourceMetadata_systemName_idx').on(t.systemName),
  dossierIdx: index('ResourceMetadata_dossierTechnique_idx').on(t.dossierTechnique),
}));

// ============================================================
// RESOURCE SUMMARY
// ============================================================
export const resourceSummaries = pgTable('ResourceSummary', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().unique().references(() => resources.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  summaryOriginal: text('summaryOriginal'),
  extractedAt: timestamp('extractedAt', { withTimezone: true }).defaultNow().notNull(),
  modelUsed: text('modelUsed'),
});

// ============================================================
// TEACHER VERIFICATION FILE
// ============================================================
export const teacherVerificationFiles = pgTable('TeacherVerificationFile', {
  id: text('id').primaryKey().notNull(),
  fileName: text('fileName').notNull(),
  originalFormat: text('originalFormat').notNull(),
  fileKey: text('fileKey').notNull(),
  fileUrl: text('fileUrl').notNull(),
  fileSize: integer('fileSize').notNull(),
  pageCount: integer('pageCount'),
  type: text('type'),
  description: text('description'),
  year: text('year'),
  trimester: text('trimester'),
  teacherId: text('teacherId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestId: text('requestId'),
  reviewedByAdmin: boolean('reviewedByAdmin').default(false).notNull(),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  reviewNote: text('reviewNote'),
  uploadedAt: timestamp('uploadedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// TEACHER FILE
// ============================================================
export const teacherFiles = pgTable('TeacherFile', {
  id: text('id').primaryKey().notNull(),
  fileName: text('fileName').notNull(),
  originalFormat: text('originalFormat').notNull(),
  fileKey: text('fileKey').notNull(),
  fileUrl: text('fileUrl').notNull(),
  fileSize: integer('fileSize').notNull(),
  pdfKey: text('pdfKey'),
  pdfUrl: text('pdfUrl'),
  pdfSize: integer('pdfSize'),
  conversionStatus: text('conversionStatus'),
  type: text('type'),
  classId: text('classId').references(() => classes.id),
  sectionId: text('sectionId').references(() => sections.id),
  subjectId: text('subjectId').references(() => subjects.id),
  trimester: text('trimester'),
  year: text('year'),
  tags: text('tags'),
  notes: text('notes'),
  teacherId: text('teacherId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('resourceId').unique().references(() => resources.id),
  importedByAdmin: boolean('importedByAdmin').default(false).notNull(),
  importedAt: timestamp('importedAt', { withTimezone: true }),
  importedFrom: text('importedFrom'),
  originalSubmissionId: text('originalSubmissionId'),
  readOnly: boolean('readOnly').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  teacherCreatedIdx: index('TeacherFile_teacherId_createdAt_idx').on(t.teacherId, t.createdAt),
}));

// ============================================================
// COMMENT
// ============================================================
export const comments = pgTable('Comment', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => users.id),
  content: text('content').notNull(),
  parentId: text('parentId'),
  isHidden: boolean('isHidden').default(false).notNull(),
  likes: integer('likes').default(0).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// RATING
// ============================================================
export const ratings = pgTable('Rating', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => users.id),
  stars: integer('stars').notNull(),
  review: text('review'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique('Rating_resourceId_userId_key').on(t.resourceId, t.userId),
}));

// ============================================================
// FAVORITE
// ============================================================
export const favorites = pgTable('Favorite', {
  id: text('id').primaryKey().notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique('Favorite_userId_resourceId_key').on(t.userId, t.resourceId),
}));

// ============================================================
// VIEW
// ============================================================
export const views = pgTable('View', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  userId: text('userId').references(() => users.id),
  ipAddress: text('ipAddress').notNull(),
  userAgent: text('userAgent'),
  duration: integer('duration'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  resourceIdx: index('View_resourceId_idx').on(t.resourceId),
}));

// ============================================================
// DOWNLOAD
// ============================================================
export const downloads = pgTable('Download', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  userId: text('userId').references(() => users.id),
  ipAddress: text('ipAddress').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  resourceIdx: index('Download_resourceId_idx').on(t.resourceId),
}));

// ============================================================
// SHARE
// ============================================================
export const shares = pgTable('Share', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  userId: text('userId').references(() => users.id),
  ipAddress: text('ipAddress').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// REPORT
// ============================================================
export const reports = pgTable('Report', {
  id: text('id').primaryKey().notNull(),
  resourceId: text('resourceId').references(() => resources.id, { onDelete: 'set null' }),
  userId: text('userId').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  description: text('description'),
  status: text('status').default('PENDING').notNull(),
  resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// NOTIFICATION
// ============================================================
export const notifications = pgTable('Notification', {
  id: text('id').primaryKey().notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link'),
  isRead: boolean('isRead').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// NEWSLETTER
// ============================================================
export const newsletters = pgTable('Newsletter', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull().unique(),
  isActive: boolean('isActive').default(true).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// TEACHER INVITATION
// ============================================================
export const teacherInvitations = pgTable('TeacherInvitation', {
  id: text('id').primaryKey().notNull(),
  teacherId: text('teacherId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  tempPassword: text('tempPassword').notNull(),
  status: text('status').default('PENDING').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  emailSentAt: timestamp('emailSentAt', { withTimezone: true }),
  linkClickedAt: timestamp('linkClickedAt', { withTimezone: true }),
  activatedAt: timestamp('activatedAt', { withTimezone: true }),
  cancelledAt: timestamp('cancelledAt', { withTimezone: true }),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  clickIpAddress: text('clickIpAddress'),
  clickUserAgent: text('clickUserAgent'),
  clickCount: integer('clickCount').default(0).notNull(),
  activateIpAddress: text('activateIpAddress'),
  activateUserAgent: text('activateUserAgent'),
  invitedById: text('invitedById').references(() => users.id),
  customMessage: text('customMessage'),
  resendMessageId: text('resendMessageId'),
  deliveryStatus: text('deliveryStatus'),
  deliverySyncedAt: timestamp('deliverySyncedAt', { withTimezone: true }),
  deliveryDetail: text('deliveryDetail'),
  openedAt: timestamp('openedAt', { withTimezone: true }),
  openCount: integer('openCount').default(0).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  teacherIdx: index('TeacherInvitation_teacherId_idx').on(t.teacherId),
  statusIdx: index('TeacherInvitation_status_idx').on(t.status),
  expiresIdx: index('TeacherInvitation_expiresAt_idx').on(t.expiresAt),
}));

// ============================================================
// SETTING
// ============================================================
export const settings = pgTable('Setting', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// FOLLOW
// ============================================================
export const follows = pgTable('Follow', {
  id: text('id').primaryKey().notNull(),
  followerId: text('followerId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: text('followingId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique('Follow_followerId_followingId_key').on(t.followerId, t.followingId),
  followingIdx: index('Follow_followingId_idx').on(t.followingId),
}));

// ============================================================
// CONVERSATION
// ============================================================
export const conversations = pgTable('Conversation', {
  id: text('id').primaryKey().notNull(),
  studentId: text('studentId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teacherId: text('teacherId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: text('subject'),
  lastMessageAt: timestamp('lastMessageAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique('Conversation_studentId_teacherId_key').on(t.studentId, t.teacherId),
}));

// ============================================================
// MESSAGE
// ============================================================
export const messages = pgTable('Message', {
  id: text('id').primaryKey().notNull(),
  conversationId: text('conversationId').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: text('senderId').notNull().references(() => users.id),
  content: text('content').notNull(),
  isRead: boolean('isRead').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  convIdx: index('Message_conversationId_idx').on(t.conversationId),
}));

// ============================================================
// CONTACT MESSAGE
// ============================================================
export const contactMessages = pgTable('ContactMessage', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').default('other').notNull(),
  message: text('message').notNull(),
  ip: text('ip'),
  userAgent: text('userAgent'),
  isRead: boolean('isRead').default(false).notNull(),
  repliedAt: timestamp('repliedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdIdx: index('ContactMessage_createdAt_idx').on(t.createdAt),
  isReadIdx: index('ContactMessage_isRead_idx').on(t.isRead),
}));

// ============================================================
// SEARCH SYNONYM
// ============================================================
export const searchSynonyms = pgTable('SearchSynonym', {
  id: text('id').primaryKey().notNull(),
  term: text('term').notNull(),
  synonyms: text('synonyms').array().notNull(),
  language: text('language').default('all').notNull(),
  category: text('category').default('free').notNull(),
  createdBy: text('createdBy'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// SEARCH LOG
// ============================================================
export const searchLogs = pgTable('SearchLog', {
  id: text('id').primaryKey().notNull(),
  query: text('query').notNull(),
  resultCount: integer('resultCount'),
  clickedId: text('clickedId'),
  durationMs: integer('durationMs'),
  userId: text('userId').references(() => users.id),
  sessionId: text('sessionId'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// API PROVIDER
// ============================================================
export const apiProviders = pgTable('ApiProvider', {
  id: text('id').primaryKey().notNull(),
  provider: text('provider').notNull(),
  displayName: text('displayName').notNull(),
  publicKey: text('publicKey'),
  secretKey: text('secretKey'),
  enabled: boolean('enabled').default(true).notNull(),
  monthlyQuota: integer('monthlyQuota'),
  apiUrl: text('apiUrl'),
  notes: text('notes'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// API PROVIDER USAGE
// ============================================================
export const apiProviderUsages = pgTable('ApiProviderUsage', {
  id: text('id').primaryKey().notNull(),
  providerId: text('providerId').notNull().references(() => apiProviders.id),
  success: boolean('success').notNull(),
  fileName: text('fileName'),
  fileSize: integer('fileSize'),
  failedStep: text('failedStep'),
  year: integer('year'),
  month: integer('month'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// ERROR LOG
// ============================================================
export const errorLogs = pgTable('ErrorLog', {
  id: text('id').primaryKey().notNull(),
  reference: text('reference'),
  source: text('source'),
  severity: text('severity'),
  message: text('message'),
  stack: text('stack'),
  url: text('url'),
  method: text('method'),
  userAgent: text('userAgent'),
  userId: text('userId').references(() => users.id),
  userEmail: text('userEmail'),
  region: text('region'),
  requestId: text('requestId'),
  context: jsonb('context'),
  emailSent: boolean('emailSent').default(false).notNull(),
  emailedAt: timestamp('emailedAt', { withTimezone: true }),
  agentNotified: boolean('agentNotified').default(false).notNull(),
  agentNotifiedAt: timestamp('agentNotifiedAt', { withTimezone: true }),
  resolved: boolean('resolved').default(false).notNull(),
  resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  resolvedBy: text('resolvedBy'),
  agentSeen: boolean('agentSeen').default(false).notNull(),
  agentSeenAt: timestamp('agentSeenAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================
// VERCEL LOG
// ============================================================
export const vercelLogs = pgTable('VercelLog', {
  id: text('id').primaryKey().notNull(),
  externalId: text('externalId'),
  timestamp: timestamp('timestamp', { withTimezone: true }),
  level: text('level'),
  deploymentId: text('deploymentId'),
  source: text('source'),
  domain: text('domain'),
  requestMethod: text('requestMethod'),
  requestPath: text('requestPath'),
  responseStatusCode: integer('responseStatusCode'),
  requestId: text('requestId'),
  environment: text('environment'),
  branch: text('branch'),
  cache: text('cache'),
  message: text('message'),
  projectId: text('projectId'),
  reviewed: boolean('reviewed').default(false).notNull(),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type Level = typeof levels.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Resource = typeof resources.$inferSelect;
