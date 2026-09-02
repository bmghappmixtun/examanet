CREATE TABLE `ApiProviderUsage` (
	`id` text PRIMARY KEY NOT NULL,
	`providerId` text NOT NULL,
	`operation` text NOT NULL,
	`tokensIn` integer,
	`tokensOut` integer,
	`cost` real,
	`success` integer DEFAULT true NOT NULL,
	`errorMsg` text,
	`durationMs` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`providerId`) REFERENCES `ApiProvider`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `api_usage_provider_idx` ON `ApiProviderUsage` (`providerId`);--> statement-breakpoint
CREATE INDEX `api_usage_created_at_idx` ON `ApiProviderUsage` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ApiProvider` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`apiKey` text,
	`baseUrl` text,
	`model` text,
	`isActive` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`config` text,
	`lastUsedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ApiProvider_name_unique` ON `ApiProvider` (`name`);--> statement-breakpoint
CREATE INDEX `api_provider_active_idx` ON `ApiProvider` (`isActive`);--> statement-breakpoint
CREATE TABLE `Class` (
	`id` text PRIMARY KEY NOT NULL,
	`numericId` integer,
	`slug` text NOT NULL,
	`nameFr` text NOT NULL,
	`nameAr` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`levelId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Class_numericId_unique` ON `Class` (`numericId`);--> statement-breakpoint
CREATE INDEX `class_level_idx` ON `Class` (`levelId`);--> statement-breakpoint
CREATE INDEX `class_slug_idx` ON `Class` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_numeric_id_idx` ON `Class` (`numericId`);--> statement-breakpoint
CREATE TABLE `Comment` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text NOT NULL,
	`content` text NOT NULL,
	`isHidden` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `comment_resource_idx` ON `Comment` (`resourceId`);--> statement-breakpoint
CREATE INDEX `comment_user_idx` ON `Comment` (`userId`);--> statement-breakpoint
CREATE INDEX `comment_created_at_idx` ON `Comment` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ContactMessage` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`repliedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_status_idx` ON `ContactMessage` (`status`);--> statement-breakpoint
CREATE TABLE `Conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`user1Id` text NOT NULL,
	`user2Id` text NOT NULL,
	`lastMessageAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`user1Id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`user2Id`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `conv_user1_idx` ON `Conversation` (`user1Id`);--> statement-breakpoint
CREATE INDEX `conv_user2_idx` ON `Conversation` (`user2Id`);--> statement-breakpoint
CREATE INDEX `conv_last_msg_idx` ON `Conversation` (`lastMessageAt`);--> statement-breakpoint
CREATE TABLE `Download` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text,
	`ipAddress` text,
	`userAgent` text,
	`original` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `download_resource_idx` ON `Download` (`resourceId`);--> statement-breakpoint
