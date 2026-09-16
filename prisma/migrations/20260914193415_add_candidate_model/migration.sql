/*
  Warnings:

  - You are about to drop the column `democratId` on the `Race` table. All the data in the column will be lost.
  - You are about to drop the column `republicanId` on the `Race` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_democratId_fkey";

-- DropForeignKey
ALTER TABLE "Race" DROP CONSTRAINT "Race_republicanId_fkey";

-- AlterTable
ALTER TABLE "Race" DROP COLUMN "democratId",
DROP COLUMN "republicanId";

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "fecCandidateId" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "memberId" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceCandidate" (
    "raceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "party" TEXT NOT NULL,

    CONSTRAINT "RaceCandidate_pkey" PRIMARY KEY ("raceId","candidateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_fecCandidateId_key" ON "Candidate"("fecCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_memberId_key" ON "Candidate"("memberId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceCandidate" ADD CONSTRAINT "RaceCandidate_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceCandidate" ADD CONSTRAINT "RaceCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
