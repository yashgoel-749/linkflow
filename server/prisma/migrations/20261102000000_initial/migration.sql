CREATE TABLE "User" (
 "id" UUID NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Session" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "Domain" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "hostname" TEXT NOT NULL, "proof" TEXT NOT NULL,
 "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Domain_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");
CREATE TABLE "Link" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "title" TEXT NOT NULL, "destination" TEXT NOT NULL,
 "slug" TEXT NOT NULL, "domain" TEXT NOT NULL, "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "category" TEXT NOT NULL DEFAULT 'Uncategorized', "passwordHash" TEXT,
 "expiresAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Link_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Link_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Link_domain_slug_key" ON "Link"("domain", "slug");
CREATE INDEX "Link_userId_deletedAt_createdAt_idx" ON "Link"("userId", "deletedAt", "createdAt");
CREATE TABLE "Alias" (
 "domain" TEXT NOT NULL, "slug" TEXT NOT NULL, "linkId" UUID NOT NULL,
 CONSTRAINT "Alias_pkey" PRIMARY KEY ("domain", "slug"),
 CONSTRAINT "Alias_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Alias_linkId_idx" ON "Alias"("linkId");
CREATE TABLE "Click" (
 "id" BIGSERIAL NOT NULL, "linkId" UUID NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "visitorHash" TEXT NOT NULL,
 "channel" TEXT NOT NULL, "referrer" TEXT, "device" TEXT NOT NULL, "system" TEXT NOT NULL,
 CONSTRAINT "Click_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Click_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Click_linkId_occurredAt_idx" ON "Click"("linkId", "occurredAt");
CREATE INDEX "Click_occurredAt_idx" ON "Click"("occurredAt");
