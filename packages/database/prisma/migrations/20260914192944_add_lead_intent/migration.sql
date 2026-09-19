-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('BUYER', 'RENTER', 'SELLER', 'LANDLORD');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "intent" "LeadIntent";
