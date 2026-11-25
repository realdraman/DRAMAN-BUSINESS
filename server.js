const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

const PORT = Number(process.env.PORT || 4173);
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : crypto.randomBytes(32).toString("base64url"));
if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
  throw new Error("Set SESSION_SECRET to a secret of at least 32 bytes before starting in production.");
}

const SESSION_COOKIE = "draman_session";
const allowedRoles = ["Admin", "Cashier", "Loan Officer", "Inventory Manager"];
const staffRoles = ["Cashier", "Loan Officer", "Inventory Manager"];
const allowedProductCategories = [
  "Furniture", "Electronics", "Phones", "TVs", "Woofers", "Gas cylinders",
  "Household items", "Office furniture"
];
const defaultPermissions = {
  "Loan Officer": ["dashboard", "customers", "loans", "payments", "reports", "agreements"],
  Cashier: ["dashboard", "payments", "reports"],
  "Inventory Manager": ["dashboard", "inventory", "reports"]
};
const defaultSettings = {
  security: {
    session_timeout_hours: 24,
    minimum_password_length: 10,
    require_unique_staff_ids: true,
    audit_logging_enabled: true
  }
};
const publicFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.jsx": "app.jsx",
  "/styles.css": "styles.css",
  "/draman-logo.svg": "draman-logo.svg"
};
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".svg": "image/svg+xml"
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  req.body = req.body || {};
  next();
});
app.use((req, res, next) => {
  superAdminInitialization.then(() => next());
});

function reply(res, status, data) {
  res.set("Cache-Control", "no-store");
  res.status(status).json(data);
}

function fail(res, status, message, code) {
  reply(res, status, { message, ...(code ? { code } : {}) });
}

function databaseUnavailable(res) {
  return fail(res, 503, "PostgreSQL is not configured. This endpoint requires DATABASE_URL.");
}

function requirePool(res) {
  if (!pool) {
    databaseUnavailable(res);
    return false;
  }
  return true;
}

async function transaction(callback) {
  if (!pool) throw new Error("PostgreSQL is not configured.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Could not roll back PostgreSQL transaction:", rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function setContext(client, {
  organizationId = null,
  userId = null,
  globalReadOnly = false,
  platformOverride = false,
  supportOverride = false,
  superAdminBootstrap = false
} = {}) {
  await client.query("SELECT set_config('app.global_read_only', $1, true)", [globalReadOnly ? "true" : "false"]);
  await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId == null ? "" : String(organizationId)]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId == null ? "" : String(userId)]);
  await client.query("SELECT set_config('app.platform_override', $1, true)", [platformOverride ? "true" : "false"]);
  await client.query("SELECT set_config('app.support_override', $1, true)", [supportOverride ? "true" : "false"]);
  await client.query("SELECT set_config('app.bootstrap_super_admin', $1, true)", [superAdminBootstrap ? "true" : "false"]);
}

async function readQuery(query, values = [], context = {}) {
  return transaction(async (client) => {
    await setContext(client, context);
    return client.query(query, values);
  });
}

async function ensureSuperAdmin() {
  if (!pool) return false;
  const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["draman.ensure_super_admin"]);
    await setContext(client, { globalReadOnly: true });
    const { rows: admins } = await client.query(
      "SELECT id FROM users WHERE role = 'Super Admin' LIMIT 1"
    );
    if (admins[0]) return false;
    if (!email || !password) return false;
    if (!validEmail(email) || password.length < 10 || password.length > 128) {
      throw new Error("SUPER_ADMIN_EMAIL must be valid and SUPER_ADMIN_PASSWORD must contain 10 to 128 characters.");
    }

    const { rows: emailMatches } = await client.query(
      "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
      [email]
    );
    if (emailMatches[0]) {
      throw new Error("SUPER_ADMIN_EMAIL is already assigned to a non-Super Admin account.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const fullName = email.split("@")[0].replace(/[._-]+/g, " ").trim().slice(0, 160) || "Platform Administrator";
    await setContext(client, { globalReadOnly: false, superAdminBootstrap: true });
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, approved_at)
       VALUES ($1, $2, $3, 'Super Admin', 'Active', NOW())`,
      [fullName, email, passwordHash]
    );
    return true;
  });
}

const superAdminInitialization = pool
  ? ensureSuperAdmin().then((created) => {
      if (created) console.log("Bootstrapped the configured Super Admin account.");
      return created;
    }).catch((error) => {
      console.error("Could not ensure the configured Super Admin account:", error.message);
      return false;
    })
  : Promise.resolve(false);

function publicUser(user) {
  const { password_hash, session_version, ...safeUser } = user;
  return safeUser;
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 180 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function effectiveSettings(organization) {
  const settings = organization && organization.settings && typeof organization.settings === "object"
    ? organization.settings
    : {};
  return {
    ...defaultSettings,
    ...settings,
    security: { ...defaultSettings.security, ...(settings.security || {}) }
  };
}

function hashInvitation(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function invitationStatus(row) {
  const { code_hash, ...safeInvitation } = row;
  const status = row.revoked_at
    ? "Revoked"
    : row.used_at
      ? "Used"
      : new Date(row.expires_at) <= new Date()
        ? "Expired"
        : "Available";
  return { ...safeInvitation, status };
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return "";
}

function signSession(user, expiresAt, supportOverride = null) {
  const payload = Buffer.from(JSON.stringify({
    user_id: Number(user.id),
    expires_at: expiresAt,
    session_version: Number(user.session_version || 0),
    support_override: supportOverride
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!Number.isSafeInteger(session.user_id) || !Number.isSafeInteger(session.expires_at) ||
      !Number.isSafeInteger(session.session_version)) return null;
    return session;
  } catch {
    return null;
  }
}

function setSessionCookie(res, user, expiresAt, supportOverride = null) {
  const secure = isProduction ? "; Secure" : "";
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const value = signSession(user, expiresAt, supportOverride);
  res.set("Set-Cookie", `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(expiresAt).toUTCString()}${secure}`);
}

function clearSessionCookie(res) {
  const secure = isProduction ? "; Secure" : "";
  res.set("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`);
}

async function loadUser(userId) {
  return transaction(async (client) => {
    await setContext(client, { userId, globalReadOnly: false });
    const { rows } = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    return rows[0] || null;
  });
}

async function authenticate(req, res, next) {
  const session = verifySession(readCookie(req, SESSION_COOKIE));
  if (!session || session.expires_at <= Date.now() || !requirePool(res)) {
    if (!session || session.expires_at <= Date.now()) {
      clearSessionCookie(res);
      return fail(res, 401, "Your session has expired. Please sign in again.");
    }
    return;
  }
  try {
    const user = await loadUser(session.user_id);
    if (!user || user.status !== "Active" || Number(user.session_version || 0) !== session.session_version) {
      clearSessionCookie(res);
      return fail(res, 401, "Your session has expired. Please sign in again.");
    }
    if (user.organization_id != null) {
      const { rows: organizations } = await readQuery(
        "SELECT id, name, status, settings FROM organizations WHERE id = $1 LIMIT 1",
        [user.organization_id],
        { organizationId: user.organization_id }
      );
      const organization = organizations[0];
      if (!organization || organization.status !== "Active") {
        return fail(res, 403, "Your organization is inactive. Contact platform support.", "ORGANIZATION_INACTIVE");
      }
      user.organization = organization;
      if (user.branch_id != null) {
        const { rows: branches } = await readQuery(
          "SELECT id, organization_id, name, status FROM branches WHERE id = $1 AND organization_id = $2 LIMIT 1",
          [user.branch_id, user.organization_id],
          { organizationId: user.organization_id }
        );
        user.branch = branches[0] || null;
      }
      if (user.role !== "Super Admin" && (!user.branch || user.branch.status !== "Active")) {
        return fail(res, 403, "Your account is active but no branch is assigned. Contact your organization administrator.", "BRANCH_UNASSIGNED");
      }
    }
    req.authUser = user;
    req.supportOverride = session.support_override || null;
    req.sessionExpiresAt = session.expires_at;
    next();
  } catch (error) {
    console.error("Could not authenticate request against PostgreSQL:", error.message);
    fail(res, 503, "Could not verify the session using PostgreSQL.");
  }
}

function isSuperAdmin(req) {
  return req.authUser && req.authUser.role === "Super Admin";
}

