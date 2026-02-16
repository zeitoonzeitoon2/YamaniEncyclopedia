-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainExpert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EXPERT',
    "wing" TEXT NOT NULL DEFAULT 'RIGHT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainExpert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertCandidacy" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "proposerUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EXPERT',
    "wing" TEXT NOT NULL DEFAULT 'RIGHT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "roundId" TEXT,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertCandidacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionRound" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "wing" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidacyVote" (
    "candidacyId" TEXT NOT NULL,
    "voterUserId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidacyVote_pkey" PRIMARY KEY ("candidacyId","voterUserId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "image" TEXT,
    "bio" TEXT,
    "avatarBytes" BYTEA,
    "avatarMime" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "description" TEXT,
    "syllabus" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseVote" (
    "courseId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseVote_pkey" PRIMARY KEY ("courseId","voterId")
);

-- CreateTable
CREATE TABLE "CourseChapter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "changeReason" JSONB,
    "originalChapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterVote" (
    "chapterId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterVote_pkey" PRIMARY KEY ("chapterId","voterId")
);

-- CreateTable
CREATE TABLE "CourseChapterProgress" (
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseChapterProgress_pkey" PRIMARY KEY ("userId","chapterId")
);

-- CreateTable
CREATE TABLE "UserCourse" (
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "examinerId" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("userId","courseId")
);

