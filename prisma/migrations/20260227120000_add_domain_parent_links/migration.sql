CREATE TABLE IF NOT EXISTS "DomainParentLink" (
  "id" TEXT NOT NULL,
  "childDomainId" TEXT NOT NULL,
  "parentDomainId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomainParentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DomainParentLink_childDomainId_parentDomainId_key"
  ON "DomainParentLink"("childDomainId", "parentDomainId");
CREATE INDEX IF NOT EXISTS "DomainParentLink_childDomainId_idx"
  ON "DomainParentLink"("childDomainId");
CREATE INDEX IF NOT EXISTS "DomainParentLink_parentDomainId_idx"
  ON "DomainParentLink"("parentDomainId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DomainParentLink_childDomainId_fkey'
  ) THEN
    ALTER TABLE "DomainParentLink"
      ADD CONSTRAINT "DomainParentLink_childDomainId_fkey"
      FOREIGN KEY ("childDomainId") REFERENCES "Domain"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DomainParentLink_parentDomainId_fkey'
  ) THEN
    ALTER TABLE "DomainParentLink"
      ADD CONSTRAINT "DomainParentLink_parentDomainId_fkey"
      FOREIGN KEY ("parentDomainId") REFERENCES "Domain"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "DomainParentLink" ("id", "childDomainId", "parentDomainId", "order")
SELECT md5(random()::text || clock_timestamp()::text), d."id", d."parentId", 0
FROM "Domain" d
WHERE d."parentId" IS NOT NULL
ON CONFLICT ("childDomainId", "parentDomainId") DO NOTHING;
