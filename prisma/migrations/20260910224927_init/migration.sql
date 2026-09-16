-- CreateEnum
CREATE TYPE "Chamber" AS ENUM ('HOUSE', 'SENATE');

-- CreateEnum
CREATE TYPE "VotePosition" AS ENUM ('YEA', 'NAY', 'PRESENT', 'NOT_VOTING');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "bioguideId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "state" TEXT NOT NULL,
    "district" INTEGER,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "congress" INTEGER NOT NULL,
    "billType" TEXT NOT NULL,
    "billNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "policyArea" TEXT,
    "summary" TEXT,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "position" "VotePosition" NOT NULL,
    "rollCall" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "electionYear" INTEGER NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "state" TEXT NOT NULL,
    "district" INTEGER,
    "democratId" TEXT NOT NULL,
    "republicanId" TEXT NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_bioguideId_key" ON "Member"("bioguideId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_congress_billType_billNumber_key" ON "Bill"("congress", "billType", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_memberId_billId_key" ON "Vote"("memberId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "Race_state_district_electionYear_chamber_key" ON "Race"("state", "district", "electionYear", "chamber");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_democratId_fkey" FOREIGN KEY ("democratId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_republicanId_fkey" FOREIGN KEY ("republicanId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
