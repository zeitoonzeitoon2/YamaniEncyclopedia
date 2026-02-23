/*
  Warnings:

  - A unique constraint covering the columns `[domainId,domainWing,ownerDomainId,ownerWing]` on the table `DomainVotingShare` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[postId,adminId,domainId]` on the table `Vote` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "DomainVotingShare_domainId_ownerDomainId_key";

-- DropIndex
DROP INDEX "Vote_postId_adminId_key";

-- AlterTable
ALTER TABLE "DomainInvestment" ADD COLUMN     "contractNumber" SERIAL NOT NULL,
ADD COLUMN     "investedDomainId" TEXT,
ADD COLUMN     "proposerWing" TEXT NOT NULL DEFAULT 'RIGHT',
ADD COLUMN     "targetWing" TEXT NOT NULL DEFAULT 'RIGHT';

-- AlterTable
ALTER TABLE "DomainVotingShare" ADD COLUMN     "domainWing" TEXT NOT NULL DEFAULT 'RIGHT',
ADD COLUMN     "ownerWing" TEXT NOT NULL DEFAULT 'RIGHT';

-- AlterTable
ALTER TABLE "Vote" ADD COLUMN     "domainId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DomainVotingShare_domainId_domainWing_ownerDomainId_ownerWi_key" ON "DomainVotingShare"("domainId", "domainWing", "ownerDomainId", "ownerWing");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_postId_adminId_domainId_key" ON "Vote"("postId", "adminId", "domainId");

-- AddForeignKey
ALTER TABLE "DomainInvestment" ADD CONSTRAINT "DomainInvestment_investedDomainId_fkey" FOREIGN KEY ("investedDomainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
