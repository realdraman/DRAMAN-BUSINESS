INSERT INTO users (full_name, email, phone, password_hash, role, status) VALUES
('Charles Muhoni', 'admin@draman.co.ke', '+254 700 100 001', '$2b$12$replace_with_real_bcrypt_hash', 'Super Admin', 'Active'),
('Mercy Atieno', 'officer@draman.co.ke', '+254 700 100 002', '$2b$12$replace_with_real_bcrypt_hash', 'Loan Officer', 'Active'),
('Peter Maina', 'cashier@draman.co.ke', '+254 700 100 003', '$2b$12$replace_with_real_bcrypt_hash', 'Cashier', 'Active'),
('Amina Hassan', 'inventory@draman.co.ke', '+254 700 100 004', '$2b$12$replace_with_real_bcrypt_hash', 'Inventory Manager', 'Active');

INSERT INTO inventory (product_name, category, quantity, buying_price, selling_price, description, condition, serial_number) VALUES
('Office Desk', 'Office furniture', 8, 9000, 13500, 'Sturdy office desk suitable for home offices, loan offices, or small retail counters.', 'Second-hand good', 'FUR-OD-001'),
('Samsung 43 inch TV', 'TVs', 2, 21000, 29500, 'Clear display television with tested ports, remote support, and installment-sale potential.', 'Used excellent', 'TV-SAM-043'),
('Gas Cylinder 13kg', 'Gas cylinders', 1, 5200, 7600, 'Refurbished 13kg gas cylinder inspected for household resale and quick turnover.', 'Refurbished', 'GAS-13-091'),
('Three-Seater Sofa', 'Furniture', 5, 18000, 26500, 'Comfortable three-seater sofa for living rooms, staged for direct or installment purchase.', 'Second-hand good', 'SOFA-3S-022');

INSERT INTO business_settings (company_name, contact_phone, contact_email, address, receipt_footer) VALUES
('DRAMAN Loan Services', '+254 700 100 000', 'info@draman.co.ke', 'Nairobi, Kenya', 'Thank you for choosing DRAMAN Loan Services.');

INSERT INTO loan_settings (default_interest_rate, penalty_rate, grace_period_days, max_auto_approval_amount) VALUES
(12, 3, 3, 50000);
