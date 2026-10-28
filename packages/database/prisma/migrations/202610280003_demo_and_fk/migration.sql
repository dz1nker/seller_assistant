ALTER TABLE contacts ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE deals ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
-- Check tenant references at transaction completion so a whole workspace can
-- cascade-delete its graph without FK trigger ordering blocking the purge.
DO $$ DECLARE r RECORD; definition TEXT; BEGIN
 FOR r IN SELECT oid, conname, conrelid FROM pg_constraint WHERE contype='f' AND confdeltype='r' AND conrelid IN ('conversations'::regclass,'deals'::regclass)
 LOOP
  definition := replace(pg_get_constraintdef(r.oid), 'ON DELETE RESTRICT', 'ON DELETE NO ACTION');
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.conrelid::regclass, r.conname);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s DEFERRABLE INITIALLY DEFERRED', r.conrelid::regclass, r.conname, definition);
 END LOOP;
END $$;
