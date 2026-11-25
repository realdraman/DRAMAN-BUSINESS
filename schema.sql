-- Safe, non-destructive bootstrap/migration entrypoint.
-- This script creates missing objects but never drops public or existing data.
-- Production changes should be represented by additive, reviewed migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add constraints by name only when missing. This prevents rerun conflicts
-- without dropping existing constraints or the data they protect.
CREATE OR REPLACE FUNCTION pg_temp.ensure_constraint(
  p_table TEXT,
  p_constraint TEXT,
  p_definition TEXT
) RETURNS VOID LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = p_table
      AND c.conname = p_constraint
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I %s',
      p_table,
      p_constraint,
      p_definition
    );
  END IF;
END;
$fn$;

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  user_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id BIGINT,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(40),
  employee_id VARCHAR(32),
  password_hash TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  role VARCHAR(40) NOT NULL CHECK (role IN ('Super Admin', 'Admin', 'Loan Officer', 'Cashier', 'Inventory Manager')),
  status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Active', 'Pending', 'Suspended', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, employee_id),
  CHECK (role = 'Super Admin' OR (organization_id IS NOT NULL AND branch_id IS NOT NULL))
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_uuid UUID NOT NULL DEFAULT gen_random_uuid();
DO $$
DECLARE
  approved_by_type TEXT;
BEGIN
  SELECT data_type INTO approved_by_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'approved_by';

  IF approved_by_type = 'uuid' THEN
    ALTER TABLE users RENAME COLUMN approved_by TO approved_by_uuid;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approved_by_fkey;
    ALTER TABLE users ADD COLUMN approved_by BIGINT;
    UPDATE users user_row
    SET approved_by = approver.id
    FROM users approver
    WHERE approver.user_uuid = user_row.approved_by_uuid;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by BIGINT;