async function auditOverride(client, req, action, override) {
  const organizationId = override && override.scope === "organization" ? override.organization_id : null;
  await setContext(client, {
    organizationId,
    globalReadOnly: organizationId == null,
    platformOverride: !organizationId,
    supportOverride: Boolean(organizationId)
  });
  await client.query(
    `INSERT INTO support_override_audit
      (actor_user_id, organization_id, scope, reason, action, request_method, request_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      req.authUser.id,
      organizationId,
      override ? override.scope : "organization",
      override ? override.reason : "",
      action,
      req.method,
      new URL(req.originalUrl, "http://localhost").pathname
    ]
  );
}

async function authorizeTenantAdmin(req, res, action) {
  if (isSuperAdmin(req)) {
    if (req.method === "GET") return true;
    if (!req.supportOverride) {
      fail(res, 403, "Super Admin accounts are read-only. Start an audited support override to make changes.");
      return false;
    }
    return true;
  }
  if (req.authUser.role === "Admin") return true;
  fail(res, 403, "Organization administrator permission required");
  return false;
}

function selectedOrganization(req) {
  if (isSuperAdmin(req)) {
    return req.supportOverride && req.supportOverride.scope === "organization"
      ? Number(req.supportOverride.organization_id)
      : null;
  }
  return Number(req.authUser.organization_id);
}

function businessOrganization(req) {
  return selectedOrganization(req);
}

function businessPermission(req, moduleName) {
  if (isSuperAdmin(req) || req.authUser.role === "Admin") return true;
  const permissions = effectiveSettings(req.authUser.organization).security.permissions || defaultPermissions;
  const assigned = permissions[req.authUser.role];
  return Array.isArray(assigned) ? assigned.includes(moduleName) : (defaultPermissions[req.authUser.role] || []).includes(moduleName);
}

function authorizeBusinessRead(req, res, moduleName) {
  if (!requirePool(res)) return null;
  if (!businessPermission(req, moduleName)) {
    fail(res, 403, `Your role does not have access to ${moduleName}.`);
    return null;
  }
  return businessOrganization(req);
}

function authorizeBusinessWrite(req, res, moduleName) {
  if (!requirePool(res)) return null;
  if (isSuperAdmin(req)) {
    if (!req.supportOverride || req.supportOverride.scope !== "organization") {
      fail(res, 403, "Super Admin accounts are read-only. Start an audited organization support override to make changes.");
      return null;
    }
    return Number(req.supportOverride.organization_id);
  }
  if (!businessPermission(req, moduleName)) {
    fail(res, 403, `Your role does not have permission to change ${moduleName}.`);
    return null;
  }
  const organizationId = Number(req.authUser.organization_id);
  return Number.isSafeInteger(organizationId) && organizationId > 0 ? organizationId : null;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function finiteAmount(value, { min = 0, max = 1000000000000 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < min || amount > max) return null;
  return Math.round(amount * 100) / 100;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function businessTransaction(req, organizationId, action, callback) {
  return auditSupportWriteIfNeeded(req, action, async (client) => {
    await setContext(client, {
      organizationId,
      userId: req.authUser.id,
      globalReadOnly: false,
      supportOverride: isSuperAdmin(req)
    });
    return callback(client);
  });
}

async function resolveBusinessBranch(client, req, organizationId, requestedBranchId) {
  const branchId = positiveId(requestedBranchId || req.authUser.branch_id);
  if (!branchId) return null;
  if (!isSuperAdmin(req) && req.authUser.role !== "Admin" &&
    branchId !== Number(req.authUser.branch_id)) return null;
  const { rows } = await client.query(
    "SELECT id, organization_id, name, status FROM branches WHERE id = $1 AND organization_id = $2 AND status = 'Active' LIMIT 1",
    [branchId, organizationId]
  );
  return rows[0] || null;
}

async function auditSupportWrite(req, action, callback) {
  const override = req.supportOverride;
  return transaction(async (client) => {
    const orgId = override.scope === "organization" ? override.organization_id : null;
    await setContext(client, {
      organizationId: orgId,
      globalReadOnly: orgId == null,
      platformOverride: override.scope === "platform",
      supportOverride: override.scope === "organization"
    });
    const result = callback ? await callback(client) : null;
    await auditOverride(client, req, action, override);
    return result;
  });
}

app.get("/api/health", (req, res) => {
  reply(res, 200, { ok: true, service: "DRAMAN LMS API", database_configured: Boolean(pool), timestamp: new Date().toISOString() });
});

app.post("/api/login", async (req, res) => {
  if (!requirePool(res)) return;
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  try {
    const { rows } = await readQuery(
      "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
      [email],
      { globalReadOnly: true }
    );
    const user = rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return fail(res, 401, "The email or password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (user.status === "Pending") {
      return fail(res, 403, "Your account is awaiting administrator approval. Use the same email and password after approval.", "ACCOUNT_PENDING");
    }
    if (user.status !== "Active") {
      return fail(res, 403, "Your account is suspended or inactive. Contact your organization administrator.", "ACCOUNT_INACTIVE");
    }
    let organization = null;
    if (user.organization_id != null) {
      const result = await readQuery(
        "SELECT id, name, status, settings FROM organizations WHERE id = $1 LIMIT 1",
        [user.organization_id],
        { organizationId: user.organization_id }
      );
      organization = result.rows[0] || null;
      if (!organization || organization.status !== "Active") {
        return fail(res, 403, "Your organization is inactive. Contact platform support.", "ORGANIZATION_INACTIVE");
      }
      const branchResult = await readQuery(
        "SELECT id, organization_id, name, status FROM branches WHERE id = $1 AND organization_id = $2 LIMIT 1",
        [user.branch_id, user.organization_id],
        { organizationId: user.organization_id }
      );
      if (!branchResult.rows[0] || branchResult.rows[0].status !== "Active") {
        return fail(res, 403, "Your account is active but no branch is assigned. Contact your organization administrator.", "BRANCH_UNASSIGNED");
      }
    }
    const timeoutHours = Number(effectiveSettings(organization).security.session_timeout_hours) || 24;
    const expiresAt = Date.now() + timeoutHours * 60 * 60 * 1000;
    setSessionCookie(res, user, expiresAt);
    reply(res, 200, { expires_at: new Date(expiresAt).toISOString(), user: publicUser(user) });
  } catch (error) {
    console.error("PostgreSQL login failed:", error.message);
    fail(res, 503, "Could not authenticate using PostgreSQL.");
  }
});

app.post("/api/register", async (req, res) => {
  if (!requirePool(res)) return;
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const employeeId = String(req.body.employee_id || "").trim().toUpperCase();
  const password = String(req.body.password || "");
  const invitationCode = String(req.body.invitation_code || "").trim().toUpperCase();
  if (fullName.length < 2 || fullName.length > 160 || !validEmail(email)) {
    return fail(res, 400, "Enter a valid name and personal email address.");
  }
  if (employeeId && (employeeId.length < 3 || employeeId.length > 32 || !/^[A-Z0-9-]+$/.test(employeeId))) {
    return fail(res, 400, "Staff IDs must contain 3 to 32 letters, numbers, or hyphens.");
  }
  if (!invitationCode) return fail(res, 403, "A valid organization invitation is required to create a staff account.", "INVITATION_REQUIRED");
  try {
    const registeredUser = await transaction(async (client) => {
      await setContext(client, { globalReadOnly: true });
      const { rows: invitations } = await client.query(
        `SELECT * FROM invitation_codes
         WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [hashInvitation(invitationCode)]
      );
      const invitation = invitations[0];
      if (!invitation || !allowedRoles.includes(invitation.role)) {
        const error = new Error("INVITATION_INVALID");
        error.code = "INVITATION_INVALID";
        throw error;
      }
      await setContext(client, { organizationId: invitation.organization_id, globalReadOnly: false });
      const { rows: organizations } = await client.query(
        "SELECT id, name, status, settings FROM organizations WHERE id = $1 LIMIT 1",
        [invitation.organization_id]
      );
      const organization = organizations[0];
      const { rows: branches } = await client.query(
        "SELECT id, organization_id, name, status FROM branches WHERE id = $1 AND organization_id = $2 LIMIT 1",
        [invitation.branch_id, invitation.organization_id]
      );
      const branch = branches[0];
      if (!organization || organization.status !== "Active") {
        const error = new Error("ORGANIZATION_INACTIVE");
        error.code = "ORGANIZATION_INACTIVE";
        throw error;
      }
      if (!branch || branch.status !== "Active") {
        const error = new Error("BRANCH_UNASSIGNED");
        error.code = "BRANCH_UNASSIGNED";
        throw error;
      }
      const settings = effectiveSettings(organization).security;
      if (password.length < settings.minimum_password_length || password.length > 128) {
        const error = new Error("PASSWORD_POLICY");
        error.message = `Choose a password with at least ${settings.minimum_password_length} characters.`;
        error.status = 400;
        throw error;
      }
      const { rows: existingUsers } = await client.query(
        "SELECT id, email, employee_id FROM users WHERE lower(email) = lower($1) OR ($2 <> '' AND employee_id = $2 AND organization_id = $3)",
        [email, employeeId, organization.id]
      );
      if (existingUsers.some((user) => user.email.toLowerCase() === email)) {
        const error = new Error("EMAIL_EXISTS");
        error.status = 409;
        throw error;
      }
      if (employeeId && settings.require_unique_staff_ids &&
        existingUsers.some((user) => user.employee_id && user.employee_id.toUpperCase() === employeeId)) {
        const error = new Error("EMPLOYEE_EXISTS");
        error.status = 409;
        throw error;
      }
      await setContext(client, { organizationId: organization.id, globalReadOnly: false });
      const passwordHash = await bcrypt.hash(password, 12);
      const { rows: created } = await client.query(
        `INSERT INTO users
          (organization_id, branch_id, full_name, email, phone, employee_id, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          organization.id, branch.id, fullName, email, "", employeeId || null, passwordHash,
          invitation.role, invitation.activation_status === "Active" ? "Active" : "Pending"
        ]
      );
      const user = created[0];
      await client.query(
        "UPDATE invitation_codes SET used_at = NOW(), used_by = $1 WHERE id = $2 AND used_at IS NULL AND revoked_at IS NULL",
        [user.id, invitation.id]
      );
      return user;
    });
    reply(res, 201, {
      message: registeredUser.status === "Active"
        ? "Your account is active. Sign in with the email and password you just created."
        : "Your account request is pending approval. Your email and password are saved; use them after approval.",
      user: publicUser(registeredUser)
    });
  } catch (error) {
    if (error.code === "INVITATION_INVALID") return fail(res, 403, "That invitation code is invalid, expired, revoked, or already used.", "INVITATION_INVALID");
    if (error.code === "ORGANIZATION_INACTIVE") return fail(res, 403, "This invitation belongs to an inactive organization.", error.code);
    if (error.code === "BRANCH_UNASSIGNED") return fail(res, 403, "This invitation has no active branch assignment. Contact the organization administrator.", error.code);
    if (error.status) return fail(res, error.status, error.message);
    if (error.code === "23505") return fail(res, 409, "That email address or staff ID is already registered.");
    console.error("PostgreSQL registration failed:", error.message);
    fail(res, 503, "Could not create the account using PostgreSQL.");
  }
});

app.post("/api/logout", authenticate, async (req, res) => {
  try {
    await transaction(async (client) => {
      await setContext(client, {
        organizationId: req.authUser.organization_id,
        userId: req.authUser.id,
        globalReadOnly: false
      });
      await client.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [req.authUser.id]);
    });
    clearSessionCookie(res);
    reply(res, 200, { message: "Signed out" });
  } catch (error) {
    console.error("Could not invalidate user sessions:", error.message);
    fail(res, 503, "Could not sign out using PostgreSQL.");
  }
});

app.get("/api/session", authenticate, (req, res) => {
  reply(res, 200, {
    user: publicUser(req.authUser),
    expires_at: new Date(req.sessionExpiresAt).toISOString(),
    support_override: req.supportOverride
  });
});

app.post("/api/support-override", authenticate, async (req, res) => {
  if (!isSuperAdmin(req)) return fail(res, 403, "Only a Super Admin can start a support override.");
  const body = req.body || {};
  const current = req.supportOverride;
  if (body.action === "stop") {
    if (!current) return fail(res, 409, "No support override is active.");
    try {
      await transaction((client) => auditOverride(client, req, "support override ended", current));
      setSessionCookie(res, req.authUser, req.sessionExpiresAt);
      return reply(res, 200, { support_override: null, expires_at: new Date(req.sessionExpiresAt).toISOString() });
    } catch (error) {
      console.error("Could not record support override audit:", error.message);
      return fail(res, 503, "Could not record the support override audit in PostgreSQL.");
    }
  }
  if (body.action !== "start" || current) return fail(res, 409, "End the current override before starting another.");
  const reason = String(body.reason || "").trim();
  const scope = body.scope === "platform" ? "platform" : "organization";
  if (reason.length < 15 || reason.length > 500) return fail(res, 400, "Provide a support reason between 15 and 500 characters.");
  let organization = null;
  if (scope === "organization") {
    try {
      const result = await readQuery(
        "SELECT id, name, status FROM organizations WHERE id = $1 LIMIT 1",
        [Number(body.organization_id)],
        { globalReadOnly: true }
      );
      organization = result.rows[0];
    } catch (error) {
      console.error("Could not read support organization:", error.message);
      return fail(res, 503, "Could not verify the organization using PostgreSQL.");
    }
    if (!organization || organization.status !== "Active") return fail(res, 404, "Choose an active organization for the support override.");
  }
  const override = {
    scope,
    reason,
    started_at: Date.now(),
    organization_id: organization ? Number(organization.id) : null,
    organization_name: organization ? organization.name : ""
  };
  const action = scope === "platform" ? "platform support override started" : `support override started for ${organization.name}`;
  try {
    await transaction((client) => auditOverride(client, req, action, override));
    setSessionCookie(res, req.authUser, req.sessionExpiresAt, override);
    return reply(res, 200, { support_override: override, expires_at: new Date(req.sessionExpiresAt).toISOString() });
  } catch (error) {
    console.error("Could not record support override audit:", error.message);
    return fail(res, 503, "Could not record the support override audit in PostgreSQL.");
  }
});

app.get("/api/organizations", authenticate, async (req, res) => {
  if (!requirePool(res)) return;
  const organizationId = selectedOrganization(req);
  try {
    const result = organizationId == null
      ? await readQuery(
        "SELECT id, name, status, created_at FROM organizations ORDER BY id",
        [],
        { globalReadOnly: true }
      )
      : await readQuery(
        "SELECT id, name, status, created_at FROM organizations WHERE id = $1 ORDER BY id",
        [organizationId],
        { organizationId }
      );
    reply(res, 200, result.rows);
  } catch (error) {
    console.error("Could not list organizations:", error.message);
    fail(res, 503, "Could not list organizations using PostgreSQL.");
  }
});

app.post("/api/organizations", authenticate, async (req, res) => {
  if (!isSuperAdmin(req) || !req.supportOverride || req.supportOverride.scope !== "platform") {
    return fail(res, 403, "Organization provisioning requires a platform support override.");
  }
  const name = String(req.body.name || "").trim();
  if (name.length < 2 || name.length > 120) return fail(res, 400, "Organization name must contain 2 to 120 characters.");
  const code = `DRM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const settings = JSON.stringify(defaultSettings);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  try {
    const created = await auditSupportWrite(req, "create organization", async (client) => {
      await client.query("SELECT set_config('app.platform_override', $1, true)", ["true"]);
      await client.query("SELECT set_config('app.global_read_only', $1, true)", ["true"]);
      const orgResult = await client.query(
        "INSERT INTO organizations (name, status, settings) VALUES ($1, 'Active', $2::jsonb) RETURNING id, name, status, created_at",
        [name, settings]
      );
      const organization = orgResult.rows[0];
      await client.query(
        "INSERT INTO branches (organization_id, name, status) VALUES ($1, $2, 'Active')",
        [organization.id, "Main Branch"]
      );
      const branchResult = await client.query(
        "SELECT id, organization_id, name, status, created_at FROM branches WHERE organization_id = $1 ORDER BY id DESC LIMIT 1",
        [organization.id]
      );
      await client.query(
        `INSERT INTO invitation_codes
          (organization_id, branch_id, role, activation_status, code_hash, created_by, expires_at)
         VALUES ($1, $2, 'Admin', 'Active', $3, $4, $5)`,
        [organization.id, branchResult.rows[0].id, hashInvitation(code), req.authUser.id, expiresAt]
      );
      return { organization, branch: branchResult.rows[0] };
    });
    reply(res, 201, {
      ...created,
      admin_invitation_code: code,
      invitation_expires_at: expiresAt.toISOString()
    });
  } catch (error) {
    console.error("Could not create organization:", error.message);
    fail(res, 503, "Could not create the organization and audit record using PostgreSQL.");
  }
});

