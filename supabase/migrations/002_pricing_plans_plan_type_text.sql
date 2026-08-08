-- Allow admin CRUD for custom pricing plans beyond fixed enum values
ALTER TABLE pricing_plans
  ALTER COLUMN plan_type TYPE text USING plan_type::text;

DROP TYPE IF EXISTS plan_type;
