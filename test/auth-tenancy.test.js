const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const { test } = require("node:test");

const sessionSecret = "test-only-session-secret-that-is-long-enough";
const administratorEmail = "platform@example.test";
const administratorPassword = "platform-password-123";
const organization = {
  id: 1,
  name: "DRAMAN Loan Services",
  status: "Active",
  settings: { security: { minimum_password_length: 10, session_timeout_hours: 24, require_unique_staff_ids: true } },
  created_at: new Date().toISOString()
};
const branch = { id: 1, organization_id: 1, name: "Main Branch", status: "Active", created_at: new Date().toISOString() };

function createMockPool(superAdminHash) {
  const state = {
    organizations: [
      organization,
      { id: 2, name: "Other Tenant", status: "Active", settings: organization.settings, created_at: new Date().toISOString() }
    ],
    branches: [branch, { ...branch, id: 2, organization_id: 2, name: "Other Main Branch" }],
    users: [{
      id: 1,
      user_uuid: crypto.randomUUID(),
      approved_by: null,
      full_name: "Platform Administrator",
      email: administratorEmail,
      employee_id: null,
      phone: "",
      organization_id: null,
      branch_id: null,
      password_hash: superAdminHash,
      role: "Super Admin",
      status: "Active",
      session_version: 0,
      created_at: new Date().toISOString()
    }],
    invitations: [],
    audits: [],
    customers: [],
    guarantors: [],
    loans: [],
    schedules: [],
    payments: [],
    inventory: [],
    sales: [],
    salePayments: [],
    passwordResetTokens: [],
    queryLog: [],
    nextUserId: 2,
    nextInvitationId: 1,
    nextCustomerId: 1,
    nextLoanId: 1,
    nextPaymentId: 1,
    nextInventoryId: 1,
    nextSaleId: 1
  };
  const pool = {
    state,
    async connect() {
      return {
        async query(sql, values = []) {
          const query = sql.replace(/\s+/g, " ").trim();
          const normalized = query.toLowerCase();
          state.queryLog.push({ query, values });
          if (/^(begin|commit|rollback)$/i.test(query)) return { rows: [] };
          if (normalized.startsWith("select set_config(")) return { rows: [{ set_config: values[0] }] };

          if (normalized.startsWith("select * from users where lower(email)")) {
            return { rows: state.users.filter((user) => user.email.toLowerCase() === String(values[0]).toLowerCase()).slice(0, 1) };
          }
          if (normalized.startsWith("select * from users where id =")) {
            return { rows: state.users.filter((user) => user.id === Number(values[0])).slice(0, 1) };
          }
          if (normalized.startsWith("select id, name, status, settings from organizations where id =")) {
            return { rows: state.organizations.filter((item) => item.id === Number(values[0])).slice(0, 1) };
          }
          if (normalized.startsWith("select id, name, status from organizations where id =")) {
            return { rows: state.organizations.filter((item) => item.id === Number(values[0])).slice(0, 1) };
          }
          if (normalized.startsWith("select id, name, status, created_at from organizations")) {
            return { rows: [...state.organizations] };
          }
          if (normalized.startsWith("select id, organization_id, name, status from branches where id =")) {
            return { rows: state.branches.filter((item) => item.id === Number(values[0]) && item.organization_id === Number(values[1])).slice(0, 1) };
          }
          if (normalized.startsWith("select id from branches where id =")) {
            return { rows: state.branches.filter((item) => item.id === Number(values[0]) && item.organization_id === Number(values[1]) && item.status === "Active").slice(0, 1) };
          }
          if (normalized.startsWith("select * from invitation_codes") && normalized.includes("for update")) {
            return {
              rows: state.invitations.filter((item) =>
                item.code_hash === values[0] && !item.used_at && !item.revoked_at && new Date(item.expires_at) > new Date()
              ).slice(0, 1)
            };
          }
          if (normalized.startsWith("select id, email, employee_id from users")) {
            return {
              rows: state.users.filter((user) =>
                user.email.toLowerCase() === String(values[0]).toLowerCase() ||
                (values[1] && user.employee_id === values[1] && user.organization_id === Number(values[2]))
              )
            };
          }
          if (normalized.startsWith("insert into users")) {
            const user = {
              id: state.nextUserId++,
              user_uuid: crypto.randomUUID(),
              approved_by: null,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              full_name: values[2],
              email: values[3],
              phone: values[4],
              employee_id: values[5],
              password_hash: values[6],
              role: values[7],
              status: values[8],
              session_version: 0,
              created_at: new Date().toISOString(),
              approved_at: null
            };
            state.users.push(user);
            return { rows: [user] };
          }
          if (normalized.startsWith("update invitation_codes set used_at")) {
            const invitation = state.invitations.find((item) => item.id === Number(values[1]) && !item.used_at && !item.revoked_at);
            if (invitation) {
              invitation.used_at = new Date().toISOString();
              invitation.used_by = Number(values[0]);
            }
            return { rows: invitation ? [invitation] : [] };
          }
          if (normalized.startsWith("insert into support_override_audit")) {
            const audit = {
              id: state.audits.length + 1,
              actor_user_id: Number(values[0]),
              organization_id: values[1] == null ? null : Number(values[1]),
              scope: values[2],
              reason: values[3],
              action: values[4],
              request_method: values[5],
              request_path: values[6],
              created_at: new Date().toISOString()
            };
            state.audits.push(audit);
            return { rows: [audit] };
          }
          if (normalized.startsWith("insert into invitation_codes")) {
            const invitation = {
              id: state.nextInvitationId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              role: values[2],
              activation_status: values[3],
              code_hash: values[4],
              created_by: Number(values[5]),
              created_at: new Date().toISOString(),
              expires_at: new Date(values[6]).toISOString(),
              used_at: null,
              used_by: null,
              revoked_at: null,
              revoked_by: null
            };
            state.invitations.push(invitation);
            return { rows: [invitation] };
          }
          if (normalized.startsWith("select * from invitation_codes where organization_id")) {
            return { rows: state.invitations.filter((item) => item.organization_id === Number(values[0])) };
          }
          if (normalized.startsWith("select * from invitation_codes order by")) {
            return { rows: [...state.invitations] };
          }
          if (normalized.startsWith("update invitation_codes set revoked_at")) {
            const invitation = state.invitations.find((item) =>
              item.id === Number(values[1]) && item.organization_id === Number(values[2]) &&
              !item.used_at && !item.revoked_at && new Date(item.expires_at) > new Date()
            );
            if (invitation) {
              invitation.revoked_at = new Date().toISOString();
              invitation.revoked_by = Number(values[0]);
            }
            return { rows: invitation ? [invitation] : [] };
          }
          if (normalized.startsWith("select * from support_override_audit where organization_id")) {
            return { rows: state.audits.filter((item) => item.organization_id === Number(values[0])) };
          }
          if (normalized.startsWith("select * from support_override_audit order by")) {
            return { rows: [...state.audits] };
          }
          if (normalized.startsWith("select * from users where organization_id")) {
            return { rows: state.users.filter((user) => user.organization_id === Number(values[0])) };
          }
          if (normalized.startsWith("select * from users where role <>")) {
            return { rows: state.users.filter((user) => user.role !== "Super Admin") };
          }
          if (normalized.startsWith("update users set status = 'active'")) {
            const user = state.users.find((item) =>
              item.id === Number(values[2]) && item.organization_id === Number(values[3]) && item.status === "Pending"
            );
            if (user) {
              user.status = "Active";
              user.approved_at = new Date().toISOString();
              user.approved_by = values[0];
              user.branch_id = Number(values[1]);
            }
            return { rows: user ? [user] : [] };
          }
          if (normalized.startsWith("select u.id, u.email, u.status, u.organization_id, o.settings")) {
            return {
              rows: state.users.filter((user) =>
                user.email.toLowerCase() === String(values[0]).toLowerCase()
              ).map((user) => ({ ...user, settings: state.organizations.find((item) => item.id === user.organization_id)?.settings || null }))
            };
          }
          if (normalized.startsWith("select t.id as token_id")) {
            const token = state.passwordResetTokens.find((item) =>
              item.token_hash === values[0] && !item.used_at && new Date(item.expires_at) > new Date()
            );
            const user = token && state.users.find((item) => item.id === token.user_id);
            return {
              rows: token && user ? [{
                token_id: token.id,
                user_id: user.id,
                organization_id: user.organization_id,
                status: user.status,
                settings: state.organizations.find((item) => item.id === user.organization_id)?.settings || null
              }] : []
            };
          }
          if (normalized.startsWith("insert into password_reset_tokens")) {
            const token = {
              id: state.passwordResetTokens.length + 1,
              user_id: Number(values[0]),
              token_hash: values[1],
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              used_at: null
            };
            state.passwordResetTokens.push(token);
            return { rows: [token] };
          }
          if (normalized.startsWith("update password_reset_tokens set used_at")) {
            const tokens = state.passwordResetTokens.filter((item) =>
              item.user_id === Number(values[0]) && !item.used_at
            );
            tokens.forEach((item) => { item.used_at = new Date().toISOString(); });
            return { rows: tokens, rowCount: tokens.length };
          }
          if (normalized.startsWith("update users set password_hash")) {
            const user = state.users.find((item) => item.id === Number(values[1]));
            if (user) {
              user.password_hash = values[0];
              user.session_version += 1;
            }
            return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
          }
          if (normalized.startsWith("update users set session_version = session_version + 1")) {
            const user = state.users.find((item) => item.id === Number(values[0]));
            if (user) user.session_version += 1;
            return { rows: user ? [user] : [] };
          }
          if (normalized.startsWith("select c.*, g.full_name as guarantor_name")) {
            const customers = values.length
              ? state.customers.filter((item) => item.organization_id === Number(values[0]))
              : [...state.customers];
            return { rows: customers };
          }
          if (normalized.startsWith("insert into customers")) {
            const customer = {
              id: state.nextCustomerId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              customer_code: values[2],
              full_name: values[3],
              national_id: values[4],
              phone: values[5],
              alt_phone: values[6],
              email: values[7],
              gender: values[8],
              dob: values[9],
              occupation: values[10],
              monthly_income: values[11],
              county: values[12],
              estate: values[13],
              address: values[14],
              photo: values[15],
              id_front: values[16],
              id_back: values[17],
              signature: values[18],
              created_at: new Date().toISOString()
            };
            state.customers.push(customer);
            return { rows: [customer] };
          }
          if (normalized.startsWith("insert into guarantors")) {
            const guarantor = {
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              customer_id: Number(values[2]),
              full_name: values[3],
              national_id: values[4],
              phone: values[5],
              relationship: values[6],
              address: values[7]
            };
            state.guarantors.push(guarantor);
            return { rows: [guarantor] };
          }
          if (normalized.startsWith("select l.*, c.full_name as customer_name")) {
            const rows = state.loans.filter((item) => !values.length || item.organization_id === Number(values[0]));
            return { rows };
          }
          if (normalized.startsWith("select id, organization_id, branch_id, full_name, phone from customers")) {
            const customer = state.customers.find((item) =>
              item.id === Number(values[0]) && item.organization_id === Number(values[1])
            );
            return { rows: customer ? [customer] : [] };
          }
          if (normalized.startsWith("select max_auto_approval_amount from loan_settings")) return { rows: [] };
          if (normalized.startsWith("insert into loans")) {
            const loan = {
              id: state.nextLoanId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              loan_code: values[2],
              customer_id: Number(values[3]),
              principal_amount: values[4],
              interest_rate: values[5],
              processing_fee: values[6],
              total_payable: values[7],
              total_paid: 0,
              balance: values[7],
              repayment_frequency: values[8],
              start_date: new Date().toISOString().slice(0, 10),
              due_date: values[9],
              status: values[10],
              assigned_officer: values[11],
              approved_by: values[12],
              customer_name: state.customers.find((item) => item.id === Number(values[3]))?.full_name,
              customer_phone: state.customers.find((item) => item.id === Number(values[3]))?.phone,
              assigned_officer_name: "Tenant Administrator",
              created_at: new Date().toISOString()
            };
            state.loans.push(loan);
            return { rows: [loan] };
          }
          if (normalized.startsWith("insert into loan_schedule")) {
            const schedule = {
              id: state.schedules.length + 1,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              loan_id: Number(values[2]),
              installment_number: Number(values[3]),
              due_date: values[4],
              expected_amount: values[5],
              paid_amount: 0,
              status: "Pending"
            };
            state.schedules.push(schedule);
            return { rows: [schedule] };
          }
          if (normalized.startsWith("update loans set status = 'active'")) {
            const loan = state.loans.find((item) =>
              item.id === Number(values[1]) && item.organization_id === Number(values[2]) && item.status === "Pending"
            );
            if (loan) {
              loan.status = "Active";
              loan.approved_by = values[0];
            }
            return { rows: loan ? [loan] : [] };
          }
          if (normalized.startsWith("select p.*, c.full_name as customer_name")) {
            return { rows: state.payments.filter((item) => !values.length || item.organization_id === Number(values[0])) };
          }
          if (normalized.startsWith("select l.*, c.full_name as customer_name, c.phone as customer_phone") && normalized.includes("for update of l")) {
            const loan = state.loans.find((item) =>
              item.id === Number(values[0]) && item.organization_id === Number(values[1]) && item.status !== "Pending"
            );
            const customer = loan && state.customers.find((item) => item.id === loan.customer_id);
            return { rows: loan ? [{ ...loan, customer_name: customer.full_name, customer_phone: customer.phone }] : [] };
          }
          if (normalized.startsWith("insert into payments")) {
            const payment = {
              id: state.nextPaymentId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              payment_code: values[2],
              loan_id: Number(values[3]),
              customer_id: Number(values[4]),
              amount_paid: values[5],
              payment_method: values[6],
              transaction_code: values[7],
              notes: values[8],
              received_by: Number(values[9]),
              payment_date: new Date().toISOString()
            };
            state.payments.push(payment);
            return { rows: [payment] };
          }
          if (normalized.startsWith("update loans set total_paid")) {
            const loan = state.loans.find((item) =>
              item.id === Number(values[1]) && item.organization_id === Number(values[2])
            );
            if (loan) {
              loan.total_paid = Number(loan.total_paid) + Number(values[0]);
              loan.balance = Math.max(0, Number(loan.balance) - Number(values[0]));
              if (!loan.balance) loan.status = "Completed";
            }
            return { rows: loan ? [loan] : [] };
          }
          if (normalized.startsWith("select id, expected_amount, paid_amount from loan_schedule")) {
            return { rows: state.schedules.filter((item) =>
              item.loan_id === Number(values[0]) && item.organization_id === Number(values[1])
            ) };
          }
          if (normalized.startsWith("update loan_schedule set paid_amount")) {
            const installment = state.schedules.find((item) =>
              item.id === Number(values[2]) && item.organization_id === Number(values[3])
            );
            if (installment) {
              installment.paid_amount = Number(values[0]);
              installment.status = installment.paid_amount >= Number(installment.expected_amount) ? "Paid" : "Partially Paid";
            }
            return { rows: installment ? [installment] : [] };
          }
          if (normalized.startsWith("select * from inventory where id = $1 and organization_id = $2 for update")) {
            return { rows: state.inventory.filter((item) =>
              item.id === Number(values[0]) && item.organization_id === Number(values[1])
            ) };
          }
          if (normalized.startsWith("select * from inventory")) {
            return { rows: state.inventory.filter((item) => !values.length || item.organization_id === Number(values[0])) };
          }
          if (normalized.startsWith("insert into inventory")) {
            const product = {
              id: state.nextInventoryId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              product_name: values[2],
              category: values[3],
              quantity: values[4],
              buying_price: values[5],
              selling_price: values[6],
              description: values[7],
              condition: values[8],
              serial_number: values[9],
              image: values[10],
              created_at: new Date().toISOString()
            };
            state.inventory.push(product);
            return { rows: [product] };
          }
          if (normalized.startsWith("insert into sales")) {
            const sale = {
              id: state.nextSaleId++,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              customer_id: values[2] == null ? null : Number(values[2]),
              inventory_id: Number(values[3]),
              quantity: values[4],
              selling_price: values[5],
              payment_type: values[6],
              down_payment: values[7],
              balance: values[8],
              sold_by: Number(values[9]),
              sale_date: new Date().toISOString()
            };
            state.sales.push(sale);
            return { rows: [sale] };
          }
          if (normalized.startsWith("update inventory set quantity")) {
            const product = state.inventory.find((item) =>
              item.id === Number(values[1]) && item.organization_id === Number(values[2])
            );
            if (product) product.quantity -= Number(values[0]);
            return { rows: product ? [product] : [] };
          }
          if (normalized.startsWith("insert into installment_payments")) {
            const payment = {
              id: state.salePayments.length + 1,
              organization_id: Number(values[0]),
              branch_id: Number(values[1]),
              sale_id: Number(values[2]),
              amount_paid: values[3],
              payment_method: values[4],
              transaction_code: values[5],
              received_by: Number(values[6])
            };
            state.salePayments.push(payment);
            return { rows: [payment] };
          }
          if (normalized.startsWith("select s.*, i.product_name, c.full_name as customer_name")) {
            const sale = state.sales.find((item) =>
              item.id === Number(values[0]) && item.organization_id === Number(values[1])
            );
            const product = sale && state.inventory.find((item) => item.id === sale.inventory_id);
            const customer = sale && state.customers.find((item) => item.id === sale.customer_id);
            return { rows: sale ? [{ ...sale, product_name: product.product_name, customer_name: customer?.full_name }] : [] };
          }
          if (normalized.startsWith("update sales set balance")) {
            const sale = state.sales.find((item) =>
              item.id === Number(values[1]) && item.organization_id === Number(values[2])
            );
            if (sale) sale.balance = values[0];
            return { rows: sale ? [sale] : [] };
          }
          throw new Error(`Mock database received an unhandled query: ${query}`);
        },
        release() {}
      };
    }
  };
  return pool;
}