app.get("/api/branches", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res)) return;
  const organizationId = selectedOrganization(req);
  try {
    const { rows } = organizationId == null
      ? await readQuery("SELECT id, organization_id, name, status, created_at FROM branches ORDER BY id", [], { globalReadOnly: true })
      : await readQuery("SELECT id, organization_id, name, status, created_at FROM branches WHERE organization_id = $1 ORDER BY id", [organizationId], { organizationId });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list branches:", error.message);
    fail(res, 503, "Could not list branches using PostgreSQL.");
  }
});

app.post("/api/branches", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "settings");
  if (!organizationId) {
    return fail(res, 403, "Branches can only be created within an organization.");
  }
  if (!["Admin", "Super Admin"].includes(req.authUser.role)) {
    return fail(res, 403, "Administrator permission required to create branches.");
  }
  const name = String(req.body.name || "").trim();
  if (name.length < 2 || name.length > 120) return fail(res, 400, "Branch name must contain 2 to 120 characters.");
  try {
    const branch = await businessTransaction(req, organizationId, "create branch", async (client) => {
      const { rows } = await client.query(
        "INSERT INTO branches (organization_id, name, status) VALUES ($1, $2, 'Active') RETURNING id, organization_id, name, status, created_at",
        [organizationId, name]
      );
      return rows[0];
    });
    reply(res, 201, branch);
  } catch (error) {
    if (error.code === "23505") return fail(res, 409, "That branch name already exists in this organization.");
    console.error("Could not create branch:", error.message);
    fail(res, 503, "Could not create the branch using PostgreSQL.");
  }
});

async function auditSupportWriteIfNeeded(req, action, callback) {
  if (isSuperAdmin(req)) return auditSupportWrite(req, action, callback);
  return transaction(async (client) => {
    await setContext(client, { organizationId: req.authUser.organization_id, globalReadOnly: false });
    return callback(client);
  });
}

app.put("/api/account", authenticate, async (req, res) => {
  const currentPassword = String(req.body.current_password || "");
  const email = String(req.body.email || "").trim().toLowerCase();
  const nextPassword = String(req.body.new_password || "");
  if (!await bcrypt.compare(currentPassword, req.authUser.password_hash)) return fail(res, 400, "Current password is incorrect.");
  if (!validEmail(email)) return fail(res, 400, "Enter a valid email address.");
  if (nextPassword) {
    const minLength = effectiveSettings(req.authUser.organization).security.minimum_password_length;
    if (nextPassword.length < minLength || nextPassword.length > 128) return fail(res, 400, `Choose a password with at least ${minLength} characters.`);
  }
  try {
    const passwordHash = nextPassword ? await bcrypt.hash(nextPassword, 12) : req.authUser.password_hash;
    const { rows } = await transaction(async (client) => {
      await setContext(client, { organizationId: req.authUser.organization_id, userId: req.authUser.id, globalReadOnly: false });
      return client.query(
        "UPDATE users SET email = $1, password_hash = $2, session_version = session_version + $3 WHERE id = $4 RETURNING *",
        [email, passwordHash, nextPassword ? 1 : 0, req.authUser.id]
      );
    });
    if (!rows[0]) return fail(res, 404, "Account not found.");
    if (nextPassword) setSessionCookie(res, rows[0], req.sessionExpiresAt, req.supportOverride);
    reply(res, 200, { user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === "23505") return fail(res, 409, "That email address is already associated with an account.");
    console.error("Could not update account:", error.message);
    fail(res, 503, "Could not update the account using PostgreSQL.");
  }
});

app.get("/api/team", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res)) return;
  const organizationId = selectedOrganization(req);
  try {
    const result = organizationId == null
      ? await readQuery("SELECT * FROM users WHERE role <> 'Super Admin' ORDER BY id", [], { globalReadOnly: true })
      : await readQuery("SELECT * FROM users WHERE organization_id = $1 ORDER BY id", [organizationId], { organizationId });
    reply(res, 200, result.rows.map(publicUser));
  } catch (error) {
    console.error("Could not list team:", error.message);
    fail(res, 503, "Could not list team using PostgreSQL.");
  }
});

app.post("/api/team/:id/approve", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res, "approve staff account")) return;
  const organizationId = selectedOrganization(req);
  if (!organizationId) return fail(res, 403, "Choose an organization support override before approving staff.");
  const branchId = Number(req.body.branch_id || req.authUser.branch_id);
  try {
    const result = await auditSupportWriteIfNeeded(req, "approve staff account", async (client) => {
      await setContext(client, { organizationId, globalReadOnly: false });
      const { rows: branches } = await client.query(
        "SELECT id FROM branches WHERE id = $1 AND organization_id = $2 AND status = 'Active' LIMIT 1",
        [branchId, organizationId]
      );
      if (!branches[0]) {
        const error = new Error("INVALID_BRANCH");
        throw error;
      }
      return client.query(
        `UPDATE users SET status = 'Active', approved_at = NOW(), approved_by = $1, branch_id = $2
         WHERE id = $3 AND organization_id = $4 AND status = 'Pending'
         RETURNING *`,
        [req.authUser.id, branchId, Number(req.params.id), organizationId]
      );
    });
    if (result === null) return fail(res, 400, "Choose an active branch in this organization before approving the account.");
    if (!result.rows[0]) return fail(res, 404, "Account request not found or is no longer pending.");
    reply(res, 200, {
      user: publicUser(result.rows[0]),
      message: `${result.rows[0].full_name} is active. They can sign in using the email and password they created at registration.`
    });
  } catch (error) {
    if (error.message === "INVALID_BRANCH") return fail(res, 400, "Choose an active branch in this organization before approving the account.");
    console.error("Could not approve staff account:", error.message);
    fail(res, 503, "Could not approve the staff account using PostgreSQL.");
  }
});

app.get("/api/invitations", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res)) return;
  const organizationId = selectedOrganization(req);
  try {
    const result = organizationId == null
      ? await readQuery("SELECT * FROM invitation_codes ORDER BY created_at DESC", [], { globalReadOnly: true })
      : await readQuery("SELECT * FROM invitation_codes WHERE organization_id = $1 ORDER BY created_at DESC", [organizationId], { organizationId });
    reply(res, 200, result.rows.map(invitationStatus));
  } catch (error) {
    console.error("Could not list invitations:", error.message);
    fail(res, 503, "Could not list invitations using PostgreSQL.");
  }
});

app.post("/api/invitations", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res, "create staff invitation")) return;
  const organizationId = selectedOrganization(req);
  const role = req.body.role;
  const count = req.body.count === undefined ? 1 : Number(req.body.count);
  const branchId = Number(req.body.branch_id || req.authUser.branch_id);
  const activationStatus = req.body.activation_status === "Active" ? "Active" : "Pending";
  if (!allowedRoles.includes(role)) return fail(res, 400, "Choose an organization staff role; Super Admin invitations are not permitted.");
  if (!Number.isInteger(count) || count < 1 || count > 50) return fail(res, 400, "Create between 1 and 50 invitation codes at a time.");
  if (!organizationId) return fail(res, 400, "Choose an active branch in your organization.");
  try {
    const invitations = await auditSupportWriteIfNeeded(req, "create staff invitation", async (client) => {
      await setContext(client, { organizationId, globalReadOnly: false });
      const { rows: branchRows } = await client.query(
        "SELECT id FROM branches WHERE id = $1 AND organization_id = $2 AND status = 'Active' LIMIT 1",
        [branchId, organizationId]
      );
      if (!branchRows[0]) {
        const error = new Error("INVALID_BRANCH");
        throw error;
      }
      const created = [];
      for (let index = 0; index < count; index += 1) {
        const code = `DRM-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const { rows } = await client.query(
          `INSERT INTO invitation_codes
            (organization_id, branch_id, role, activation_status, code_hash, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [organizationId, branchId, role, activationStatus, hashInvitation(code), req.authUser.id, expiresAt]
        );
        created.push({ invitation: invitationStatus(rows[0]), code });
      }
      return created;
    });
    const first = invitations[0];
    reply(res, 201, { invitations, invitation: first.invitation, code: first.code });
  } catch (error) {
    if (error.message === "INVALID_BRANCH") return fail(res, 400, "Choose an active branch in your organization.");
    console.error("Could not create invitations:", error.message);
    fail(res, 503, "Could not create invitations using PostgreSQL.");
  }
});