SELECT pg_temp.ensure_constraint('users', 'users_user_uuid_key', 'UNIQUE (user_uuid)');
SELECT pg_temp.ensure_constraint('users', 'users_approved_by_fkey', 'FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL');

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS invitation_codes (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('Admin', 'Loan Officer', 'Cashier', 'Inventory Manager')),
  activation_status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (activation_status IN ('Active', 'Pending')),
  code_hash CHAR(64) NOT NULL UNIQUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(180) NOT NULL,
  national_id VARCHAR(40) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  alt_phone VARCHAR(40),
  email VARCHAR(180),
  gender VARCHAR(40),
  dob DATE,
  occupation VARCHAR(140),
  monthly_income NUMERIC(14, 2) DEFAULT 0,
  county VARCHAR(80),
  estate VARCHAR(140),
  address TEXT,
  photo TEXT,
  id_front TEXT,
  id_back TEXT,
  signature TEXT,
  blacklist_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guarantors (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  national_id VARCHAR(40),
  phone VARCHAR(40) NOT NULL,
  relationship VARCHAR(80),
  address TEXT
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  loan_code VARCHAR(40) NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  principal_amount NUMERIC(14, 2) NOT NULL CHECK (principal_amount > 0),
  interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
  processing_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  repayment_frequency VARCHAR(40) NOT NULL CHECK (repayment_frequency IN ('Daily', 'Weekly', 'Monthly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Active', 'Completed', 'Defaulted', 'Cancelled')),
  assigned_officer BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_schedule (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14, 2) NOT NULL,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue')),
  UNIQUE (loan_id, installment_number)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  payment_code VARCHAR(40) NOT NULL UNIQUE,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer', 'Card')),
  transaction_code VARCHAR(120),
  notes TEXT,
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penalties (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id BIGSERIAL PRIMARY KEY,
  product_name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL CHECK (category IN ('Furniture', 'Electronics', 'Phones', 'TVs', 'Woofers', 'Gas cylinders', 'Household items', 'Office furniture')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  buying_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  condition VARCHAR(80),
  serial_number VARCHAR(120),
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  selling_price NUMERIC(14, 2) NOT NULL CHECK (selling_price >= 0),
  payment_type VARCHAR(40) NOT NULL CHECK (payment_type IN ('Cash', 'Installment')),
  down_payment NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer', 'Card')),
  transaction_code VARCHAR(120),
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agreements (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id BIGINT REFERENCES loans(id) ON DELETE CASCADE,
  sale_id BIGINT REFERENCES sales(id) ON DELETE CASCADE,
  agreement_type VARCHAR(80) NOT NULL CHECK (agreement_type IN ('Loan Agreement', 'Guarantor Form', 'Payment Receipt', 'Clearance Certificate', 'Installment Agreement')),
  document_path TEXT NOT NULL,
  qr_verification_code VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_settings (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL DEFAULT 'DRAMAN Loan Services',
  logo_path TEXT,
  contact_phone VARCHAR(40),
  contact_email VARCHAR(180),
  address TEXT,
  receipt_footer TEXT,
  sms_provider VARCHAR(80),
  mpesa_shortcode VARCHAR(80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_settings (
  id BIGSERIAL PRIMARY KEY,
  default_interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 12,
  processing_fee NUMERIC(14, 2) NOT NULL DEFAULT 1000,
  penalty_rate NUMERIC(6, 2) NOT NULL DEFAULT 3,
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  max_auto_approval_amount NUMERIC(14, 2) NOT NULL DEFAULT 50000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE loan_settings ADD COLUMN IF NOT EXISTS processing_fee NUMERIC(14, 2) NOT NULL DEFAULT 1000;

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin (to_tsvector('english', full_name));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE customers
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('customers', 'customers_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('customers', 'customers_id_tenant_branch_uq', 'UNIQUE (id, organization_id, branch_id)');
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_code_key;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_national_id_key;
SELECT pg_temp.ensure_constraint('customers', 'customers_tenant_code_uq', 'UNIQUE (organization_id, customer_code)');
SELECT pg_temp.ensure_constraint('customers', 'customers_tenant_national_id_uq', 'UNIQUE (organization_id, national_id)');

ALTER TABLE guarantors
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE guarantors
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('guarantors', 'guarantors_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('guarantors', 'guarantors_customer_tenant_fk', 'FOREIGN KEY (customer_id, organization_id, branch_id) REFERENCES customers(id, organization_id, branch_id)');

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE loans
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('loans', 'loans_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('loans', 'loans_customer_tenant_fk', 'FOREIGN KEY (customer_id, organization_id, branch_id) REFERENCES customers(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('loans', 'loans_id_tenant_branch_uq', 'UNIQUE (id, organization_id, branch_id)');
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_loan_code_key;
SELECT pg_temp.ensure_constraint('loans', 'loans_tenant_code_uq', 'UNIQUE (organization_id, loan_code)');

ALTER TABLE loan_schedule
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE loan_schedule
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('loan_schedule', 'loan_schedule_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('loan_schedule', 'loan_schedule_loan_tenant_fk', 'FOREIGN KEY (loan_id, organization_id, branch_id) REFERENCES loans(id, organization_id, branch_id)');

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE payments
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('payments', 'payments_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('payments', 'payments_loan_tenant_fk', 'FOREIGN KEY (loan_id, organization_id, branch_id) REFERENCES loans(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('payments', 'payments_customer_tenant_fk', 'FOREIGN KEY (customer_id, organization_id, branch_id) REFERENCES customers(id, organization_id, branch_id)');
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_code_key;
SELECT pg_temp.ensure_constraint('payments', 'payments_tenant_code_uq', 'UNIQUE (organization_id, payment_code)');

ALTER TABLE penalties
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE penalties
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('penalties', 'penalties_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('penalties', 'penalties_loan_tenant_fk', 'FOREIGN KEY (loan_id, organization_id, branch_id) REFERENCES loans(id, organization_id, branch_id)');

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE inventory
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('inventory', 'inventory_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('inventory', 'inventory_id_tenant_branch_uq', 'UNIQUE (id, organization_id, branch_id)');

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT,
  ADD COLUMN IF NOT EXISTS sold_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sales
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('sales', 'sales_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('sales', 'sales_inventory_tenant_fk', 'FOREIGN KEY (inventory_id, organization_id, branch_id) REFERENCES inventory(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('sales', 'sales_customer_tenant_fk', 'FOREIGN KEY (customer_id, organization_id, branch_id) REFERENCES customers(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('sales', 'sales_id_tenant_branch_uq', 'UNIQUE (id, organization_id, branch_id)');

ALTER TABLE installment_payments
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE installment_payments
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('installment_payments', 'installment_payments_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('installment_payments', 'installment_payments_sale_tenant_fk', 'FOREIGN KEY (sale_id, organization_id, branch_id) REFERENCES sales(id, organization_id, branch_id)');

ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE agreements
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('agreements', 'agreements_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('agreements', 'agreements_customer_tenant_fk', 'FOREIGN KEY (customer_id, organization_id, branch_id) REFERENCES customers(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('agreements', 'agreements_loan_tenant_fk', 'FOREIGN KEY (loan_id, organization_id, branch_id) REFERENCES loans(id, organization_id, branch_id)');
SELECT pg_temp.ensure_constraint('agreements', 'agreements_sale_tenant_fk', 'FOREIGN KEY (sale_id, organization_id, branch_id) REFERENCES sales(id, organization_id, branch_id)');

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS organization_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;
SELECT pg_temp.ensure_constraint('activity_logs', 'activity_logs_branch_tenant_fk', 'FOREIGN KEY (branch_id, organization_id) REFERENCES branches(id, organization_id)');
SELECT pg_temp.ensure_constraint('activity_logs', 'activity_logs_user_tenant_fk', 'FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id)');

ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS organization_id BIGINT;
ALTER TABLE loan_settings
  ADD COLUMN IF NOT EXISTS organization_id BIGINT;
ALTER TABLE business_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE loan_settings ALTER COLUMN organization_id SET NOT NULL;
SELECT pg_temp.ensure_constraint('business_settings', 'business_settings_organization_id_key', 'UNIQUE (organization_id)');
SELECT pg_temp.ensure_constraint('business_settings', 'business_settings_organization_id_fkey', 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');
SELECT pg_temp.ensure_constraint('loan_settings', 'loan_settings_organization_id_key', 'UNIQUE (organization_id)');
SELECT pg_temp.ensure_constraint('loan_settings', 'loan_settings_organization_id_fkey', 'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE');

CREATE TABLE IF NOT EXISTS support_override_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id BIGINT REFERENCES organizations(id) ON DELETE RESTRICT,
  scope VARCHAR(30) NOT NULL CHECK (scope IN ('organization', 'platform')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 500),
  action TEXT NOT NULL,
  request_method VARCHAR(12),
  request_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_branch ON customers(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_loans_tenant_branch ON loans(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_branch_date ON payments(organization_id, branch_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_branch ON inventory(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_date ON activity_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_override_audit_tenant_date ON support_override_audit(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens(expires_at);

DO $$
DECLARE
  table_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'branches', 'users', 'invitation_codes', 'customers', 'guarantors', 'loans',
    'loan_schedule', 'payments', 'penalties', 'inventory', 'sales',
    'installment_payments', 'agreements', 'business_settings', 'loan_settings',
    'activity_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'tenant_isolation') THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::bigint) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::bigint)',
        table_name
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'global_read_only') THEN
      EXECUTE format(
        'CREATE POLICY global_read_only ON %I FOR SELECT USING (current_setting(''app.global_read_only'', true) = ''true'')',
        table_name
      );
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'user_self_update'
  ) THEN
    CREATE POLICY user_self_update ON users FOR UPDATE
      USING (id = nullif(current_setting('app.user_id', true), '')::bigint)
      WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::bigint);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'user_self_read'
  ) THEN
    CREATE POLICY user_self_read ON users FOR SELECT
      USING (id = nullif(current_setting('app.user_id', true), '')::bigint);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'platform_bootstrap_super_admin'
  ) THEN
    CREATE POLICY platform_bootstrap_super_admin ON users FOR INSERT
      WITH CHECK (
        role = 'Super Admin'
        AND organization_id IS NULL
        AND branch_id IS NULL
        AND status = 'Active'
        AND current_setting('app.bootstrap_super_admin', true) = 'true'
      );
  END IF;
  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON organizations
      USING (id = nullif(current_setting('app.organization_id', true), '')::bigint)
      WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::bigint);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'global_read_only') THEN
    CREATE POLICY global_read_only ON organizations FOR SELECT
      USING (current_setting('app.global_read_only', true) = 'true');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'platform_create_organization') THEN
    CREATE POLICY platform_create_organization ON organizations FOR INSERT
      WITH CHECK (current_setting('app.platform_override', true) = 'true');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'branches' AND policyname = 'platform_create_branch') THEN
    CREATE POLICY platform_create_branch ON branches FOR INSERT
      WITH CHECK (current_setting('app.platform_override', true) = 'true');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invitation_codes' AND policyname = 'platform_create_invitation') THEN
    CREATE POLICY platform_create_invitation ON invitation_codes FOR INSERT
      WITH CHECK (current_setting('app.platform_override', true) = 'true');
  END IF;
END $$;

ALTER TABLE support_override_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_override_audit FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_override_audit' AND policyname = 'tenant_audit_read') THEN
    CREATE POLICY tenant_audit_read ON support_override_audit FOR SELECT
      USING (organization_id = nullif(current_setting('app.organization_id', true), '')::bigint);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_override_audit' AND policyname = 'global_audit_read') THEN
    CREATE POLICY global_audit_read ON support_override_audit FOR SELECT
      USING (current_setting('app.global_read_only', true) = 'true');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_override_audit' AND policyname = 'tenant_audit_insert') THEN
    CREATE POLICY tenant_audit_insert ON support_override_audit FOR INSERT
      WITH CHECK (
        organization_id = nullif(current_setting('app.organization_id', true), '')::bigint
        AND current_setting('app.support_override', true) = 'true'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_override_audit' AND policyname = 'platform_audit_insert') THEN
    CREATE POLICY platform_audit_insert ON support_override_audit FOR INSERT
      WITH CHECK (
        organization_id IS NULL
        AND current_setting('app.platform_override', true) = 'true'
      );
  END IF;
END $$;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'password_reset_tokens' AND policyname = 'password_reset_access') THEN
    CREATE POLICY password_reset_access ON password_reset_tokens
      USING (current_setting('app.password_reset', true) = 'true')
      WITH CHECK (current_setting('app.password_reset', true) = 'true');
  END IF;
END $$;
REVOKE UPDATE, DELETE ON support_override_audit FROM PUBLIC;
CREATE OR REPLACE VIEW audit_logs AS
  SELECT id, actor_user_id, organization_id, scope, reason, action,
         request_method, request_path, created_at
  FROM support_override_audit;
INSERT INTO schema_migrations(name)
VALUES ('001_initial_tenant_schema')
ON CONFLICT (name) DO UPDATE SET applied_at = EXCLUDED.applied_at;
COMMIT;