async function request(baseUrl, pathname, { method = "GET", body, cookie = "" } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
    cookie: response.headers.get("set-cookie") ? response.headers.get("set-cookie").split(";")[0] : cookie
  };
}

test("authentication, staff invitations, support override auditing, and unsupported routes use PostgreSQL", async () => {
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = sessionSecret;
  const superAdminHash = await bcrypt.hash(administratorPassword, 4);
  const mockPool = createMockPool(superAdminHash);
  const dbPath = require.resolve("../db");
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: mockPool, databaseUrl: "" }
  };
  const { app } = require("../server");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const superLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: { email: administratorEmail, password: administratorPassword }
    });
    assert.equal(superLogin.status, 200);
    assert.equal(superLogin.data.user.role, "Super Admin");
    let superCookie = superLogin.cookie;

    const supportStart = await request(baseUrl, "/api/support-override", {
      method: "POST",
      cookie: superCookie,
      body: {
        action: "start",
        scope: "organization",
        organization_id: 1,
        reason: "Provision an initial tenant administrator"
      }
    });
    assert.equal(supportStart.status, 200);
    superCookie = supportStart.cookie;

    const adminInvite = await request(baseUrl, "/api/invitations", {
      method: "POST",
      cookie: superCookie,
      body: { role: "Admin", count: 1, branch_id: 1, activation_status: "Active" }
    });
    assert.equal(adminInvite.status, 201);
    const invalidSignup = await request(baseUrl, "/api/register", {
      method: "POST",
      body: {
        full_name: "Tenant Administrator",
        email: "tenant-admin@example.test",
        password: "short",
        invitation_code: adminInvite.data.code
      }
    });
    assert.equal(invalidSignup.status, 400);
    assert.equal(mockPool.state.invitations[0].used_at, null);
    const signup = await request(baseUrl, "/api/register", {
      method: "POST",
      body: {
        full_name: "Tenant Administrator",
        email: "tenant-admin@example.test",
        password: "tenant-admin-password",
        invitation_code: adminInvite.data.code
      }
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.data.user.role, "Admin");
    assert.equal(signup.data.user.organization_id, 1);
    assert.match(mockPool.state.users.find((user) => user.email === signup.data.user.email).password_hash, /^\$2[aby]\$/);

    const adminLogin = await request(baseUrl, "/api/login", {
      method: "POST",
      body: { email: "tenant-admin@example.test", password: "tenant-admin-password" }
    });
    assert.equal(adminLogin.status, 200);
    const staffInvite = await request(baseUrl, "/api/invitations", {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { role: "Loan Officer", count: 1, branch_id: 1, activation_status: "Pending" }
    });
    assert.equal(staffInvite.status, 201);
    const staffSignup = await request(baseUrl, "/api/register", {
      method: "POST",
      body: {
        full_name: "Pending Staff",
        email: "staff@example.test",
        password: "staff-password-123",
        invitation_code: staffInvite.data.code
      }
    });
    assert.equal(staffSignup.status, 201);
    assert.equal(staffSignup.data.user.status, "Pending");
    const approval = await request(baseUrl, `/api/team/${staffSignup.data.user.id}/approve`, {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { branch_id: 1 }
    });
    assert.equal(approval.status, 200);
    assert.equal(approval.data.user.status, "Active");

    const stopped = await request(baseUrl, "/api/support-override", {
      method: "POST",
      cookie: superCookie,
      body: { action: "stop" }
    });
    assert.equal(stopped.status, 200);
    const audit = await request(baseUrl, "/api/support-override-audit", { cookie: stopped.cookie });
    assert.ok(audit.data.some((item) => item.action === "support override started for DRAMAN Loan Services"));
    assert.ok(audit.data.some((item) => item.action === "support override ended"));

    const unsupported = await request(baseUrl, "/api/customers", { cookie: adminLogin.cookie });
    assert.equal(unsupported.status, 501);
    assert.match(unsupported.data.message, /not yet backed by PostgreSQL/);
    const logout = await request(baseUrl, "/api/logout", { method: "POST", cookie: adminLogin.cookie });
    assert.equal(logout.status, 200);
    const oldSession = await request(baseUrl, "/api/session", { cookie: adminLogin.cookie });
    assert.equal(oldSession.status, 401);
    assert.ok(mockPool.state.invitations[0].used_at);
    const transactionStatements = mockPool.state.queryLog.filter(({ query }) =>
      ["BEGIN", "COMMIT", "ROLLBACK"].includes(query.toUpperCase())
    );
    assert.ok(transactionStatements.some(({ query }) => query.toUpperCase() === "BEGIN"));
    assert.ok(transactionStatements.some(({ query }) => query.toUpperCase() === "COMMIT"));
    assert.ok(mockPool.state.queryLog.every(({ query, values }) =>
      !/\b(?:email|code_hash|organization_id)\s*=\s*['"`]/i.test(query) || values.length > 0
    ));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[require.resolve("../server")];
    delete require.cache[dbPath];
  }
});