app.post("/api/invitations/:id/revoke", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res, "revoke staff invitation")) return;
  const organizationId = selectedOrganization(req);
  if (!organizationId) return fail(res, 404, "Invitation not found in your organization.");
  try {
    const result = await auditSupportWriteIfNeeded(req, "revoke staff invitation", async (client) => {
      await setContext(client, { organizationId, globalReadOnly: false });
      return client.query(
        `UPDATE invitation_codes SET revoked_at = NOW(), revoked_by = $1
         WHERE id = $2 AND organization_id = $3 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
         RETURNING *`,
        [req.authUser.id, Number(req.params.id), organizationId]
      );
    });
    if (!result.rows[0]) return fail(res, 409, "Only unused, active invitations can be revoked.");
    reply(res, 200, { invitation: invitationStatus(result.rows[0]) });
  } catch (error) {
    console.error("Could not revoke invitation:", error.message);
    fail(res, 503, "Could not revoke the invitation using PostgreSQL.");
  }
});

app.get("/api/support-override-audit", authenticate, async (req, res) => {
  if (!await authorizeTenantAdmin(req, res)) return;
  const organizationId = selectedOrganization(req);
  try {
    const result = organizationId == null
      ? await readQuery("SELECT * FROM support_override_audit ORDER BY created_at DESC", [], { globalReadOnly: true })
      : await readQuery("SELECT * FROM support_override_audit WHERE organization_id = $1 ORDER BY created_at DESC", [organizationId], { organizationId });
    reply(res, 200, result.rows);
  } catch (error) {
    console.error("Could not read support audit:", error.message);
    fail(res, 503, "Could not read support audit using PostgreSQL.");
  }
});

app.post("/api/password/forgot", async (req, res) => {
  if (!requirePool(res)) return;
  const genericMessage = "If an active account matches that email, a password reset link will be sent.";
  if (process.env.NODE_ENV !== "test" && !process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL) {
    return fail(res, 503, "Password reset delivery is not configured. Contact your administrator.");
  }
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!validEmail(email)) return reply(res, 200, { message: genericMessage });

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const user = await transaction(async (client) => {
      await setContext(client, { globalReadOnly: true });
      await client.query("SELECT set_config('app.password_reset', $1, true)", ["true"]);
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.status, u.organization_id, o.settings
         FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE lower(u.email) = lower($1) LIMIT 1`,
        [email]
      );
      const matchingUser = rows[0];
      if (!matchingUser || !["Active", "Pending"].includes(matchingUser.status)) return null;
      await client.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        [matchingUser.id]
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
        [matchingUser.id, tokenHash]
      );
      return matchingUser;
    });
    if (!user) return reply(res, 200, { message: genericMessage });

    if (process.env.NODE_ENV !== "test") {
      const webhook = new URL(process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL);
      if (webhook.protocol !== "https:" || webhook.username || webhook.password ||
        !process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET || !process.env.PUBLIC_APP_URL) {
        return fail(res, 503, "Password reset delivery is not configured securely.");
      }
      const appUrl = new URL(process.env.PUBLIC_APP_URL);
      if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password) {
        return fail(res, 503, "Password reset delivery is not configured securely.");
      }
      const resetUrl = new URL("/", appUrl);
      resetUrl.searchParams.set("reset_token", token);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const delivery = await fetch(webhook, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.PASSWORD_RESET_EMAIL_WEBHOOK_SECRET}`
          },
          body: JSON.stringify({
            to: user.email,
            subject: "Reset your DRAMAN account password",
            reset_url: resetUrl.toString(),
            expires_in_minutes: 30
          })
        });
        if (!delivery.ok) return fail(res, 503, "Could not deliver the password reset email.");
      } finally {
        clearTimeout(timeout);
      }
    }
    reply(res, 200, {
      message: genericMessage,
      ...(process.env.NODE_ENV === "test" ? { test_reset_token: token } : {})
    });
  } catch (error) {
    console.error("Could not issue password reset:", error.name || "Error");
    fail(res, 503, "Could not request a password reset using PostgreSQL.");
  }
});

app.post("/api/password/reset", async (req, res) => {
  if (!requirePool(res)) return;
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return fail(res, 400, "The password reset link is invalid or expired.");
  if (password.length > 128) return fail(res, 400, "Choose a password with no more than 128 characters.");
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const resetResult = await transaction(async (client) => {
      await setContext(client, { globalReadOnly: true });
      await client.query("SELECT set_config('app.password_reset', $1, true)", ["true"]);
      const { rows } = await client.query(
        `SELECT t.id AS token_id, t.user_id, u.organization_id, u.status, o.settings
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW()
         FOR UPDATE OF t`,
        [tokenHash]
      );
      const reset = rows[0];
      if (!reset || !["Active", "Pending"].includes(reset.status)) return { error: "INVALID_TOKEN" };
      const settings = effectiveSettings(reset.organization_id == null ? null : { settings: reset.settings }).security;
      if (password.length < settings.minimum_password_length) {
        return { error: "PASSWORD_POLICY", minimum: settings.minimum_password_length };
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await setContext(client, {
        organizationId: reset.organization_id,
        userId: reset.user_id,
        globalReadOnly: false
      });
      await client.query(
        "UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2",
        [passwordHash, reset.user_id]
      );
      await client.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        [reset.user_id]
      );
      return { user_id: reset.user_id };
    });
    if (resetResult.error === "PASSWORD_POLICY") {
      return fail(res, 400, `Choose a password with at least ${resetResult.minimum} characters.`);
    }
    if (resetResult.error) return fail(res, 400, "The password reset link is invalid or expired.");
    reply(res, 200, { message: "Your password has been reset. Sign in with your new password." });
  } catch (error) {
    console.error("Could not reset password:", error.message);
    fail(res, 503, "Could not reset the password using PostgreSQL.");
  }
});

function baseBusinessSettings(organization) {
  const security = effectiveSettings(organization).security;
  return {
    business: {
      company_name: organization && organization.name || "DRAMAN Loan Services",
      logo_data: "",
      contact_phone: "",
      contact_email: "",
      receipt_footer: "Thank you for your payment.",
      sms_enabled: false,
      sms_sender_id: ""
    },
    loan: {
      default_interest_rate: 12,
      processing_fee: 1000,
      grace_period_days: 3,
      late_penalty_rate: 3,
      approval_threshold: 50000
    },
    security: {
      ...defaultSettings.security,
      permissions: defaultPermissions,
      ...security,
      permissions: security.permissions || defaultPermissions
    }
  };
}

app.get("/api/settings", authenticate, async (req, res) => {
  if (!requirePool(res)) return;
  const organizationId = businessOrganization(req);
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    if (organizationId == null) return reply(res, 200, baseBusinessSettings(null));
    const settings = await readQuery(
      `SELECT o.id, o.name, o.settings, b.company_name, b.logo_path, b.contact_phone,
              b.contact_email, b.receipt_footer, b.sms_provider,
              l.default_interest_rate, l.processing_fee, l.penalty_rate, l.grace_period_days, l.max_auto_approval_amount
       FROM organizations o
       LEFT JOIN business_settings b ON b.organization_id = o.id
       LEFT JOIN loan_settings l ON l.organization_id = o.id
       WHERE o.id = $1 LIMIT 1`,
      [organizationId],
      { organizationId }
    );
    const row = settings.rows[0];
    if (!row) return fail(res, 404, "Organization settings not found.");
    const data = baseBusinessSettings({ name: row.name, settings: row.settings });
    data.business = {
      ...data.business,
      company_name: row.company_name || row.name,
      logo_data: row.logo_path || "",
      contact_phone: row.contact_phone || "",
      contact_email: row.contact_email || "",
      receipt_footer: row.receipt_footer || data.business.receipt_footer,
      sms_enabled: Boolean(row.sms_provider),
      sms_sender_id: row.sms_provider || ""
    };
    data.loan = {
      ...data.loan,
      default_interest_rate: Number(row.default_interest_rate ?? data.loan.default_interest_rate),
      processing_fee: Number(row.processing_fee ?? data.loan.processing_fee),
      grace_period_days: Number(row.grace_period_days ?? data.loan.grace_period_days),
      late_penalty_rate: Number(row.penalty_rate ?? data.loan.late_penalty_rate),
      approval_threshold: Number(row.max_auto_approval_amount ?? data.loan.approval_threshold)
    };
    reply(res, 200, data);
  } catch (error) {
    console.error("Could not read settings:", error.message);
    fail(res, 503, "Could not read organization settings using PostgreSQL.");
  }
});