-- CreateTable
CREATE TABLE "DomainRequirement" (
    "domainId" TEXT NOT NULL,
    "requiredCourseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainRequirement_pkey" PRIMARY KEY ("domainId","requiredCourseId","action")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examinerId" TEXT,
    "meetLink" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "articlesData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL DEFAULT 'TREE',
    "version" INTEGER,
    "revisionNumber" INTEGER,
    "domainId" TEXT,
    "relatedDomainIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT NOT NULL,
    "changeReason" JSONB,
    "changeSummary" TEXT,
    "originalPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "postId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tag" TEXT,
    "postId" TEXT,
    "chapterId" TEXT,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CommentPoll" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "question" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentPollOption" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,

    CONSTRAINT "CommentPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePrerequisite" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "prerequisiteCourseId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STUDY',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrerequisiteVote" (
    "prerequisiteId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrerequisiteVote_pkey" PRIMARY KEY ("prerequisiteId","voterId")
);

-- CreateTable
CREATE TABLE "DomainExchangeProposal" (
    "id" TEXT NOT NULL,
    "proposerDomainId" TEXT NOT NULL,
    "targetDomainId" TEXT NOT NULL,
    "percentageProposerToTarget" DOUBLE PRECISION NOT NULL,
    "percentageTargetToProposer" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainExchangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainExchangeVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainExchangeVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainProposal" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "newName" TEXT,
    "slug" TEXT,
    "description" TEXT,
    "reason" TEXT,
    "parentId" TEXT,
    "targetDomainId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainProposalVote" (
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainProposalVote_pkey" PRIMARY KEY ("proposalId","voterId")
);

-- CreateTable
CREATE TABLE "ChapterQuestion" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVote" (
    "questionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionVote_pkey" PRIMARY KEY ("questionId","voterId")
);

-- CreateTable
CREATE TABLE "DomainVotingShare" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "ownerDomainId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainVotingShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainInvestment" (
    "id" TEXT NOT NULL,
    "proposerDomainId" TEXT NOT NULL,
    "targetDomainId" TEXT NOT NULL,
    "percentageInvested" DOUBLE PRECISION NOT NULL,
    "percentageReturn" DOUBLE PRECISION NOT NULL,
    "durationYears" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainInvestmentVote" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainInvestmentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainPrerequisite" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainPrerequisiteVote" (
    "prerequisiteId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "vote" TEXT NOT NULL DEFAULT 'APPROVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainPrerequisiteVote_pkey" PRIMARY KEY ("prerequisiteId","voterId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_slug_key" ON "Domain"("slug");

-- CreateIndex
CREATE INDEX "Domain_parentId_idx" ON "Domain"("parentId");

-- CreateIndex
CREATE INDEX "DomainExpert_domainId_idx" ON "DomainExpert"("domainId");

-- CreateIndex
CREATE INDEX "DomainExpert_userId_idx" ON "DomainExpert"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainExpert_userId_domainId_key" ON "DomainExpert"("userId", "domainId");

-- CreateIndex
CREATE INDEX "ExpertCandidacy_domainId_idx" ON "ExpertCandidacy"("domainId");

-- CreateIndex
CREATE INDEX "ExpertCandidacy_candidateUserId_idx" ON "ExpertCandidacy"("candidateUserId");

-- CreateIndex
CREATE INDEX "ExpertCandidacy_proposerUserId_idx" ON "ExpertCandidacy"("proposerUserId");

-- CreateIndex
CREATE INDEX "ExpertCandidacy_roundId_idx" ON "ExpertCandidacy"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertCandidacy_domainId_candidateUserId_key" ON "ExpertCandidacy"("domainId", "candidateUserId");

-- CreateIndex
CREATE INDEX "ElectionRound_domainId_idx" ON "ElectionRound"("domainId");

-- CreateIndex
CREATE INDEX "CandidacyVote_voterUserId_idx" ON "CandidacyVote"("voterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Course_domainId_idx" ON "Course"("domainId");

-- CreateIndex
CREATE INDEX "Course_isActive_idx" ON "Course"("isActive");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_proposerId_idx" ON "Course"("proposerId");

-- CreateIndex
CREATE INDEX "CourseVote_voterId_idx" ON "CourseVote"("voterId");

-- CreateIndex
CREATE INDEX "CourseChapter_courseId_idx" ON "CourseChapter"("courseId");

-- CreateIndex
CREATE INDEX "CourseChapter_authorId_idx" ON "CourseChapter"("authorId");

-- CreateIndex
CREATE INDEX "CourseChapter_status_idx" ON "CourseChapter"("status");

-- CreateIndex
CREATE INDEX "CourseChapter_originalChapterId_idx" ON "CourseChapter"("originalChapterId");

-- CreateIndex
CREATE INDEX "CourseChapter_orderIndex_idx" ON "CourseChapter"("orderIndex");

-- CreateIndex
CREATE INDEX "CourseChapter_version_idx" ON "CourseChapter"("version");

-- CreateIndex
CREATE INDEX "ChapterVote_voterId_idx" ON "ChapterVote"("voterId");

-- CreateIndex
CREATE INDEX "CourseChapterProgress_chapterId_idx" ON "CourseChapterProgress"("chapterId");

-- CreateIndex
CREATE INDEX "UserCourse_courseId_idx" ON "UserCourse"("courseId");

-- CreateIndex
CREATE INDEX "UserCourse_status_idx" ON "UserCourse"("status");

-- CreateIndex
CREATE INDEX "UserCourse_examinerId_idx" ON "UserCourse"("examinerId");

-- CreateIndex
CREATE INDEX "DomainRequirement_requiredCourseId_idx" ON "DomainRequirement"("requiredCourseId");

-- CreateIndex
CREATE INDEX "DomainRequirement_action_idx" ON "DomainRequirement"("action");

-- CreateIndex
CREATE INDEX "ExamSession_courseId_idx" ON "ExamSession"("courseId");

-- CreateIndex
CREATE INDEX "ExamSession_studentId_idx" ON "ExamSession"("studentId");

-- CreateIndex
CREATE INDEX "ExamSession_examinerId_idx" ON "ExamSession"("examinerId");

-- CreateIndex
CREATE INDEX "ExamSession_scheduledAt_idx" ON "ExamSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "ExamSession_status_idx" ON "ExamSession"("status");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_originalPostId_idx" ON "Post"("originalPostId");

-- CreateIndex
CREATE INDEX "Post_version_idx" ON "Post"("version");

-- CreateIndex
CREATE INDEX "Post_domainId_idx" ON "Post"("domainId");

-- CreateIndex
CREATE INDEX "Vote_postId_idx" ON "Vote"("postId");

-- CreateIndex
CREATE INDEX "Vote_adminId_idx" ON "Vote"("adminId");

-- CreateIndex
CREATE INDEX "Vote_createdAt_idx" ON "Vote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_postId_adminId_key" ON "Vote"("postId", "adminId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_chapterId_idx" ON "Comment"("chapterId");

-- CreateIndex
CREATE INDEX "Comment_category_idx" ON "Comment"("category");

-- CreateIndex
CREATE INDEX "Comment_tag_idx" ON "Comment"("tag");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRead_userId_postId_key" ON "CommentRead"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_createdAt_idx" ON "Article"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommentPoll_commentId_key" ON "CommentPoll"("commentId");

-- CreateIndex
CREATE INDEX "CommentPoll_createdById_idx" ON "CommentPoll"("createdById");

-- CreateIndex
CREATE INDEX "CommentPoll_createdAt_idx" ON "CommentPoll"("createdAt");

-- CreateIndex
CREATE INDEX "CommentPollOption_pollId_idx" ON "CommentPollOption"("pollId");

-- CreateIndex
CREATE INDEX "CommentPollVote_pollId_idx" ON "CommentPollVote"("pollId");

-- CreateIndex
CREATE INDEX "CommentPollVote_optionId_idx" ON "CommentPollVote"("optionId");

-- CreateIndex
CREATE INDEX "CommentPollVote_voterId_idx" ON "CommentPollVote"("voterId");

-- CreateIndex
CREATE INDEX "CommentPollVote_createdAt_idx" ON "CommentPollVote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommentPollVote_pollId_voterId_key" ON "CommentPollVote"("pollId", "voterId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_examSessionId_idx" ON "ChatMessage"("examSessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_courseId_idx" ON "CoursePrerequisite"("courseId");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_prerequisiteCourseId_idx" ON "CoursePrerequisite"("prerequisiteCourseId");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_status_idx" ON "CoursePrerequisite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrerequisite_courseId_prerequisiteCourseId_type_key" ON "CoursePrerequisite"("courseId", "prerequisiteCourseId", "type");

-- CreateIndex
CREATE INDEX "PrerequisiteVote_voterId_idx" ON "PrerequisiteVote"("voterId");

-- CreateIndex
CREATE INDEX "DomainExchangeProposal_proposerDomainId_idx" ON "DomainExchangeProposal"("proposerDomainId");

-- CreateIndex
CREATE INDEX "DomainExchangeProposal_targetDomainId_idx" ON "DomainExchangeProposal"("targetDomainId");

-- CreateIndex
CREATE INDEX "DomainExchangeProposal_status_idx" ON "DomainExchangeProposal"("status");

-- CreateIndex
CREATE INDEX "DomainExchangeVote_proposalId_idx" ON "DomainExchangeVote"("proposalId");

-- CreateIndex
CREATE INDEX "DomainExchangeVote_voterId_idx" ON "DomainExchangeVote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainExchangeVote_proposalId_voterId_domainId_key" ON "DomainExchangeVote"("proposalId", "voterId", "domainId");

-- CreateIndex
CREATE INDEX "DomainProposal_status_idx" ON "DomainProposal"("status");

-- CreateIndex
CREATE INDEX "DomainProposalVote_voterId_idx" ON "DomainProposalVote"("voterId");

-- CreateIndex
CREATE INDEX "ChapterQuestion_chapterId_idx" ON "ChapterQuestion"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterQuestion_status_idx" ON "ChapterQuestion"("status");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "QuestionVote_voterId_idx" ON "QuestionVote"("voterId");

-- CreateIndex
CREATE INDEX "DomainVotingShare_domainId_idx" ON "DomainVotingShare"("domainId");

-- CreateIndex
CREATE INDEX "DomainVotingShare_ownerDomainId_idx" ON "DomainVotingShare"("ownerDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainVotingShare_domainId_ownerDomainId_key" ON "DomainVotingShare"("domainId", "ownerDomainId");

-- CreateIndex
CREATE INDEX "DomainInvestment_proposerDomainId_idx" ON "DomainInvestment"("proposerDomainId");

-- CreateIndex
CREATE INDEX "DomainInvestment_targetDomainId_idx" ON "DomainInvestment"("targetDomainId");

-- CreateIndex
CREATE INDEX "DomainInvestment_status_idx" ON "DomainInvestment"("status");

-- CreateIndex
CREATE INDEX "DomainInvestmentVote_investmentId_idx" ON "DomainInvestmentVote"("investmentId");

-- CreateIndex
CREATE INDEX "DomainInvestmentVote_voterId_idx" ON "DomainInvestmentVote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainInvestmentVote_investmentId_voterId_domainId_key" ON "DomainInvestmentVote"("investmentId", "voterId", "domainId");

-- CreateIndex
CREATE INDEX "DomainPrerequisite_domainId_idx" ON "DomainPrerequisite"("domainId");

-- CreateIndex
CREATE INDEX "DomainPrerequisite_courseId_idx" ON "DomainPrerequisite"("courseId");

-- CreateIndex
CREATE INDEX "DomainPrerequisite_status_idx" ON "DomainPrerequisite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DomainPrerequisite_domainId_courseId_key" ON "DomainPrerequisite"("domainId", "courseId");

-- CreateIndex
CREATE INDEX "DomainPrerequisiteVote_voterId_idx" ON "DomainPrerequisiteVote"("voterId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExpert" ADD CONSTRAINT "DomainExpert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExpert" ADD CONSTRAINT "DomainExpert_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCandidacy" ADD CONSTRAINT "ExpertCandidacy_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCandidacy" ADD CONSTRAINT "ExpertCandidacy_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCandidacy" ADD CONSTRAINT "ExpertCandidacy_proposerUserId_fkey" FOREIGN KEY ("proposerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCandidacy" ADD CONSTRAINT "ExpertCandidacy_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ElectionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionRound" ADD CONSTRAINT "ElectionRound_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidacyVote" ADD CONSTRAINT "CandidacyVote_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "ExpertCandidacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidacyVote" ADD CONSTRAINT "CandidacyVote_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVote" ADD CONSTRAINT "CourseVote_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVote" ADD CONSTRAINT "CourseVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseChapter" ADD CONSTRAINT "CourseChapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseChapter" ADD CONSTRAINT "CourseChapter_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseChapter" ADD CONSTRAINT "CourseChapter_originalChapterId_fkey" FOREIGN KEY ("originalChapterId") REFERENCES "CourseChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterVote" ADD CONSTRAINT "ChapterVote_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterVote" ADD CONSTRAINT "ChapterVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseChapterProgress" ADD CONSTRAINT "CourseChapterProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseChapterProgress" ADD CONSTRAINT "CourseChapterProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRequirement" ADD CONSTRAINT "DomainRequirement_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRequirement" ADD CONSTRAINT "DomainRequirement_requiredCourseId_fkey" FOREIGN KEY ("requiredCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPoll" ADD CONSTRAINT "CommentPoll_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPoll" ADD CONSTRAINT "CommentPoll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPollOption" ADD CONSTRAINT "CommentPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "CommentPoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPollVote" ADD CONSTRAINT "CommentPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "CommentPoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPollVote" ADD CONSTRAINT "CommentPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CommentPollOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPollVote" ADD CONSTRAINT "CommentPollVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_prerequisiteCourseId_fkey" FOREIGN KEY ("prerequisiteCourseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrerequisiteVote" ADD CONSTRAINT "PrerequisiteVote_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "CoursePrerequisite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrerequisiteVote" ADD CONSTRAINT "PrerequisiteVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExchangeProposal" ADD CONSTRAINT "DomainExchangeProposal_proposerDomainId_fkey" FOREIGN KEY ("proposerDomainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExchangeProposal" ADD CONSTRAINT "DomainExchangeProposal_targetDomainId_fkey" FOREIGN KEY ("targetDomainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExchangeVote" ADD CONSTRAINT "DomainExchangeVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DomainExchangeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExchangeVote" ADD CONSTRAINT "DomainExchangeVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProposal" ADD CONSTRAINT "DomainProposal_targetDomainId_fkey" FOREIGN KEY ("targetDomainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProposal" ADD CONSTRAINT "DomainProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProposalVote" ADD CONSTRAINT "DomainProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DomainProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProposalVote" ADD CONSTRAINT "DomainProposalVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterQuestion" ADD CONSTRAINT "ChapterQuestion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CourseChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterQuestion" ADD CONSTRAINT "ChapterQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ChapterQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVote" ADD CONSTRAINT "QuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ChapterQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVote" ADD CONSTRAINT "QuestionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainVotingShare" ADD CONSTRAINT "DomainVotingShare_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainVotingShare" ADD CONSTRAINT "DomainVotingShare_ownerDomainId_fkey" FOREIGN KEY ("ownerDomainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainInvestment" ADD CONSTRAINT "DomainInvestment_proposerDomainId_fkey" FOREIGN KEY ("proposerDomainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainInvestment" ADD CONSTRAINT "DomainInvestment_targetDomainId_fkey" FOREIGN KEY ("targetDomainId") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainInvestmentVote" ADD CONSTRAINT "DomainInvestmentVote_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "DomainInvestment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainInvestmentVote" ADD CONSTRAINT "DomainInvestmentVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPrerequisite" ADD CONSTRAINT "DomainPrerequisite_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPrerequisite" ADD CONSTRAINT "DomainPrerequisite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPrerequisite" ADD CONSTRAINT "DomainPrerequisite_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPrerequisiteVote" ADD CONSTRAINT "DomainPrerequisiteVote_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "DomainPrerequisite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainPrerequisiteVote" ADD CONSTRAINT "DomainPrerequisiteVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
