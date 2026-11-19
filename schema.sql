CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('Super Admin', 'Loan Officer', 'Cashier', 'Inventory Manager')),
  status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
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

CREATE TABLE guarantors (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  national_id VARCHAR(40),
  phone VARCHAR(40) NOT NULL,
  relationship VARCHAR(80),
  address TEXT
);

CREATE TABLE loans (
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

CREATE TABLE loan_schedule (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14, 2) NOT NULL,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue')),
  UNIQUE (loan_id, installment_number)
);

CREATE TABLE payments (
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

CREATE TABLE penalties (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
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

CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  selling_price NUMERIC(14, 2) NOT NULL CHECK (selling_price >= 0),
  payment_type VARCHAR(40) NOT NULL CHECK (payment_type IN ('Cash', 'Installment')),
  down_payment NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installment_payments (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_paid NUMERIC(14, 2) NOT NULL CHECK (amount_paid > 0),
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer', 'Card')),
  transaction_code VARCHAR(120),
  received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agreements (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id BIGINT REFERENCES loans(id) ON DELETE CASCADE,
  sale_id BIGINT REFERENCES sales(id) ON DELETE CASCADE,
  agreement_type VARCHAR(80) NOT NULL CHECK (agreement_type IN ('Loan Agreement', 'Guarantor Form', 'Payment Receipt', 'Clearance Certificate', 'Installment Agreement')),
  document_path TEXT NOT NULL,
  qr_verification_code VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE business_settings (
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

CREATE TABLE loan_settings (
  id BIGSERIAL PRIMARY KEY,
  default_interest_rate NUMERIC(6, 2) NOT NULL DEFAULT 12,
  penalty_rate NUMERIC(6, 2) NOT NULL DEFAULT 3,
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  max_auto_approval_amount NUMERIC(14, 2) NOT NULL DEFAULT 50000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers USING gin (to_tsvector('english', full_name));
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_loans_customer_id ON loans(customer_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due_date ON loans(due_date);
CREATE INDEX idx_payments_loan_id ON payments(loan_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