app.put("/api/settings/:section", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "settings");
  if (!organizationId) return fail(res, 403, "Settings can only be changed within an organization.");
  if (!["Admin", "Super Admin"].includes(req.authUser.role)) return fail(res, 403, "Administrator permission required to change settings.");
  const section = req.params.section;
  if (!["business", "loan", "security"].includes(section)) return fail(res, 404, "Settings section not found.");
  const input = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const result = await businessTransaction(req, organizationId, `update ${section} settings`, async (client) => {
      if (section === "business") {
        const companyName = String(input.company_name || "").trim();
        const contactPhone = String(input.contact_phone || "").trim();
        const contactEmail = String(input.contact_email || "").trim();
        const footer = String(input.receipt_footer || "").trim();
        const logo = String(input.logo_data || "");
        const smsSender = input.sms_enabled ? String(input.sms_sender_id || "").trim() : "";
        if (companyName.length < 2 || companyName.length > 180 || contactPhone.length > 40 ||
          contactEmail && !validEmail(contactEmail) || footer.length > 1000 ||
          logo.length > 1400000 || smsSender.length > 80) {
          return { error: "INVALID_SETTINGS" };
        }
        const { rows } = await client.query(
          `INSERT INTO business_settings
            (organization_id, company_name, logo_path, contact_phone, contact_email, receipt_footer, sms_provider, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (organization_id) DO UPDATE SET
             company_name = EXCLUDED.company_name, logo_path = EXCLUDED.logo_path,
             contact_phone = EXCLUDED.contact_phone, contact_email = EXCLUDED.contact_email,
             receipt_footer = EXCLUDED.receipt_footer, sms_provider = EXCLUDED.sms_provider,
             updated_at = NOW()
           RETURNING *`,
          [organizationId, companyName, logo || null, contactPhone || null, contactEmail || null, footer || null, smsSender || null]
        );
        return { business: rows[0] };
      }
      if (section === "loan") {
        const defaultInterestRate = finiteAmount(input.default_interest_rate, { max: 1000 });
        const processingFee = finiteAmount(input.processing_fee, { max: 1000000000 });
        const gracePeriod = Number(input.grace_period_days);
        const penaltyRate = finiteAmount(input.late_penalty_rate, { max: 1000 });
        const approvalThreshold = finiteAmount(input.approval_threshold, { max: 1000000000 });
        if (defaultInterestRate === null || processingFee === null || !Number.isInteger(gracePeriod) ||
          gracePeriod < 0 || gracePeriod > 3650 || penaltyRate === null || approvalThreshold === null) {
          return { error: "INVALID_SETTINGS" };
        }
        const { rows } = await client.query(
          `INSERT INTO loan_settings
            (organization_id, default_interest_rate, processing_fee, penalty_rate, grace_period_days, max_auto_approval_amount, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (organization_id) DO UPDATE SET
             default_interest_rate = EXCLUDED.default_interest_rate, processing_fee = EXCLUDED.processing_fee,
             penalty_rate = EXCLUDED.penalty_rate,
             grace_period_days = EXCLUDED.grace_period_days, max_auto_approval_amount = EXCLUDED.max_auto_approval_amount,
             updated_at = NOW()
           RETURNING *`,
          [organizationId, defaultInterestRate, processingFee, penaltyRate, gracePeriod, approvalThreshold]
        );
        return { loan: rows[0] };
      }
      const { rows: organizations } = await client.query(
        "SELECT settings FROM organizations WHERE id = $1 LIMIT 1",
        [organizationId]
      );
      const current = organizations[0] && organizations[0].settings || {};
      const security = {
        ...defaultSettings.security,
        ...(current.security || {}),
        ...input,
        permissions: input.permissions && typeof input.permissions === "object"
          ? input.permissions
          : (current.security && current.security.permissions) || defaultPermissions
      };
      const minimumPasswordLength = Number(security.minimum_password_length);
      const sessionTimeout = Number(security.session_timeout_hours);
      if (!Number.isInteger(minimumPasswordLength) || minimumPasswordLength < 10 || minimumPasswordLength > 128 ||
        !Number.isFinite(sessionTimeout) || sessionTimeout < 1 || sessionTimeout > 720) {
        return { error: "INVALID_SETTINGS" };
      }
      for (const role of staffRoles) {
        const permissions = security.permissions[role];
        if (!Array.isArray(permissions) || permissions.some((name) =>
          !["dashboard", "customers", "loans", "payments", "inventory", "reports", "agreements"].includes(name)
        )) return { error: "INVALID_SETTINGS" };
      }
      const nextOrganizationSettings = { ...current, security };
      await client.query(
        "UPDATE organizations SET settings = $1::jsonb WHERE id = $2 RETURNING id",
        [JSON.stringify(nextOrganizationSettings), organizationId]
      );
      return { security };
    });
    if (result.error === "INVALID_SETTINGS") return fail(res, 400, "One or more settings values are invalid.");
    const updatedSettings = await readQuery(
      `SELECT o.id, o.name, o.settings, b.company_name, b.logo_path, b.contact_phone,
              b.contact_email, b.receipt_footer, b.sms_provider,
              l.default_interest_rate, l.processing_fee, l.penalty_rate, l.grace_period_days, l.max_auto_approval_amount
       FROM organizations o
       LEFT JOIN business_settings b ON b.organization_id = o.id
       LEFT JOIN loan_settings l ON l.organization_id = o.id
       WHERE o.id = $1 LIMIT 1`,
      [organizationId],
      { organizationId }
    );
    const row = updatedSettings.rows[0];
    if (!row) return fail(res, 404, "Organization settings not found.");
    const data = baseBusinessSettings({ name: row.name, settings: row.settings });
    data.business = {
      ...data.business,
      company_name: row.company_name || row.name,
      logo_data: row.logo_path || "",
      contact_phone: row.contact_phone || "",
      contact_email: row.contact_email || "",
      receipt_footer: row.receipt_footer || data.business.receipt_footer,
      sms_enabled: Boolean(row.sms_provider),
      sms_sender_id: row.sms_provider || ""
    };
    data.loan = {
      ...data.loan,
      default_interest_rate: Number(row.default_interest_rate ?? data.loan.default_interest_rate),
      processing_fee: Number(row.processing_fee ?? data.loan.processing_fee),
      grace_period_days: Number(row.grace_period_days ?? data.loan.grace_period_days),
      late_penalty_rate: Number(row.penalty_rate ?? data.loan.late_penalty_rate),
      approval_threshold: Number(row.max_auto_approval_amount ?? data.loan.approval_threshold)
    };
    reply(res, 200, data);
  } catch (error) {
    console.error("Could not update settings:", error.message);
    fail(res, 503, "Could not update organization settings using PostgreSQL.");
  }
});

app.get("/api/customers", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "customers");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? `SELECT c.*, g.full_name AS guarantor_name, g.phone AS guarantor_phone,
                g.relationship, g.national_id AS guarantor_id, g.address AS guarantor_address
         FROM customers c LEFT JOIN LATERAL
           (SELECT * FROM guarantors WHERE customer_id = c.id ORDER BY id LIMIT 1) g ON TRUE
         ORDER BY c.created_at DESC`
      : `SELECT c.*, g.full_name AS guarantor_name, g.phone AS guarantor_phone,
                g.relationship, g.national_id AS guarantor_id, g.address AS guarantor_address
         FROM customers c LEFT JOIN LATERAL
           (SELECT * FROM guarantors WHERE customer_id = c.id AND organization_id = $1 ORDER BY id LIMIT 1) g ON TRUE
         WHERE c.organization_id = $1 ORDER BY c.created_at DESC`;
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list customers:", error.message);
    fail(res, 503, "Could not list customers using PostgreSQL.");
  }
});