CREATE INDEX `download_user_idx` ON `Download` (`userId`);--> statement-breakpoint
CREATE INDEX `download_created_at_idx` ON `Download` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ErrorLog` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`level` text DEFAULT 'ERROR' NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`url` text,
	`method` text,
	`statusCode` integer,
	`userId` text,
	`context` text,
	`agentSeen` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `error_log_source_idx` ON `ErrorLog` (`source`);--> statement-breakpoint
CREATE INDEX `error_log_level_idx` ON `ErrorLog` (`level`);--> statement-breakpoint
CREATE INDEX `error_log_agent_seen_idx` ON `ErrorLog` (`agentSeen`);--> statement-breakpoint
CREATE INDEX `error_log_created_at_idx` ON `ErrorLog` (`createdAt`);--> statement-breakpoint
CREATE TABLE `Favorite` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_unique_idx` ON `Favorite` (`resourceId`,`userId`);--> statement-breakpoint
CREATE INDEX `favorite_user_idx` ON `Favorite` (`userId`);--> statement-breakpoint
CREATE TABLE `Follow` (
	`id` text PRIMARY KEY NOT NULL,
	`followerId` text NOT NULL,
	`followingId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`followerId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`followingId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follow_unique_idx` ON `Follow` (`followerId`,`followingId`);--> statement-breakpoint
CREATE INDEX `follow_follower_idx` ON `Follow` (`followerId`);--> statement-breakpoint
CREATE INDEX `follow_following_idx` ON `Follow` (`followingId`);--> statement-breakpoint
CREATE TABLE `Level` (
	`id` text PRIMARY KEY NOT NULL,
	`numericId` integer,
	`slug` text NOT NULL,
	`nameFr` text NOT NULL,
	`nameAr` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`schoolType` text DEFAULT 'PUBLIC' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Level_numericId_unique` ON `Level` (`numericId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Level_slug_unique` ON `Level` (`slug`);--> statement-breakpoint
CREATE TABLE `Message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`senderId` text NOT NULL,
	`content` text NOT NULL,
	`isRead` integer DEFAULT false NOT NULL,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `msg_conv_idx` ON `Message` (`conversationId`);--> statement-breakpoint
CREATE INDEX `msg_created_at_idx` ON `Message` (`createdAt`);--> statement-breakpoint
CREATE TABLE `Newsletter` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`source` text,
	`subscribedAt` integer NOT NULL,
	`unsubscribedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Newsletter_email_unique` ON `Newsletter` (`email`);--> statement-breakpoint
CREATE INDEX `newsletter_active_idx` ON `Newsletter` (`isActive`);--> statement-breakpoint
CREATE TABLE `Notification` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`isRead` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `Notification` (`userId`);--> statement-breakpoint
CREATE INDEX `notif_is_read_idx` ON `Notification` (`isRead`);--> statement-breakpoint
CREATE TABLE `OtpCode` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`code` text NOT NULL,
	`purpose` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE TABLE `Rating` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text NOT NULL,
	`value` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_unique_idx` ON `Rating` (`resourceId`,`userId`);--> statement-breakpoint
CREATE INDEX `rating_resource_idx` ON `Rating` (`resourceId`);--> statement-breakpoint
CREATE TABLE `Report` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewedById` text,
	`reviewedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `report_resource_idx` ON `Report` (`resourceId`);--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `Report` (`status`);--> statement-breakpoint
CREATE TABLE `ResourceContent` (
	`resourceId` text PRIMARY KEY NOT NULL,
	`text` text,
	`pages` integer,
	`wordCount` integer,
	`charCount` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE TABLE `ResourceMetadata` (
	`resourceId` text PRIMARY KEY NOT NULL,
	`systemName` text,
	`subject` text,
	`profNames` text,
	`dossierTechnique` text,
	`shortKeyPoints` text,
	`keyPoints` text,
	`topics` text,
	`level` text,
	`estimatedTimeMinutes` integer,
	`prerequisites` text,
	`keyInsights` text,
	`exerciseInsights` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE TABLE `ResourceSummary` (
	`resourceId` text PRIMARY KEY NOT NULL,
	`summary` text,
	`language` text DEFAULT 'fr' NOT NULL,
	`model` text,
	`generatedAt` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `resource_summary_lang_idx` ON `ResourceSummary` (`language`);--> statement-breakpoint
CREATE TABLE `Resource` (
	`id` text PRIMARY KEY NOT NULL,
	`numericId` integer,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`summary` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` integer DEFAULT 0 NOT NULL,
	`pageCount` integer,
	`thumbnailKey` text,
	`thumbnailUrl` text,
	`r2Key` text,
	`classId` text,
	`sectionId` text,
	`subjectId` text NOT NULL,
	`teacherId` text,
	`trimester` text,
	`year` text,
	`tags` text,
	`language` text DEFAULT 'fr' NOT NULL,
	`metaDescription` text,
	`descriptionGeneratedAt` integer,
	`descriptionSource` text,
	`headerData` text,
	`schoolName` text,
	`teacherNameAr` text,
	`homeworkSubtype` text,
	`homeworkNumber` integer,
	`schoolType` text,
	`hasCorrection` integer DEFAULT false NOT NULL,
	`isHidden` integer DEFAULT false NOT NULL,
	`isFeatured` integer DEFAULT false NOT NULL,
	`viewsCount` integer DEFAULT 0 NOT NULL,
	`downloadsCount` integer DEFAULT 0 NOT NULL,
	`avgRating` real DEFAULT 0 NOT NULL,
	`ratingsCount` integer DEFAULT 0 NOT NULL,
	`commentsCount` integer DEFAULT 0 NOT NULL,
	`favoritesCount` integer DEFAULT 0 NOT NULL,
	`publishedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON UPDATE no action ON DELETE SET NULL,
	FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON UPDATE no action ON DELETE SET NULL,
	FOREIGN KEY (`subjectId`) REFERENCES `Subject`(`id`) ON UPDATE no action ON DELETE Restrict,
	FOREIGN KEY (`teacherId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Resource_numericId_unique` ON `Resource` (`numericId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Resource_fileUrl_unique` ON `Resource` (`fileUrl`);--> statement-breakpoint
CREATE INDEX `resource_slug_idx` ON `Resource` (`slug`);--> statement-breakpoint
CREATE INDEX `resource_status_idx` ON `Resource` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_numeric_id_idx` ON `Resource` (`numericId`);--> statement-breakpoint
CREATE INDEX `resource_subject_class_idx` ON `Resource` (`subjectId`,`classId`);--> statement-breakpoint
CREATE INDEX `resource_teacher_idx` ON `Resource` (`teacherId`);--> statement-breakpoint
CREATE INDEX `resource_published_at_idx` ON `Resource` (`publishedAt`);--> statement-breakpoint
CREATE INDEX `resource_type_idx` ON `Resource` (`type`);--> statement-breakpoint
CREATE INDEX `resource_school_type_idx` ON `Resource` (`schoolType`);--> statement-breakpoint
CREATE INDEX `resource_has_correction_idx` ON `Resource` (`hasCorrection`);--> statement-breakpoint
CREATE INDEX `resource_views_idx` ON `Resource` (`viewsCount`);--> statement-breakpoint
CREATE INDEX `resource_downloads_idx` ON `Resource` (`downloadsCount`);--> statement-breakpoint
CREATE TABLE `SearchLog` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`userId` text,
	`ipAddress` text,
	`resultsCount` integer DEFAULT 0 NOT NULL,
	`clickedResourceId` text,
	`locale` text DEFAULT 'fr' NOT NULL,
	`source` text DEFAULT 'search_bar' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL,
	FOREIGN KEY (`clickedResourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `search_log_query_idx` ON `SearchLog` (`query`);--> statement-breakpoint
CREATE INDEX `search_log_user_idx` ON `SearchLog` (`userId`);--> statement-breakpoint
CREATE INDEX `search_log_created_at_idx` ON `SearchLog` (`createdAt`);--> statement-breakpoint
CREATE TABLE `SearchSynonym` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`synonyms` text NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `synonym_term_idx` ON `SearchSynonym` (`term`);--> statement-breakpoint
CREATE INDEX `synonym_locale_idx` ON `SearchSynonym` (`locale`);--> statement-breakpoint
CREATE TABLE `Section` (
	`id` text PRIMARY KEY NOT NULL,
	`numericId` integer,
	`slug` text NOT NULL,
	`nameFr` text NOT NULL,
	`nameAr` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Section_numericId_unique` ON `Section` (`numericId`);--> statement-breakpoint
CREATE INDEX `section_slug_idx` ON `Section` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `section_numeric_id_idx` ON `Section` (`numericId`);--> statement-breakpoint
CREATE TABLE `Session` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`userAgent` text,
	`ipAddress` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Session_token_unique` ON `Session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `Session` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_idx` ON `Session` (`token`);--> statement-breakpoint
CREATE TABLE `Setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Share` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text,
	`platform` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `Subject` (
	`id` text PRIMARY KEY NOT NULL,
	`numericId` integer,
	`slug` text NOT NULL,
	`nameFr` text NOT NULL,
	`nameAr` text NOT NULL,
	`icon` text,
	`color` text,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Subject_numericId_unique` ON `Subject` (`numericId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Subject_slug_unique` ON `Subject` (`slug`);--> statement-breakpoint
CREATE INDEX `subject_slug_idx` ON `Subject` (`slug`);--> statement-breakpoint
CREATE TABLE `TeacherFile` (
	`id` text PRIMARY KEY NOT NULL,
	`teacherId` text NOT NULL,
	`resourceId` text,
	`fileName` text NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`r2Key` text,
	`r2PdfKey` text,
	`fileSize` integer,
	`mimeType` text,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`teacherId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `teacher_file_teacher_idx` ON `TeacherFile` (`teacherId`);--> statement-breakpoint
CREATE INDEX `teacher_file_resource_idx` ON `TeacherFile` (`resourceId`);--> statement-breakpoint
CREATE TABLE `TeacherInvitation` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`invitedById` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`message` text,
	`expiresAt` integer NOT NULL,
	`acceptedAt` integer,
	`invitationSentAt` integer,
	`invitationActivatedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `TeacherInvitation_token_unique` ON `TeacherInvitation` (`token`);--> statement-breakpoint
CREATE TABLE `TeacherVerificationFile` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` text,
	`fileSize` integer,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewedById` text,
	`reviewedAt` integer,
	`rejectionReason` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE Cascade
);
--> statement-breakpoint
CREATE INDEX `teacher_verif_user_idx` ON `TeacherVerificationFile` (`userId`);--> statement-breakpoint
CREATE INDEX `teacher_verif_status_idx` ON `TeacherVerificationFile` (`status`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`emailVerifiedAt` integer,
	`passwordHash` text,
	`role` text DEFAULT 'STUDENT' NOT NULL,
	`status` text DEFAULT 'PENDING_OTP' NOT NULL,
	`oauthProvider` text,
	`oauthId` text,
	`firstName` text,
	`lastName` text,
	`firstNameAr` text,
	`lastNameAr` text,
	`avatarUrl` text,
	`bio` text,
	`phone` text,
	`website` text,
	`schoolLevel` text,
	`classLevel` text,
	`schoolName` text,
	`schoolNameAr` text,
	`governorate` text,
	`teachingSubjects` text,
	`teachingLevels` text,
	`cvUrl` text,
	`diploma` text,
	`isVerifiedTeacher` integer DEFAULT false NOT NULL,
	`approvedAt` integer,
	`approvedById` text,
	`numericId` integer,
	`slug` text,
	`slugEn` text,
	`uploadsCount` integer DEFAULT 0 NOT NULL,
	`followersCount` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_numericId_unique` ON `User` (`numericId`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `User` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_numeric_id_idx` ON `User` (`numericId`);--> statement-breakpoint
CREATE INDEX `user_slug_idx` ON `User` (`slug`);--> statement-breakpoint
CREATE INDEX `user_role_idx` ON `User` (`role`);--> statement-breakpoint
CREATE TABLE `VercelLog` (
	`id` text PRIMARY KEY NOT NULL,
	`requestId` text,
	`requestPath` text,
	`requestMethod` text,
	`responseStatusCode` integer,
	`userAgent` text,
	`ipAddress` text,
	`country` text,
	`region` text,
	`city` text,
	`durationMs` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vercel_log_path_idx` ON `VercelLog` (`requestPath`);--> statement-breakpoint
CREATE INDEX `vercel_log_status_idx` ON `VercelLog` (`responseStatusCode`);--> statement-breakpoint
CREATE INDEX `vercel_log_created_at_idx` ON `VercelLog` (`createdAt`);--> statement-breakpoint
CREATE TABLE `View` (
	`id` text PRIMARY KEY NOT NULL,
	`resourceId` text NOT NULL,
	`userId` text,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`resourceId`) REFERENCES `Resource`(`id`) ON UPDATE no action ON DELETE Cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `view_resource_idx` ON `View` (`resourceId`);--> statement-breakpoint
CREATE INDEX `view_created_at_idx` ON `View` (`createdAt`);