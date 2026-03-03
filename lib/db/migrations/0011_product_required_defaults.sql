DO $$
DECLARE
  column_record RECORD;
  array_base_type text;
BEGIN
  FOR column_record IN
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Product'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id',
        'name',
        'category',
        'description',
        'priceCents',
        'currency',
        'imageUrl',
        'tags',
        'isActive',
        'createdAt',
        'updatedAt'
      )
  LOOP
    IF column_record.data_type IN ('character varying', 'text') THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT ''''',
        column_record.column_name
      );
    ELSIF column_record.data_type = 'boolean' THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT false',
        column_record.column_name
      );
    ELSIF column_record.data_type IN (
      'smallint',
      'integer',
      'bigint',
      'numeric',
      'real',
      'double precision'
    ) THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT 0',
        column_record.column_name
      );
    ELSIF column_record.data_type IN ('timestamp without time zone', 'timestamp with time zone') THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT now()',
        column_record.column_name
      );
    ELSIF column_record.data_type = 'date' THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT current_date',
        column_record.column_name
      );
    ELSIF column_record.data_type = 'json' THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT ''[]''::json',
        column_record.column_name
      );
    ELSIF column_record.data_type = 'jsonb' THEN
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT ''[]''::jsonb',
        column_record.column_name
      );
    ELSIF column_record.data_type = 'ARRAY' THEN
      array_base_type := CASE
        WHEN left(column_record.udt_name, 1) = '_' THEN substring(column_record.udt_name from 2)
        ELSE 'text'
      END;
      EXECUTE format(
        'ALTER TABLE "Product" ALTER COLUMN %I SET DEFAULT ''{}''::%s[]',
        column_record.column_name,
        array_base_type
      );
    END IF;
  END LOOP;
END $$;