app.post("/api/customers", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "customers");
  if (!organizationId) return fail(res, 403, "Customers can only be created within an organization.");
  const input = req.body || {};
  const fullName = String(input.full_name || "").trim();
  const nationalId = String(input.national_id || "").trim();
  const phone = String(input.phone || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (fullName.length < 2 || fullName.length > 180 || nationalId.length < 2 || nationalId.length > 40 ||
    phone.length < 3 || phone.length > 40 || email && !validEmail(email)) {
    return fail(res, 400, "Enter a valid customer name, national ID, phone number, and email address.");
  }
  const branchId = positiveId(input.branch_id || req.authUser.branch_id);
  if (!branchId) return fail(res, 400, "Choose an active branch in this organization.");
  const customerCode = `CUS-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  try {
    const customer = await businessTransaction(req, organizationId, "create customer", async (client) => {
      const branch = await resolveBusinessBranch(client, req, organizationId, branchId);
      if (!branch) return { error: "INVALID_BRANCH" };
      const { rows } = await client.query(
        `INSERT INTO customers
          (organization_id, branch_id, customer_code, full_name, national_id, phone, alt_phone, email,
           gender, dob, occupation, monthly_income, county, estate, address, photo, id_front, id_back, signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [
          organizationId, branch.id, customerCode, fullName, nationalId, phone,
          String(input.alt_phone || "").slice(0, 40) || null, email || null,
          String(input.gender || "").slice(0, 40) || null, validDate(input.dob) ? input.dob : null,
          String(input.occupation || "").slice(0, 140) || null,
          finiteAmount(input.monthly_income || 0, { max: 1000000000 }),
          String(input.county || "").slice(0, 80) || null, String(input.estate || "").slice(0, 140) || null,
          String(input.address || "").slice(0, 2000) || null, input.photo || null,
          input.id_front || null, input.id_back || null, input.signature || null
        ]
      );
      const created = rows[0];
      const guarantorName = String(input.guarantor_name || "").trim();
      const guarantorPhone = String(input.guarantor_phone || "").trim();
      if (guarantorName || guarantorPhone) {
        if (guarantorName.length < 2 || guarantorPhone.length < 3 || guarantorName.length > 180 || guarantorPhone.length > 40) {
          return { error: "INVALID_GUARANTOR" };
        }
        await client.query(
          `INSERT INTO guarantors
            (organization_id, branch_id, customer_id, full_name, national_id, phone, relationship, address)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            organizationId, branch.id, created.id, guarantorName,
            String(input.guarantor_id || "").slice(0, 40) || null,
            guarantorPhone, String(input.relationship || "").slice(0, 80) || null,
            String(input.guarantor_address || "").slice(0, 2000) || null
          ]
        );
        return { ...created, guarantor_name: guarantorName, guarantor_phone: guarantorPhone };
      }
      return created;
    });
    if (customer.error === "INVALID_BRANCH") return fail(res, 400, "Choose an active branch in this organization.");
    if (customer.error === "INVALID_GUARANTOR") return fail(res, 400, "Enter a valid guarantor name and phone number.");
    reply(res, 201, customer);
  } catch (error) {
    if (error.code === "23505") return fail(res, 409, "That national ID is already registered in this organization.");
    console.error("Could not create customer:", error.message);
    fail(res, 503, "Could not create the customer using PostgreSQL.");
  }
});

app.delete("/api/customers/:id", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "customers");
  if (!organizationId) return fail(res, 403, "Customer records can only be deleted within an organization.");
  if (!["Admin", "Super Admin"].includes(req.authUser.role)) return fail(res, 403, "Administrator permission required to delete customers.");
  const customerId = positiveId(req.params.id);
  if (!customerId) return fail(res, 400, "Choose a valid customer.");
  try {
    const result = await businessTransaction(req, organizationId, "delete customer", async (client) =>
      client.query(
        "DELETE FROM customers WHERE id = $1 AND organization_id = $2 RETURNING id",
        [customerId, organizationId]
      )
    );
    if (!result.rows[0]) return fail(res, 404, "Customer not found in this organization.");
    reply(res, 200, { message: "Customer deleted." });
  } catch (error) {
    if (error.code === "23503") return fail(res, 409, "This customer has linked business records and cannot be deleted.");
    console.error("Could not delete customer:", error.message);
    fail(res, 503, "Could not delete the customer using PostgreSQL.");
  }
});

app.delete("/api/customers", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "customers");
  if (!organizationId || !["Admin", "Super Admin"].includes(req.authUser.role)) {
    return fail(res, 403, "Administrator support override required to clear customer records.");
  }
  try {
    const result = await businessTransaction(req, organizationId, "clear customer and linked business records", async (client) => {
      const statements = [
        "DELETE FROM agreements WHERE organization_id = $1",
        "DELETE FROM installment_payments WHERE organization_id = $1",
        "DELETE FROM sales WHERE organization_id = $1",
        "DELETE FROM payments WHERE organization_id = $1",
        "DELETE FROM penalties WHERE organization_id = $1",
        "DELETE FROM loan_schedule WHERE organization_id = $1",
        "DELETE FROM loans WHERE organization_id = $1",
        "DELETE FROM guarantors WHERE organization_id = $1",
        "DELETE FROM customers WHERE organization_id = $1"
      ];
      let deleted = 0;
      for (const statement of statements) {
        const { rowCount } = await client.query(statement, [organizationId]);
        deleted += rowCount || 0;
      }
      return { deleted };
    });
    reply(res, 200, { message: "Customer and linked business records cleared.", deleted: result.deleted });
  } catch (error) {
    console.error("Could not clear customer records:", error.message);
    fail(res, 503, "Could not clear customer records using PostgreSQL.");
  }
});

app.get("/api/loans", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "loans");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? `SELECT l.*, c.full_name AS customer_name, c.phone AS customer_phone,
                COALESCE(u.full_name, 'Unassigned') AS assigned_officer
         FROM loans l JOIN customers c ON c.id = l.customer_id
         LEFT JOIN users u ON u.id = l.assigned_officer ORDER BY l.created_at DESC`
      : `SELECT l.*, c.full_name AS customer_name, c.phone AS customer_phone,
                COALESCE(u.full_name, 'Unassigned') AS assigned_officer
         FROM loans l JOIN customers c ON c.id = l.customer_id AND c.organization_id = l.organization_id
         LEFT JOIN users u ON u.id = l.assigned_officer AND u.organization_id = l.organization_id
         WHERE l.organization_id = $1 ORDER BY l.created_at DESC`;
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list loans:", error.message);
    fail(res, 503, "Could not list loans using PostgreSQL.");
  }
});

app.post("/api/loans", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "loans");
  if (!organizationId) return fail(res, 403, "Loans can only be created within an organization.");
  const input = req.body || {};
  const customerId = positiveId(input.customer_id);
  const principal = finiteAmount(input.principal_amount, { min: 0.01 });
  const interestRate = finiteAmount(input.interest_rate, { max: 1000 });
  const processingFee = finiteAmount(input.processing_fee || 0, { max: 1000000000 });
  const duration = Number(input.duration);
  const frequency = input.repayment_frequency;
  if (!customerId || principal === null || interestRate === null || processingFee === null ||
    !Number.isInteger(duration) || duration < 1 || duration > 600 ||
    !["Daily", "Weekly", "Monthly"].includes(frequency) || !validDate(input.due_date) ||
    input.due_date < new Date().toISOString().slice(0, 10)) {
    return fail(res, 400, "Enter valid customer, amount, installment, frequency, and due-date details.");
  }
  const interest = Math.round(principal * interestRate) / 100;
  const totalPayable = Math.round((principal + interest + processingFee) * 100) / 100;
  const loanCode = `LN-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  try {
    const loan = await businessTransaction(req, organizationId, "create loan", async (client) => {
      const { rows: customers } = await client.query(
        "SELECT id, organization_id, branch_id, full_name, phone FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1",
        [customerId, organizationId]
      );
      const customer = customers[0];
      if (!customer || !await resolveBusinessBranch(client, req, organizationId, customer.branch_id)) {
        return { error: "CUSTOMER_NOT_FOUND" };
      }
      const { rows: loanSettings } = await client.query(
        "SELECT max_auto_approval_amount FROM loan_settings WHERE organization_id = $1 LIMIT 1",
        [organizationId]
      );
      const approvalThreshold = Number(loanSettings[0] && loanSettings[0].max_auto_approval_amount || 50000);
      const status = totalPayable >= approvalThreshold ? "Pending" : "Active";
      const { rows } = await client.query(
        `INSERT INTO loans
          (organization_id, branch_id, loan_code, customer_id, principal_amount, interest_rate,
           processing_fee, total_payable, total_paid, balance, repayment_frequency, start_date,
           due_date, status, assigned_officer, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8, $9, CURRENT_DATE, $10, $11, $12, $13)
         RETURNING *`,
        [
          organizationId, customer.branch_id, loanCode, customer.id, principal, interestRate,
          processingFee, totalPayable, frequency, input.due_date, status,
          req.authUser.id, status === "Active" ? req.authUser.id : null
        ]
      );
      const created = rows[0];
      const intervalDays = frequency === "Daily" ? 1 : frequency === "Weekly" ? 7 : 30;
      const dueDate = new Date(`${input.due_date}T00:00:00Z`);
      let allocated = 0;
      for (let index = 0; index < duration; index += 1) {
        const installment = index === duration - 1
          ? Math.round((totalPayable - allocated) * 100) / 100
          : Math.round((totalPayable / duration) * 100) / 100;
        allocated += installment;
        const installmentDate = new Date(dueDate.getTime() - (duration - index - 1) * intervalDays * 86400000);
        await client.query(
          `INSERT INTO loan_schedule
            (organization_id, branch_id, loan_id, installment_number, due_date, expected_amount, paid_amount, status)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 'Pending')`,
          [organizationId, customer.branch_id, created.id, index + 1, installmentDate.toISOString().slice(0, 10), installment]
        );
      }
      return { ...created, customer_name: customer.full_name, customer_phone: customer.phone, assigned_officer: req.authUser.full_name };
    });
    if (loan.error) return fail(res, 404, "Customer not found in this organization or branch.");
    reply(res, 201, loan);
  } catch (error) {
    console.error("Could not create loan:", error.message);
    fail(res, 503, "Could not create the loan using PostgreSQL.");
  }
});

app.post("/api/loans/:id/approve", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "loans");
  if (!organizationId || !["Admin", "Super Admin"].includes(req.authUser.role)) {
    return fail(res, 403, "Administrator permission required to approve loans.");
  }
  const loanId = positiveId(req.params.id);
  if (!loanId) return fail(res, 400, "Choose a valid loan.");
  try {
    const result = await businessTransaction(req, organizationId, "approve loan", async (client) =>
      client.query(
        `UPDATE loans SET status = 'Active', approved_by = $1
         WHERE id = $2 AND organization_id = $3 AND status = 'Pending'
         RETURNING *`,
        [req.authUser.id, loanId, organizationId]
      )
    );
    if (!result.rows[0]) return fail(res, 404, "Pending loan not found in this organization.");
    reply(res, 200, result.rows[0]);
  } catch (error) {
    console.error("Could not approve loan:", error.message);
    fail(res, 503, "Could not approve the loan using PostgreSQL.");
  }
});

app.get("/api/payments", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "payments");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? `SELECT p.*, c.full_name AS customer_name, c.phone AS customer_phone,
                l.loan_code, u.full_name AS received_by_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id
         JOIN loans l ON l.id = p.loan_id
         LEFT JOIN users u ON u.id = p.received_by
         ORDER BY p.payment_date DESC`
      : `SELECT p.*, c.full_name AS customer_name, c.phone AS customer_phone,
                l.loan_code, u.full_name AS received_by_name
         FROM payments p
         JOIN customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
         JOIN loans l ON l.id = p.loan_id AND l.organization_id = p.organization_id
         LEFT JOIN users u ON u.id = p.received_by AND u.organization_id = p.organization_id
         WHERE p.organization_id = $1 ORDER BY p.payment_date DESC`;
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list payments:", error.message);
    fail(res, 503, "Could not list payments using PostgreSQL.");
  }
});

app.post("/api/payments", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "payments");
  if (!organizationId) return fail(res, 403, "Payments can only be recorded within an organization.");
  const input = req.body || {};
  const loanId = positiveId(input.loan_id);
  const amount = finiteAmount(input.amount_paid, { min: 0.01 });
  const method = input.payment_method;
  if (!loanId || amount === null || !["Cash", "M-Pesa", "Bank Transfer", "Card"].includes(method)) {
    return fail(res, 400, "Enter a valid loan, payment amount, and payment method.");
  }
  const paymentCode = `PAY-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  try {
    const payment = await businessTransaction(req, organizationId, "record loan payment", async (client) => {
      const { rows: loans } = await client.query(
        `SELECT l.*, c.full_name AS customer_name, c.phone AS customer_phone
         FROM loans l JOIN customers c ON c.id = l.customer_id AND c.organization_id = l.organization_id
         WHERE l.id = $1 AND l.organization_id = $2 AND l.status <> 'Pending'
         FOR UPDATE OF l`,
        [loanId, organizationId]
      );
      const loan = loans[0];
      if (!loan || !await resolveBusinessBranch(client, req, organizationId, loan.branch_id)) {
        return { error: "LOAN_NOT_FOUND" };
      }
      const currentBalance = finiteAmount(loan.balance);
      if (currentBalance === null || amount > currentBalance) return { error: "PAYMENT_EXCEEDS_BALANCE" };
      const balanceAfter = Math.max(0, Math.round((currentBalance - amount) * 100) / 100);
      const { rows } = await client.query(
        `INSERT INTO payments
          (organization_id, branch_id, payment_code, loan_id, customer_id, amount_paid, payment_method,
           transaction_code, notes, received_by, payment_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          organizationId, loan.branch_id, paymentCode, loan.id, loan.customer_id, amount, method,
          String(input.transaction_code || "").trim().slice(0, 120) || null,
          String(input.notes || "").trim().slice(0, 2000) || null, req.authUser.id
        ]
      );
      await client.query(
        `UPDATE loans
         SET total_paid = total_paid + $1, balance = GREATEST(balance - $1, 0),
             status = CASE WHEN GREATEST(balance - $1, 0) = 0 THEN 'Completed' ELSE status END
         WHERE id = $2 AND organization_id = $3`,
        [amount, loan.id, organizationId]
      );
      let unapplied = amount;
      const { rows: schedule } = await client.query(
        `SELECT id, expected_amount, paid_amount FROM loan_schedule
         WHERE loan_id = $1 AND organization_id = $2 ORDER BY installment_number FOR UPDATE`,
        [loan.id, organizationId]
      );
      for (const installment of schedule) {
        if (unapplied <= 0) break;
        const remaining = Math.max(0, Number(installment.expected_amount) - Number(installment.paid_amount));
        if (!remaining) continue;
        const applied = Math.min(unapplied, remaining);
        const paidAmount = Math.round((Number(installment.paid_amount) + applied) * 100) / 100;
        await client.query(
          `UPDATE loan_schedule SET paid_amount = $1,
             status = CASE WHEN paid_amount + $2 >= expected_amount THEN 'Paid' ELSE 'Partially Paid' END
           WHERE id = $3 AND organization_id = $4`,
          [paidAmount, applied, installment.id, organizationId]
        );
        unapplied = Math.round((unapplied - applied) * 100) / 100;
      }
      return {
        ...rows[0],
        customer_name: loan.customer_name,
        customer_phone: loan.customer_phone,
        loan_code: loan.loan_code,
        received_by_name: req.authUser.full_name,
        balance_after: balanceAfter
      };
    });
    if (payment.error === "LOAN_NOT_FOUND") return fail(res, 404, "Loan not found in this organization or branch.");
    if (payment.error === "PAYMENT_EXCEEDS_BALANCE") return fail(res, 400, "Payment amount exceeds the outstanding loan balance.");
    reply(res, 201, payment);
  } catch (error) {
    console.error("Could not record payment:", error.message);
    fail(res, 503, "Could not record the payment using PostgreSQL.");
  }
});

