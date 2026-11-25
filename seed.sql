-- Set app.initial_super_admin_password and app.initial_tenant_admin_password
-- in the provisioning session before running this seed. Passwords are checked
-- and hashed by pgcrypto; only the bcrypt hashes are persisted.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO organizations (id, name) VALUES (1, 'DRAMAN Loan Services')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, organization_id, name) VALUES (1, 1, 'Main Branch')
ON CONFLICT (id, organization_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('organizations', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM organizations), 1), 1), true);
SELECT setval(pg_get_serial_sequence('branches', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM branches), 1), 1), true);

DO $seed$
DECLARE
  super_admin_password TEXT := current_setting('app.initial_super_admin_password', true);
  tenant_admin_password TEXT := current_setting('app.initial_tenant_admin_password', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'platform-admin@draman.local') THEN
    IF super_admin_password IS NULL OR length(super_admin_password) < 16
      OR super_admin_password !~ '[A-Z]'
      OR super_admin_password !~ '[a-z]'
      OR super_admin_password !~ '[0-9]'
      OR super_admin_password !~ '[^A-Za-z0-9]' THEN
      RAISE EXCEPTION 'Supply a unique Super Admin password of at least 16 characters, including upper/lowercase letters, a number, and a symbol.';
    END IF;
    INSERT INTO users (full_name, email, password_hash, role, status)
    VALUES (
      'Platform Administrator',
      'platform-admin@draman.local',
      crypt(super_admin_password, gen_salt('bf', 12)),
      'Super Admin',
      'Active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = 'admin@draman.local') THEN
    IF tenant_admin_password IS NULL OR length(tenant_admin_password) < 16
      OR tenant_admin_password !~ '[A-Z]'
      OR tenant_admin_password !~ '[a-z]'
      OR tenant_admin_password !~ '[0-9]'
      OR tenant_admin_password !~ '[^A-Za-z0-9]'
      OR tenant_admin_password = super_admin_password THEN
      RAISE EXCEPTION 'Supply a different tenant Admin password of at least 16 characters, including upper/lowercase letters, a number, and a symbol.';
    END IF;
    INSERT INTO users
      (organization_id, branch_id, full_name, email, password_hash, role, status, approved_at, approved_by)
    SELECT
      organization.id,
      branch.id,
      'Organization Administrator',
      'admin@draman.local',
      crypt(tenant_admin_password, gen_salt('bf', 12)),
      'Admin',
      'Active',
      NOW(),
      platform_user.user_uuid
    FROM organizations organization
    JOIN branches branch ON branch.organization_id = organization.id AND branch.name = 'Main Branch'
    JOIN users platform_user ON lower(platform_user.email) = 'platform-admin@draman.local'
    WHERE organization.id = 1
    ORDER BY branch.id
    LIMIT 1;
  END IF;
END;
$seed$;

INSERT INTO inventory (organization_id, branch_id, product_name, category, quantity, buying_price, selling_price, description, condition, serial_number) VALUES
(1, 1, 'Office Desk', 'Office furniture', 8, 9000, 13500, 'Sturdy office desk suitable for home offices, loan offices, or small retail counters.', 'Second-hand good', 'FUR-OD-001'),
(1, 1, 'Samsung 43 inch TV', 'TVs', 2, 21000, 29500, 'Clear display television with tested ports, remote support, and installment-sale potential.', 'Used excellent', 'TV-SAM-043'),
(1, 1, 'Gas Cylinder 13kg', 'Gas cylinders', 1, 5200, 7600, 'Refurbished 13kg gas cylinder inspected for household resale and quick turnover.', 'Refurbished', 'GAS-13-091'),
(1, 1, 'Three-Seater Sofa', 'Furniture', 5, 18000, 26500, 'Comfortable three-seater sofa for living rooms, staged for direct or installment purchase.', 'Second-hand good', 'SOFA-3S-022');

INSERT INTO business_settings (organization_id, company_name, contact_phone, contact_email, address, receipt_footer) VALUES
(1, 'DRAMAN Loan Services', '', '', '', 'Thank you for choosing DRAMAN Loan Services.');

INSERT INTO loan_settings (organization_id, default_interest_rate, penalty_rate, grace_period_days, max_auto_approval_amount) VALUES
(1, 12, 3, 3, 50000);
