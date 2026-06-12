DO $migration$
BEGIN
    IF to_regprocedure('uuidv7()') IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.uuidv7()
            RETURNS uuid
            LANGUAGE sql
            VOLATILE
            PARALLEL SAFE
            AS $body$
                WITH parts AS (
                    SELECT
                        lpad(
                            to_hex(
                                floor(
                                    extract(epoch FROM clock_timestamp()) * 1000
                                )::bigint
                            ),
                            12,
                            '0'
                        ) AS timestamp_hex,
                        replace(gen_random_uuid()::text, '-', '') AS random_hex
                )
                SELECT (
                    substr(timestamp_hex, 1, 8) || '-' ||
                    substr(timestamp_hex, 9, 4) || '-' ||
                    '7' || substr(random_hex, 1, 3) || '-' ||
                    substr('89ab', 1 + floor(random() * 4)::integer, 1) ||
                    substr(random_hex, 4, 3) || '-' ||
                    substr(random_hex, 7, 12)
                )::uuid
                FROM parts
            $body$
        $function$;
    END IF;
END
$migration$;

ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "AnonymousSession" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "AuthSession" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "AuthSession" ALTER COLUMN "refresh_jti" SET DEFAULT uuidv7();
ALTER TABLE "Chat" ALTER COLUMN "id" SET DEFAULT uuidv7();
ALTER TABLE "Message" ALTER COLUMN "id" SET DEFAULT uuidv7();