app.get("/api/inventory", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "inventory");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? "SELECT * FROM inventory ORDER BY created_at DESC"
      : "SELECT * FROM inventory WHERE organization_id = $1 ORDER BY created_at DESC";
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list inventory:", error.message);
    fail(res, 503, "Could not list inventory using PostgreSQL.");
  }
});

app.post("/api/inventory", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "inventory");
  if (!organizationId) return fail(res, 403, "Inventory can only be changed within an organization.");
  const input = req.body || {};
  const productName = String(input.product_name || "").trim();
  const category = String(input.category || "");
  const quantity = Number(input.quantity);
  const buyingPrice = finiteAmount(input.buying_price);
  const sellingPrice = finiteAmount(input.selling_price);
  if (productName.length < 2 || productName.length > 180 || !allowedProductCategories.includes(category) ||
    !Number.isInteger(quantity) || quantity < 0 || quantity > 100000000 ||
    buyingPrice === null || sellingPrice === null) {
    return fail(res, 400, "Enter a valid product name, category, stock quantity, and prices.");
  }
  try {
    const product = await businessTransaction(req, organizationId, "create inventory item", async (client) => {
      const branch = await resolveBusinessBranch(client, req, organizationId, input.branch_id);
      if (!branch) return { error: "INVALID_BRANCH" };
      const { rows } = await client.query(
        `INSERT INTO inventory
          (organization_id, branch_id, product_name, category, quantity, buying_price, selling_price,
           description, condition, serial_number, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          organizationId, branch.id, productName, category, quantity, buyingPrice, sellingPrice,
          String(input.description || "").slice(0, 4000) || null,
          String(input.condition || "").slice(0, 80) || null,
          String(input.serial_number || "").slice(0, 120) || null,
          input.image || null
        ]
      );
      return rows[0];
    });
    if (product.error) return fail(res, 400, "Choose an active branch in this organization.");
    reply(res, 201, product);
  } catch (error) {
    console.error("Could not create inventory item:", error.message);
    fail(res, 503, "Could not create the inventory item using PostgreSQL.");
  }
});

app.delete("/api/inventory/:id", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "inventory");
  if (!organizationId) return fail(res, 403, "Inventory can only be changed within an organization.");
  const productId = positiveId(req.params.id);
  if (!productId) return fail(res, 400, "Choose a valid inventory item.");
  try {
    const result = await businessTransaction(req, organizationId, "delete inventory item", async (client) =>
      client.query(
        "DELETE FROM inventory WHERE id = $1 AND organization_id = $2 RETURNING id",
        [productId, organizationId]
      )
    );
    if (!result.rows[0]) return fail(res, 404, "Inventory item not found in this organization.");
    reply(res, 200, { message: "Inventory item deleted." });
  } catch (error) {
    if (error.code === "23503") return fail(res, 409, "This item has linked sales and cannot be deleted.");
    console.error("Could not delete inventory item:", error.message);
    fail(res, 503, "Could not delete the inventory item using PostgreSQL.");
  }
});

app.delete("/api/inventory", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "inventory");
  if (!organizationId || !["Admin", "Super Admin"].includes(req.authUser.role)) {
    return fail(res, 403, "Administrator support override required to clear inventory.");
  }
  try {
    const result = await businessTransaction(req, organizationId, "clear inventory and linked sales", async (client) => {
      await client.query(
        "DELETE FROM agreements WHERE organization_id = $1 AND sale_id IN (SELECT id FROM sales WHERE organization_id = $1)",
        [organizationId]
      );
      await client.query(
        "DELETE FROM installment_payments WHERE organization_id = $1",
        [organizationId]
      );
      await client.query("DELETE FROM sales WHERE organization_id = $1", [organizationId]);
      return client.query("DELETE FROM inventory WHERE organization_id = $1", [organizationId]);
    });
    reply(res, 200, { message: "Inventory and linked sales cleared.", deleted: result.rowCount || 0 });
  } catch (error) {
    console.error("Could not clear inventory:", error.message);
    fail(res, 503, "Could not clear inventory using PostgreSQL.");
  }
});

app.get("/api/agreements", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "agreements");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? `SELECT a.*, c.full_name AS customer_name, c.customer_code
         FROM agreements a JOIN customers c ON c.id = a.customer_id ORDER BY a.created_at DESC`
      : `SELECT a.*, c.full_name AS customer_name, c.customer_code
         FROM agreements a JOIN customers c ON c.id = a.customer_id AND c.organization_id = a.organization_id
         WHERE a.organization_id = $1 ORDER BY a.created_at DESC`;
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list agreements:", error.message);
    fail(res, 503, "Could not list agreements using PostgreSQL.");
  }
});

app.get("/api/sales", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessRead(req, res, "payments");
  if (organizationId === null && !isSuperAdmin(req)) return;
  try {
    const query = organizationId == null
      ? `SELECT s.*, c.full_name AS customer_name, i.product_name,
                u.full_name AS cashier_name
         FROM sales s JOIN inventory i ON i.id = s.inventory_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN users u ON u.id = s.sold_by
         ORDER BY s.sale_date DESC`
      : `SELECT s.*, c.full_name AS customer_name, i.product_name,
                u.full_name AS cashier_name
         FROM sales s JOIN inventory i ON i.id = s.inventory_id AND i.organization_id = s.organization_id
         LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
         LEFT JOIN users u ON u.id = s.sold_by AND u.organization_id = s.organization_id
         WHERE s.organization_id = $1 ORDER BY s.sale_date DESC`;
    const { rows } = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, rows);
  } catch (error) {
    console.error("Could not list sales:", error.message);
    fail(res, 503, "Could not list sales using PostgreSQL.");
  }
});

app.post("/api/sales", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "payments");
  if (!organizationId) return fail(res, 403, "Sales can only be recorded within an organization.");
  const input = req.body || {};
  const inventoryId = positiveId(input.inventory_id);
  const quantity = Number(input.quantity);
  const paymentType = input.payment_type;
  const downPayment = finiteAmount(input.down_payment || 0);
  const paymentMethod = input.payment_method || "Cash";
  if (!inventoryId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000 ||
    !["Cash", "Installment"].includes(paymentType) || downPayment === null ||
    !["Cash", "M-Pesa", "Bank Transfer", "Card"].includes(paymentMethod)) {
    return fail(res, 400, "Enter a valid product, quantity, payment type, and down payment.");
  }
  const customerId = input.customer_id ? positiveId(input.customer_id) : null;
  if (input.customer_id && !customerId) return fail(res, 400, "Choose a valid customer.");
  try {
    const sale = await businessTransaction(req, organizationId, "record inventory sale", async (client) => {
      const { rows: products } = await client.query(
        "SELECT * FROM inventory WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        [inventoryId, organizationId]
      );
      const product = products[0];
      if (!product || !await resolveBusinessBranch(client, req, organizationId, product.branch_id)) {
        return { error: "PRODUCT_NOT_FOUND" };
      }
      if (quantity > Number(product.quantity)) return { error: "INSUFFICIENT_STOCK" };
      let customer = null;
      if (customerId) {
        const { rows: customers } = await client.query(
          "SELECT id, branch_id, full_name FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1",
          [customerId, organizationId]
        );
        customer = customers[0];
        if (!customer || Number(customer.branch_id) !== Number(product.branch_id)) return { error: "CUSTOMER_NOT_FOUND" };
      }
      const price = finiteAmount(product.selling_price);
      const total = Math.round(price * quantity * 100) / 100;
      if (downPayment > total || paymentType === "Cash" && downPayment !== total) return { error: "INVALID_DOWN_PAYMENT" };
      const balance = Math.round((total - downPayment) * 100) / 100;
      const { rows } = await client.query(
        `INSERT INTO sales
          (organization_id, branch_id, customer_id, inventory_id, quantity, selling_price,
           payment_type, down_payment, balance, sold_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [organizationId, product.branch_id, customerId, inventoryId, quantity, price, paymentType, downPayment, balance, req.authUser.id]
      );
      await client.query(
        "UPDATE inventory SET quantity = quantity - $1 WHERE id = $2 AND organization_id = $3",
        [quantity, inventoryId, organizationId]
      );
      if (downPayment > 0) {
        await client.query(
          `INSERT INTO installment_payments
            (organization_id, branch_id, sale_id, amount_paid, payment_method, transaction_code, received_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            organizationId, product.branch_id, rows[0].id, downPayment, paymentMethod,
            String(input.transaction_code || "").trim().slice(0, 120) || null, req.authUser.id
          ]
        );
      }
      return { ...rows[0], product_name: product.product_name, customer_name: customer && customer.full_name };
    });
    if (sale.error === "PRODUCT_NOT_FOUND") return fail(res, 404, "Inventory item not found in this organization or branch.");
    if (sale.error === "CUSTOMER_NOT_FOUND") return fail(res, 404, "Customer not found in this organization and branch.");
    if (sale.error === "INSUFFICIENT_STOCK") return fail(res, 409, "There is not enough stock to complete this sale.");
    if (sale.error === "INVALID_DOWN_PAYMENT") return fail(res, 400, "Cash sales must be paid in full; installment down payment cannot exceed the total.");
    reply(res, 201, sale);
  } catch (error) {
    console.error("Could not record sale:", error.message);
    fail(res, 503, "Could not record the sale using PostgreSQL.");
  }
});

app.post("/api/sales/:id/payments", authenticate, async (req, res) => {
  const organizationId = authorizeBusinessWrite(req, res, "payments");
  if (!organizationId) return fail(res, 403, "Sales payments can only be recorded within an organization.");
  const saleId = positiveId(req.params.id);
  const amount = finiteAmount(req.body.amount_paid, { min: 0.01 });
  const method = req.body.payment_method;
  if (!saleId || amount === null || !["Cash", "M-Pesa", "Bank Transfer", "Card"].includes(method)) {
    return fail(res, 400, "Enter a valid sale, payment amount, and payment method.");
  }
  try {
    const result = await businessTransaction(req, organizationId, "record installment sale payment", async (client) => {
      const { rows: sales } = await client.query(
        `SELECT s.*, i.product_name, c.full_name AS customer_name
         FROM sales s JOIN inventory i ON i.id = s.inventory_id AND i.organization_id = s.organization_id
         LEFT JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
         WHERE s.id = $1 AND s.organization_id = $2 FOR UPDATE OF s`,
        [saleId, organizationId]
      );
      const sale = sales[0];
      if (!sale || !await resolveBusinessBranch(client, req, organizationId, sale.branch_id)) return { error: "SALE_NOT_FOUND" };
      if (amount > Number(sale.balance)) return { error: "PAYMENT_EXCEEDS_BALANCE" };
      const { rows } = await client.query(
        `INSERT INTO installment_payments
          (organization_id, branch_id, sale_id, amount_paid, payment_method, transaction_code, received_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          organizationId, sale.branch_id, sale.id, amount, method,
          String(req.body.transaction_code || "").trim().slice(0, 120) || null, req.authUser.id
        ]
      );
      const balanceAfter = Math.max(0, Math.round((Number(sale.balance) - amount) * 100) / 100);
      await client.query(
        "UPDATE sales SET balance = $1 WHERE id = $2 AND organization_id = $3",
        [balanceAfter, sale.id, organizationId]
      );
      return { ...rows[0], sale_id: sale.id, product_name: sale.product_name, customer_name: sale.customer_name, balance_after: balanceAfter };
    });
    if (result.error === "SALE_NOT_FOUND") return fail(res, 404, "Installment sale not found in this organization or branch.");
    if (result.error === "PAYMENT_EXCEEDS_BALANCE") return fail(res, 400, "Payment amount exceeds the sale balance.");
    reply(res, 201, result);
  } catch (error) {
    console.error("Could not record installment sale payment:", error.message);
    fail(res, 503, "Could not record the installment payment using PostgreSQL.");
  }
});

app.get("/api/summary", authenticate, async (req, res) => {
  if (!requirePool(res)) return;
  const organizationId = businessOrganization(req);
  try {
    const data = await transaction(async (client) => {
      await setContext(client, { organizationId, globalReadOnly: organizationId == null });
      const tenantClause = organizationId == null ? "" : " WHERE organization_id = $1";
      const values = organizationId == null ? [] : [organizationId];
      const loanQuery = organizationId == null
        ? `SELECT l.*, c.full_name AS customer_name, c.phone AS customer_phone,
                  COALESCE(u.full_name, 'Unassigned') AS assigned_officer
           FROM loans l JOIN customers c ON c.id = l.customer_id
           LEFT JOIN users u ON u.id = l.assigned_officer ORDER BY l.created_at DESC`
        : `SELECT l.*, c.full_name AS customer_name, c.phone AS customer_phone,
                  COALESCE(u.full_name, 'Unassigned') AS assigned_officer
           FROM loans l JOIN customers c ON c.id = l.customer_id AND c.organization_id = l.organization_id
           LEFT JOIN users u ON u.id = l.assigned_officer AND u.organization_id = l.organization_id
           WHERE l.organization_id = $1 ORDER BY l.created_at DESC`;
      const paymentQuery = organizationId == null
        ? `SELECT p.*, c.full_name AS customer_name, c.phone AS customer_phone,
                  l.loan_code, u.full_name AS received_by_name
           FROM payments p JOIN customers c ON c.id = p.customer_id
           JOIN loans l ON l.id = p.loan_id LEFT JOIN users u ON u.id = p.received_by
           ORDER BY p.payment_date DESC`
        : `SELECT p.*, c.full_name AS customer_name, c.phone AS customer_phone,
                  l.loan_code, u.full_name AS received_by_name
           FROM payments p JOIN customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
           JOIN loans l ON l.id = p.loan_id AND l.organization_id = p.organization_id
           LEFT JOIN users u ON u.id = p.received_by AND u.organization_id = p.organization_id
           WHERE p.organization_id = $1 ORDER BY p.payment_date DESC`;
      const inventoryQuery = organizationId == null
        ? "SELECT * FROM inventory ORDER BY created_at DESC"
        : "SELECT * FROM inventory WHERE organization_id = $1 ORDER BY created_at DESC";
      const customerCountQuery = `SELECT COUNT(*) AS count FROM customers${tenantClause}`;
      const [loans, payments, inventory, customerCount] = await Promise.all([
        client.query(loanQuery, values),
        client.query(paymentQuery, values),
        client.query(inventoryQuery, values),
        client.query(customerCountQuery, values)
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const paymentDate = (payment) => new Date(payment.payment_date).toISOString();
      const paymentsToday = payments.rows.filter((payment) => paymentDate(payment).slice(0, 10) === today);
      const paymentsMonth = payments.rows.filter((payment) => paymentDate(payment).slice(0, 7) === month);
      const loanTrends = ["Active", "Pending", "Completed", "Defaulted"].map((status) => ({
        label: status,
        count: loans.rows.filter((loan) => loan.status === status).length
      }));
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(Date.now() - (6 - index) * 86400000);
        const isoDate = date.toISOString().slice(0, 10);
        const matching = payments.rows.filter((payment) => paymentDate(payment).slice(0, 10) === isoDate);
        return {
          label: date.toLocaleDateString("en", { weekday: "short" }),
          amount: matching.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0)
        };
      });
      const inSevenDays = Date.now() + 7 * 86400000;
      const duePayments = loans.rows.filter((loan) =>
        Number(loan.balance) > 0 && new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00Z`).getTime() <= inSevenDays
      ).slice(0, 8);
      const stockValue = inventory.rows.reduce((sum, item) =>
        sum + Number(item.quantity || 0) * Number(item.buying_price || 0), 0
      );
      const outstandingBalance = loans.rows.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
      return {
        cards: {
          totalActiveLoans: loans.rows.filter((loan) => ["Active", "Approved", "Defaulted"].includes(loan.status)).length,
          amountCollectedToday: paymentsToday.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0),
          overdueLoans: loans.rows.filter((loan) =>
            Number(loan.balance) > 0 && new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00Z`).getTime() < Date.now()
          ).length,
          totalCustomers: Number(customerCount.rows[0] && customerCount.rows[0].count || 0),
          inventoryStockValue: stockValue,
          monthlyProfit: paymentsMonth.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0),
          outstandingBalance,
          defaultedLoans: loans.rows.filter((loan) => loan.status === "Defaulted").length
        },
        repaymentSeries: days,
        loanTrend: loanTrends,
        recentTransactions: payments.rows.slice(0, 8),
        duePayments,
        lowStockAlerts: inventory.rows.filter((item) => Number(item.quantity) <= 2).slice(0, 8)
      };
    });
    reply(res, 200, data);
  } catch (error) {
    console.error("Could not calculate dashboard summary:", error.message);
    fail(res, 503, "Could not read dashboard data using PostgreSQL.");
  }
});

app.get("/api/notifications", authenticate, async (req, res) => {
  if (!requirePool(res)) return;
  if (!businessPermission(req, "inventory")) return reply(res, 200, []);
  const organizationId = businessOrganization(req);
  try {
    const query = organizationId == null
      ? "SELECT 'low_stock' AS type, id, product_name AS title, quantity AS detail, created_at FROM inventory WHERE quantity <= 2 ORDER BY created_at DESC LIMIT 20"
      : "SELECT 'low_stock' AS type, id, product_name AS title, quantity AS detail, created_at FROM inventory WHERE organization_id = $1 AND quantity <= 2 ORDER BY created_at DESC LIMIT 20";
    const result = await readQuery(query, organizationId == null ? [] : [organizationId], {
      organizationId,
      globalReadOnly: organizationId == null
    });
    reply(res, 200, result.rows);
  } catch (error) {
    console.error("Could not list notifications:", error.message);
    fail(res, 503, "Could not list notifications using PostgreSQL.");
  }
});

app.post("/api/system-backup", authenticate, async (req, res) => {
  if (!isSuperAdmin(req) && req.authUser.role !== "Admin") {
    return fail(res, 403, "Administrator permission required to download a system backup.");
  }
  if (!requirePool(res)) return;
  const selectedOrgId = selectedOrganization(req);
  try {
    const createdAt = new Date().toISOString();
    const organizations = await transaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await setContext(client, { globalReadOnly: true });
      const orgResult = selectedOrgId == null
        ? await client.query("SELECT id FROM organizations ORDER BY id")
        : await client.query("SELECT id FROM organizations WHERE id = $1 LIMIT 1", [selectedOrgId]);
      const tenantIds = orgResult.rows.map((row) => Number(row.id));
      const exportTables = [
        "branches", "customers", "guarantors", "loans", "loan_schedule", "payments",
        "penalties", "inventory", "sales", "installment_payments", "agreements",
        "business_settings", "loan_settings", "activity_logs"
      ];
      const exports = [];

      for (const organizationId of tenantIds) {
        await setContext(client, { organizationId, globalReadOnly: false });
        const { rows: organizationRows } = await client.query(
          "SELECT id, name, status, settings, created_at FROM organizations WHERE id = $1 LIMIT 1",
          [organizationId]
        );
        if (!organizationRows[0]) continue;

        const data = {};
        for (const table of exportTables) {
          const { rows } = await client.query(
            `SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id`,
            [organizationId]
          );
          data[table] = rows;
        }
        const { rows: users } = await client.query(
          `SELECT id, user_uuid, organization_id, branch_id, full_name, email, phone,
                  employee_id, role, status, created_at, approved_at, approved_by
           FROM users WHERE organization_id = $1 ORDER BY id`,
          [organizationId]
        );
        data.users = users;
        const { rows: supportAudit } = await client.query(
          "SELECT * FROM support_override_audit WHERE organization_id = $1 ORDER BY id",
          [organizationId]
        );
        data.support_override_audit = supportAudit;
        exports.push({ organization: organizationRows[0], data });
      }
      return exports;
    });

    if (selectedOrgId != null && !organizations.length) {
      return fail(res, 404, "Organization not found for this backup.");
    }
    reply(res, 200, {
      file_name: `draman-backup-${createdAt.slice(0, 10)}.json`,
      created_at: createdAt,
      format_version: 1,
      organizations
    });
  } catch (error) {
    console.error("Could not create PostgreSQL backup:", error.message);
    fail(res, 503, "Could not create the system backup using PostgreSQL.");
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return fail(res, 404, "API route not found.");
  }
  const file = publicFiles[req.path];
  if (!file) return res.status(404).send("Not found");
  const filePath = path.join(__dirname, file);
  fs.readFile(filePath).then((content) => {
    res.set("Content-Type", mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    res.set("Cache-Control", "no-store");
    res.send(content);
  }).catch((error) => {
    console.error(`Failed to serve ${file}:`, error.message);
    res.status(500).send("Internal server error");
  });
});

app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);
  fail(res, error.type === "entity.too.large" ? 413 : 400, "The request could not be processed.");
});

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`DRAMAN LMS API listening on http://localhost:${PORT}`));
}

module.exports = app;
module.exports.app = app;
module.exports.transaction = transaction;
module.exports.setContext = setContext;
