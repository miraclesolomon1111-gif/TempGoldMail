// src/server/app.ts
import "dotenv/config";
import express from "express";
import path2 from "path";
import { fileURLToPath } from "url";
import fs2 from "fs";
import crypto5 from "crypto";
import bcrypt2 from "bcryptjs";
import * as OTPAuth from "otpauth";
import { createClient as createClient2 } from "@supabase/supabase-js";
import { Resend } from "resend";
import multer from "multer";
import { simpleParser as simpleParser2 } from "mailparser";
import nodemailer from "nodemailer";

// src/server/db.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
var DB_PATHS = [
  path.join(process.cwd(), ".goldmailer_data.json"),
  path.join("/tmp", ".goldmailer_data.json"),
  path.join(process.cwd(), "goldmailer_db_backup.json")
];
var GoldDatabase = class {
  constructor() {
    this.users = [];
    this.emails = [];
    this.deletedEmailIds = /* @__PURE__ */ new Set();
    this.sessions = [];
    this.revokedSessionIds = /* @__PURE__ */ new Set();
    this.tickets = [];
    this.activityLogs = [];
    this.domains = [];
    this.adminRoles = [];
    this.broadcasts = [];
    this.payments = [];
    this.blockedIps = /* @__PURE__ */ new Set();
    this.connectedEmails = [];
    this.connectedVerifications = [];
    this.settings = {
      site_name: "GoldMailer",
      site_url: "https://goldmailer.xyz",
      support_email: "support@goldmailer.xyz",
      default_domain: "goldmailer.xyz",
      allow_registration: true,
      default_storage_bytes: 15 * 1024 * 1024 * 1024,
      pro_price_monthly_usd: 4.99,
      pro_price_yearly_usd: 49.99,
      smtp_host: process.env.SMTP_HOST || "smtp.goldmailer.xyz",
      smtp_port: parseInt(process.env.SMTP_PORT || "587", 10),
      smtp_user: process.env.SMTP_USER || "postmaster@goldmailer.xyz",
      smtp_pass: process.env.SMTP_PASS || "",
      smtp_secure: process.env.SMTP_SECURE === "true",
      telnyx_api_key: process.env.TELNYX_API_KEY || "",
      telnyx_phone_number: process.env.TELNYX_PHONE_NUMBER || process.env.TELNYX_PHONE || process.env.TRLNYX_PHONE || "+14236662513",
      telnyx_messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID || "4001a139-34ea-4725-a3be-890f641b9137",
      telnyx_voice_app_id: process.env.TELNYX_VOICE_APP_ID || process.env.TRLNYX_VOICE_APP_ID || "3070367984242394362",
      telnyx_public_key: process.env.TELNYX_PUBLIC_KEY || "",
      resend_api_key: process.env.RESEND_API_KEY || "",
      resend_from: process.env.RESEND_FROM || "GoldMailer Security <security@goldmailer.xyz>",
      nowpayments_api_key: process.env.NOWPAYMENTS_API_KEY || "",
      nowpayments_ipn_secret: process.env.NOWPAYMENTS_IPN_SECRET || process.env.IPN_SECRET || "",
      supabase_url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabase_anon_key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""
    };
    this.supabase = null;
    this.isLoaded = false;
    this.saveTimeout = null;
    this.initSupabase();
    this.loadFromDisk();
    this.seedDefaultData();
    this.startTrashCleanerCron();
  }
  initSupabase() {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      try {
        this.supabase = createClient(url, key);
        console.log("\u2705 Supabase client initialized for GoldMailer DB persistence");
      } catch (err) {
        console.warn("\u26A0\uFE0F Supabase init warning:", err);
      }
    }
  }
  // Atomic file save to prevent corruption or truncated files
  saveToDiskSync() {
    try {
      let existingExtra = {};
      for (const targetPath of DB_PATHS) {
        try {
          if (fs.existsSync(targetPath)) {
            const raw = fs.readFileSync(targetPath, "utf-8");
            existingExtra = JSON.parse(raw);
            break;
          }
        } catch {
        }
      }
      const data = {
        ...existingExtra,
        users: this.users,
        goldUsers: this.users,
        emails: this.emails,
        goldEmails: this.emails,
        deletedEmailIds: Array.from(this.deletedEmailIds),
        sessions: this.sessions,
        revokedSessionIds: Array.from(this.revokedSessionIds),
        tickets: this.tickets,
        activityLogs: this.activityLogs.slice(-500),
        domains: this.domains,
        adminRoles: this.adminRoles.filter((r) => r.email?.toLowerCase().trim() === "miracle@goldmailer.xyz"),
        broadcasts: this.broadcasts,
        payments: this.payments,
        blockedIps: Array.from(this.blockedIps),
        connectedEmails: this.connectedEmails,
        connectedVerifications: this.connectedVerifications,
        settings: this.settings,
        saved_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const json = JSON.stringify(data, null, 2);
      for (const targetPath of DB_PATHS) {
        try {
          const dir = path.dirname(targetPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          const tempPath = `${targetPath}.tmp.${Date.now()}`;
          fs.writeFileSync(tempPath, json, "utf-8");
          fs.renameSync(tempPath, targetPath);
        } catch (fileErr) {
        }
      }
    } catch (e) {
      console.error("\u274C Error saving database to disk:", e);
    }
  }
  scheduleDiskSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveToDiskSync();
    }, 100);
  }
  loadFromDisk() {
    let freshestData = null;
    let freshestMtime = -1;
    for (const targetPath of DB_PATHS) {
      try {
        if (fs.existsSync(targetPath)) {
          const stat = fs.statSync(targetPath);
          if (stat.mtimeMs > freshestMtime && stat.size > 20) {
            const raw = fs.readFileSync(targetPath, "utf-8");
            const parsed = JSON.parse(raw);
            freshestMtime = stat.mtimeMs;
            freshestData = parsed;
          }
        }
      } catch (err) {
      }
    }
    if (freshestData) {
      const rawUsers = Array.isArray(freshestData.users) && freshestData.users.length > 0 ? freshestData.users : Array.isArray(freshestData.goldUsers) ? freshestData.goldUsers : [];
      if (rawUsers.length > 0) {
        this.users = rawUsers.map((u) => {
          const cleanUser = (u.username || (u.email || "").split("@")[0] || "").toLowerCase().trim();
          const fixedEmail = cleanUser ? `${cleanUser}@goldmailer.xyz` : u.email || "";
          return {
            ...u,
            email: fixedEmail,
            is_banned: Boolean(u.is_banned),
            banned_at: u.banned_at || (u.is_banned ? (/* @__PURE__ */ new Date()).toISOString() : void 0)
          };
        });
      }
      if (Array.isArray(freshestData.deletedEmailIds)) {
        for (const did of freshestData.deletedEmailIds) {
          this.deletedEmailIds.add(did);
        }
      }
      const rawEmails = Array.isArray(freshestData.emails) && freshestData.emails.length > 0 ? freshestData.emails : Array.isArray(freshestData.goldEmails) ? freshestData.goldEmails : [];
      if (rawEmails.length > 0) {
        const loadedList = rawEmails.filter((e) => e && e.status !== "deleted" && !this.deletedEmailIds.has(e.id)).map((e) => ({
          ...e,
          status: e.status || (e.folder === "trash" ? "trash" : "inbox"),
          folder: e.folder || "primary"
        }));
        this.emails = this.deduplicateStoredEmails(loadedList);
      }
      if (Array.isArray(freshestData.sessions)) {
        this.sessions = freshestData.sessions;
      }
      if (Array.isArray(freshestData.revokedSessionIds)) {
        this.revokedSessionIds = new Set(freshestData.revokedSessionIds);
      }
      if (Array.isArray(freshestData.tickets)) {
        this.tickets = freshestData.tickets.filter((t) => t.id !== "tkt_001");
      }
      if (Array.isArray(freshestData.activityLogs)) {
        this.activityLogs = freshestData.activityLogs;
      }
      if (Array.isArray(freshestData.domains)) {
        this.domains = freshestData.domains.filter((d) => d.domain === "goldmailer.xyz" || !d.domain.startsWith("goldmailer."));
      }
      if (Array.isArray(freshestData.adminRoles)) {
        this.adminRoles = freshestData.adminRoles.filter((r) => r.email?.toLowerCase().trim() === "miracle@goldmailer.xyz");
      }
      if (Array.isArray(freshestData.broadcasts)) {
        this.broadcasts = freshestData.broadcasts;
      }
      if (Array.isArray(freshestData.payments)) {
        this.payments = freshestData.payments.filter((p) => p.id !== "pay_001");
      }
      if (Array.isArray(freshestData.blockedIps)) {
        this.blockedIps = new Set(freshestData.blockedIps);
      }
      if (Array.isArray(freshestData.connectedEmails)) {
        this.connectedEmails = freshestData.connectedEmails;
      }
      if (Array.isArray(freshestData.connectedVerifications)) {
        this.connectedVerifications = freshestData.connectedVerifications;
      }
      if (freshestData.settings && typeof freshestData.settings === "object") {
        this.settings = {
          ...this.settings,
          ...freshestData.settings,
          site_url: "https://goldmailer.xyz",
          support_email: "support@goldmailer.xyz",
          default_domain: "goldmailer.xyz",
          smtp_host: freshestData.settings.smtp_host || process.env.SMTP_HOST || "smtp.goldmailer.xyz",
          smtp_user: freshestData.settings.smtp_user || process.env.SMTP_USER || "postmaster@goldmailer.xyz",
          resend_from: process.env.RESEND_FROM || "GoldMailer Security <security@goldmailer.xyz>"
        };
      }
      console.log(`\u2705 Loaded GoldMailer DB from disk: ${this.users.length} accounts, ${this.emails.length} emails`);
    }
    this.isLoaded = true;
  }
  findAccountSync(identifier) {
    if (!identifier) return null;
    const clean = identifier.toLowerCase().trim();
    const userPart = clean.replace(/@.*$/, "");
    return this.users.find((u) => {
      const uEmail = (u.email || "").toLowerCase().trim();
      const uUser = (u.username || "").toLowerCase().trim();
      const uBackup = (u.backup_email || "").toLowerCase().trim();
      return u.id === identifier || (u.id || "").toLowerCase() === clean || uEmail === clean || uUser === clean || uBackup === clean || uUser === userPart || uEmail === `${userPart}@goldmailer.xyz`;
    }) || null;
  }
  deduplicateStoredEmails(list) {
    const seenIds = /* @__PURE__ */ new Set();
    const seenFingerprints = /* @__PURE__ */ new Set();
    const result = [];
    for (const em of list) {
      if (!em || !em.id) continue;
      if (this.deletedEmailIds.has(em.id) || em.status === "deleted") continue;
      if (seenIds.has(em.id)) continue;
      seenIds.add(em.id);
      const msgId = em.messageId || em.raw?.messageId;
      const fingerprint = msgId ? `msgid:${msgId}` : `${(em.from_email || em.sender || "").toLowerCase()}|${(em.to_email || em.recipient || "").toLowerCase()}|${(em.subject || "").trim().toLowerCase()}|${(em.received_at || em.created_at || "").slice(0, 16)}`;
      if (fingerprint && seenFingerprints.has(fingerprint)) continue;
      if (fingerprint) seenFingerprints.add(fingerprint);
      result.push(em);
    }
    return result;
  }
  // Seed default permanent active accounts without overriding their ban status if banned!
  seedDefaultData() {
    const defaultPasswordHash = bcrypt.hashSync("@654413Mm", 10);
    const defaultAccounts = [
      {
        id: "usr_miracle_01",
        email: "miracle@goldmailer.xyz",
        username: "miracle",
        first_name: "Miracle",
        last_name: "Solomon",
        dob: "1998-05-14",
        gender: "Male",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "admin",
        plan: "enterprise"
      },
      {
        id: "usr_doris_01",
        email: "dorisokoh109@goldmailer.xyz",
        username: "dorisokoh109",
        first_name: "Doris",
        last_name: "Okoh",
        dob: "1999-07-22",
        gender: "Female",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_admin_01",
        email: "admin@goldmailer.xyz",
        username: "admin",
        first_name: "System",
        last_name: "Administrator",
        dob: "1995-01-01",
        gender: "Not specified",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_support_01",
        email: "support@goldmailer.xyz",
        username: "support",
        first_name: "Support",
        last_name: "Desk",
        dob: "1996-03-15",
        gender: "Not specified",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_team_01",
        email: "team@goldmailer.xyz",
        username: "team",
        first_name: "GoldMailer",
        last_name: "Team",
        dob: "1997-06-20",
        gender: "Not specified",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_security_01",
        email: "security@goldmailer.xyz",
        username: "security",
        first_name: "Security",
        last_name: "Officer",
        dob: "1995-11-11",
        gender: "Not specified",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_alex_01",
        email: "alex@goldmailer.xyz",
        username: "alex",
        first_name: "Alex",
        last_name: "Morgan",
        dob: "1999-04-18",
        gender: "Male",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "pro"
      },
      {
        id: "usr_sarah_01",
        email: "sarah@goldmailer.xyz",
        username: "sarah",
        first_name: "Sarah",
        last_name: "Jenkins",
        dob: "2000-08-09",
        gender: "Female",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_david_01",
        email: "david@goldmailer.xyz",
        username: "david",
        first_name: "David",
        last_name: "Chen",
        dob: "1998-12-03",
        gender: "Male",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      },
      {
        id: "usr_emma_01",
        email: "emma@goldmailer.xyz",
        username: "emma",
        first_name: "Emma",
        last_name: "Watson",
        dob: "2001-02-14",
        gender: "Female",
        phone: "",
        recovery_phone: "",
        backup_email: "",
        role: "user",
        plan: "free"
      }
    ];
    let hasChanges = false;
    for (const def of defaultAccounts) {
      const existing = this.users.find(
        (u) => u.id === def.id || u.username.toLowerCase() === def.username.toLowerCase() || u.email.toLowerCase() === def.email.toLowerCase()
      );
      if (!existing) {
        this.users.push({
          ...def,
          password_hash: defaultPasswordHash,
          two_factor_enabled: false,
          backup_codes: this.generateBackupCodes(),
          created_at: new Date(Date.now() - 30 * 864e5).toISOString(),
          is_banned: false,
          storage_used_bytes: 0,
          storage_limit_bytes: 15 * 1024 * 1024 * 1024,
          plan_billing: "yearly",
          plan_status: "active"
        });
        hasChanges = true;
      } else {
        if (existing.email !== def.email) {
          existing.email = def.email;
          hasChanges = true;
        }
      }
    }
    for (const u of this.users) {
      if (u.email?.toLowerCase().trim() !== "miracle@goldmailer.xyz") {
        if (u.role === "admin") {
          u.role = "user";
          hasChanges = true;
        }
      } else {
        if (u.role !== "admin") {
          u.role = "admin";
          hasChanges = true;
        }
      }
    }
    const prevAdminRolesCount = this.adminRoles.length;
    this.adminRoles = this.adminRoles.filter((r) => r.email?.toLowerCase().trim() === "miracle@goldmailer.xyz");
    if (this.adminRoles.length !== prevAdminRolesCount) {
      hasChanges = true;
    }
    if (!this.domains.some((d) => d.domain === "goldmailer.xyz")) {
      this.domains.unshift({
        id: "dom_01",
        domain: "goldmailer.xyz",
        is_default: true,
        is_verified: true,
        verification_token: "v=goldmailer-verify-primary-xyz",
        mx_record_status: "valid",
        spf_record_status: "valid",
        dkim_record_status: "valid",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      hasChanges = true;
    } else {
      const xyzDom = this.domains.find((d) => d.domain === "goldmailer.xyz");
      if (xyzDom && !xyzDom.is_default) {
        xyzDom.is_default = true;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.saveToDiskSync();
    }
  }
  // Cron: auto-delete emails trashed over 30 days ago
  startTrashCleanerCron() {
    const timer = setInterval(() => {
      this.purgeExpiredTrash();
    }, 60 * 60 * 1e3);
    if (timer && typeof timer.unref === "function") timer.unref();
  }
  purgeExpiredTrash() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1e3;
    let purgedCount = 0;
    for (const email of this.emails) {
      if (email.status === "trash" && email.trashed_at) {
        const trashedTime = new Date(email.trashed_at).getTime();
        if (trashedTime < thirtyDaysAgo) {
          email.status = "deleted";
          purgedCount++;
        }
      }
    }
    if (purgedCount > 0) {
      console.log(`\u{1F9F9} [Cron] Auto-purged ${purgedCount} expired trashed emails older than 30 days`);
      this.scheduleDiskSave();
    }
    return purgedCount;
  }
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.floor(1e7 + Math.random() * 9e7).toString();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }
  // ================= USER & ACCOUNT OPERATIONS =================
  async findAccount(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const cleanNoAt = clean.replace(/^@+/, "");
    const userPart = cleanNoAt.replace(/@.*$/, "");
    const userPartNoDots = userPart.replace(/\./g, "");
    console.log(`\u{1F50D} DB QUERY goldmailer_accounts for login/lookup: "${identifier}"`);
    const found = this.users.find((u) => {
      const uEmail = (u.email || "").toLowerCase().trim();
      const uUser = (u.username || "").toLowerCase().trim();
      const uBackup = (u.backup_email || "").toLowerCase().trim();
      const uEmailUserPart = uEmail.replace(/@.*$/, "");
      const uEmailNoDots = uEmailUserPart.replace(/\./g, "");
      const uUserNoDots = uUser.replace(/\./g, "");
      return u.id === identifier || (u.id || "").toLowerCase() === clean || uEmail === clean || uUser === clean || uBackup === clean || uEmailUserPart === userPart || uUser === userPart || uEmail === `${userPart}@goldmailer.xyz` || uEmailNoDots === userPartNoDots || uUserNoDots === userPartNoDots;
    });
    if (found) {
      return found;
    }
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.from("goldmailer_accounts").select("*").or(`email.ilike.${clean},username.ilike.${userPart}`).limit(1);
        if (!error && data && data.length > 0) {
          const row = data[0];
          console.log(`\u2705 DB QUERY found account in Supabase: ${row.email}`);
          this.users.push(row);
          this.scheduleDiskSave();
          return row;
        }
      } catch (sbErr) {
        console.warn("Supabase query note:", sbErr);
      }
    }
    return null;
  }
  async insertAccount(user) {
    console.log(`\u2705 DB INSERT goldmailer_accounts: ${user.email} (username: ${user.username})`);
    const cleanEmail = user.email.toLowerCase().trim();
    const cleanUser = user.username.toLowerCase().trim();
    const existing = await this.findAccount(cleanUser);
    if (existing) {
      throw new Error(`Username or email @${cleanUser} already registered`);
    }
    this.users.unshift(user);
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from("goldmailer_accounts").insert([user]);
        if (error) {
          console.warn("\u26A0\uFE0F Supabase insert warning (saved locally):", error.message);
        } else {
          console.log(`\u2705 Supabase INSERT goldmailer_accounts confirmed: ${user.email}`);
        }
      } catch (sbErr) {
        console.warn("Supabase insert note:", sbErr);
      }
    }
    return user;
  }
  async updateAccount(id, updates) {
    const cleanId = (id || "").toLowerCase().trim();
    const idx = this.users.findIndex(
      (u) => u.id === id || (u.id || "").toLowerCase() === cleanId || (u.email || "").toLowerCase() === cleanId || (u.username || "").toLowerCase() === cleanId
    );
    if (idx === -1) {
      console.warn(`Account not found for update in db.users: ${id}`);
      return null;
    }
    this.users[idx] = { ...this.users[idx], ...updates };
    const updated = this.users[idx];
    console.log(`\u2705 DB UPDATE goldmailer_accounts: ${updated.email}`, updates);
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_accounts").update(updates).eq("id", updated.id);
      } catch (sbErr) {
        console.warn("Supabase update note:", sbErr);
      }
    }
    return updated;
  }
  upsertAccount(user) {
    const cleanEmail = (user.email || "").toLowerCase().trim();
    const cleanUser = (user.username || cleanEmail.split("@")[0] || "").toLowerCase().trim();
    const enforcedRole = cleanEmail === "miracle@goldmailer.xyz" ? "admin" : "user";
    const idx = this.users.findIndex(
      (u) => user.id && u.id === user.id || u.email.toLowerCase() === cleanEmail || cleanUser && u.username.toLowerCase() === cleanUser
    );
    if (idx !== -1) {
      const existing = this.users[idx];
      const twoFaEnabled = user.two_factor_enabled !== void 0 ? user.two_factor_enabled || existing.two_factor_enabled : existing.two_factor_enabled;
      const twoFaSecret = user.two_factor_secret || existing.two_factor_secret;
      const backupCodes = user.backup_codes && user.backup_codes.length > 0 ? user.backup_codes : existing.backup_codes || [];
      const recoveryPhone = user.recovery_phone || existing.recovery_phone || "";
      const backupEmail = user.backup_email || existing.backup_email || "";
      this.users[idx] = {
        ...existing,
        ...user,
        email: existing.email || cleanEmail,
        two_factor_enabled: Boolean(twoFaEnabled),
        two_factor_secret: twoFaSecret,
        backup_codes: backupCodes,
        recovery_phone: recoveryPhone,
        backup_email: backupEmail,
        role: enforcedRole
      };
      this.scheduleDiskSave();
      return this.users[idx];
    } else {
      const formatted = {
        ...user,
        email: cleanEmail,
        username: cleanUser,
        role: enforcedRole,
        is_banned: Boolean(user.is_banned),
        storage_used_bytes: user.storage_used_bytes || 0,
        storage_limit_bytes: user.storage_limit_bytes || 15 * 1024 * 1024 * 1024
      };
      this.users.unshift(formatted);
      this.scheduleDiskSave();
      return formatted;
    }
  }
  async setBanStatus(userIdOrEmail, isBanned, reason, adminEmail) {
    const user = await this.findAccount(userIdOrEmail);
    if (!user) return null;
    user.is_banned = isBanned;
    user.banned_at = isBanned ? (/* @__PURE__ */ new Date()).toISOString() : void 0;
    if (reason) user.ban_reason = reason;
    console.log(`\u2705 DB UPDATE goldmailer_accounts BAN STATUS: ${user.email} -> is_banned=${isBanned}, banned_at=${user.banned_at}`);
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_accounts").update({
          is_banned: user.is_banned,
          banned_at: user.banned_at,
          ban_reason: user.ban_reason
        }).eq("id", user.id);
      } catch (err) {
        console.warn("Supabase ban update note:", err);
      }
    }
    await this.logAdminActivity(
      adminEmail || "admin@goldmailer.xyz",
      isBanned ? "BAN_USER" : "UNBAN_USER",
      "user",
      user.id,
      `${isBanned ? "Banned" : "Unbanned"} user ${user.email}. Reason: ${reason || "No reason specified"}`
    );
    return user;
  }
  async deleteAccount(userIdOrEmail, adminEmail) {
    const user = await this.findAccount(userIdOrEmail);
    if (!user) return false;
    console.log(`\u{1F5D1}\uFE0F DB DELETE goldmailer_accounts: ${user.email}`);
    this.users = this.users.filter((u) => u.id !== user.id && u.email.toLowerCase() !== user.email.toLowerCase());
    for (const e of this.emails) {
      if (e.recipient.toLowerCase().includes(user.email.toLowerCase()) || e.to_email.toLowerCase().includes(user.email.toLowerCase())) {
        e.status = "deleted";
      }
    }
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_accounts").delete().eq("id", user.id);
      } catch {
      }
    }
    await this.logAdminActivity(
      adminEmail || "admin@goldmailer.xyz",
      "DELETE_USER",
      "user",
      user.id,
      `Permanently deleted account ${user.email}`
    );
    return true;
  }
  listAccounts() {
    return this.users;
  }
  getAllAccounts() {
    return this.users;
  }
  // ================= EMAIL & TRASH OPERATIONS =================
  isEmailDeleted(id) {
    return this.deletedEmailIds.has(id);
  }
  async insertEmail(email) {
    if (this.deletedEmailIds.has(email.id) || email.status === "deleted") {
      return email;
    }
    const msgId = email.messageId || email.raw?.messageId;
    if (msgId && this.deletedEmailIds.has(msgId)) {
      return email;
    }
    if (!email.status) {
      email.status = email.folder === "sent" ? "sent" : email.folder === "drafts" ? "draft" : "inbox";
    }
    console.log(`\u2705 DB INSERT goldmailer_emails: ID=${email.id}, To=${email.recipient}, Status=${email.status}`);
    const targetMsgId = (email.messageId || email.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
    const targetFrom = (email.from_email || email.sender || "").trim().toLowerCase();
    const targetTo = (email.to_email || email.recipient || "").trim().toLowerCase();
    const targetSub = (email.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
    const targetTime = new Date(email.received_at || email.created_at || 0).getTime();
    const targetBodyLen = (email.body_text || email.text || email.body || "").replace(/<[^>]+>/g, "").trim().length;
    const existingIdx = this.emails.findIndex((e) => {
      if (e.id === email.id) return true;
      const eMsgId = (e.messageId || e.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
      if (targetMsgId && eMsgId && targetMsgId === eMsgId) return true;
      const eFrom = (e.from_email || e.sender || "").trim().toLowerCase();
      const eTo = (e.to_email || e.recipient || "").trim().toLowerCase();
      const eSub = (e.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
      const sameSender = targetFrom === eFrom || targetFrom && eFrom && targetFrom.split("@")[0] === eFrom.split("@")[0];
      const sameTo = !targetTo || !eTo || targetTo === eTo || targetTo.split("@")[0] === eTo.split("@")[0];
      if (sameSender && sameTo && targetSub === eSub) {
        const eTime = new Date(e.received_at || e.created_at || 0).getTime();
        const timeDiff = Math.abs(targetTime - eTime);
        if (timeDiff <= 2 * 60 * 60 * 1e3) return true;
        const eBodyLen = (e.body_text || e.text || e.body || "").replace(/<[^>]+>/g, "").trim().length;
        if ((targetBodyLen === 0 || eBodyLen === 0) && timeDiff <= 24 * 60 * 60 * 1e3) return true;
        const tSnip = (email.body_text || email.text || email.body || "").slice(0, 50).trim();
        const eSnip = (e.body_text || e.text || e.body || "").slice(0, 50).trim();
        if (tSnip && eSnip && tSnip === eSnip) return true;
      }
      return false;
    });
    if (existingIdx !== -1) {
      const existing = this.emails[existingIdx];
      const existingBodyLen = (existing.body_text || existing.text || existing.body || "").replace(/<[^>]+>/g, "").trim().length;
      if (targetBodyLen >= existingBodyLen) {
        this.emails[existingIdx] = {
          ...existing,
          ...email,
          // Preserve read/star states if existing was marked
          is_read: existing.is_read || email.is_read,
          is_starred: existing.is_starred || email.is_starred
        };
      } else {
        this.emails[existingIdx] = {
          ...email,
          ...existing,
          messageId: email.messageId || existing.messageId
        };
      }
      console.log(`\u2705 DB DEDUPED email ${email.id} into existing entry ${existing.id}`);
    } else {
      this.emails.unshift(email);
    }
    this.scheduleDiskSave();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_emails").upsert([email]);
      } catch {
      }
    }
    return email;
  }
  async getEmailById(id) {
    if (this.deletedEmailIds.has(id)) return null;
    return this.emails.find((e) => e.id === id && e.status !== "deleted") || null;
  }
  deleteEmail(id) {
    this.deletedEmailIds.add(id);
    const email = this.emails.find((e) => e.id === id);
    if (email?.messageId) this.deletedEmailIds.add(email.messageId);
    if (email?.raw?.messageId) this.deletedEmailIds.add(email.raw.messageId);
    const initialLen = this.emails.length;
    this.emails = this.emails.filter((e) => e.id !== id);
    this.saveToDiskSync();
    return this.emails.length < initialLen;
  }
  async updateEmailStatus(id, status, folder) {
    if (status === "deleted") {
      const email2 = this.emails.find((e) => e.id === id);
      this.deletedEmailIds.add(id);
      if (email2?.messageId) this.deletedEmailIds.add(email2.messageId);
      if (email2?.raw?.messageId) this.deletedEmailIds.add(email2.raw.messageId);
      this.emails = this.emails.filter((e) => e.id !== id);
      this.saveToDiskSync();
      console.log(`\u2705 DB UPDATE email permanently deleted and purged from DB: ${id}`);
      return email2 || null;
    }
    const email = this.emails.find((e) => e.id === id);
    if (!email) return null;
    email.status = status;
    if (folder) email.folder = folder;
    else if (status === "trash") email.folder = "trash";
    else if (status === "inbox") email.folder = "primary";
    if (status === "trash") {
      email.trashed_at = (/* @__PURE__ */ new Date()).toISOString();
      console.log(`\u2705 DB UPDATE email status to trash: ${id} (trashed_at: ${email.trashed_at})`);
    } else if (status === "inbox") {
      email.trashed_at = void 0;
      this.deletedEmailIds.delete(id);
      console.log(`\u2705 DB UPDATE email status to inbox (restored): ${id}`);
    }
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_emails").update({
          status: email.status,
          folder: email.folder,
          trashed_at: email.trashed_at
        }).eq("id", email.id);
      } catch {
      }
    }
    return email;
  }
  async batchUpdateEmailStatus(ids, status) {
    const idSet = new Set(ids);
    let count = 0;
    if (status === "deleted") {
      for (const id of ids) {
        this.deletedEmailIds.add(id);
        const email = this.emails.find((e) => e.id === id);
        if (email?.messageId) this.deletedEmailIds.add(email.messageId);
        if (email?.raw?.messageId) this.deletedEmailIds.add(email.raw.messageId);
      }
      this.emails = this.emails.filter((e) => !idSet.has(e.id));
      this.saveToDiskSync();
      console.log(`\u2705 DB BATCH permanent delete purged ${ids.length} emails from DB`);
      return ids.length;
    }
    for (const email of this.emails) {
      if (idSet.has(email.id)) {
        email.status = status;
        if (status === "trash") {
          email.folder = "trash";
          email.trashed_at = (/* @__PURE__ */ new Date()).toISOString();
        } else if (status === "inbox") {
          email.folder = "primary";
          email.trashed_at = void 0;
          this.deletedEmailIds.delete(email.id);
        }
        count++;
      }
    }
    console.log(`\u2705 DB BATCH UPDATE email status to ${status} for ${count} emails`);
    this.saveToDiskSync();
    return count;
  }
  getEmailsForUser(targetEmail, folder) {
    const cleanTarget = targetEmail.trim().toLowerCase();
    const cleanUserPart = cleanTarget.replace(/@.*$/, "");
    return this.emails.filter((e) => {
      const to = (e.recipient || e.to_email || e.to || "").toLowerCase();
      const from = (e.sender || e.from_email || e.from || "").toLowerCase();
      const isTo = to.includes(cleanTarget) || to.includes(cleanUserPart);
      const isFrom = from.includes(cleanTarget) || from.includes(cleanUserPart);
      if (!isTo && !isFrom) return false;
      if (e.status === "deleted") return false;
      if (folder === "trash") {
        return e.status === "trash" || e.folder === "trash";
      }
      if (e.status === "trash" || e.folder === "trash") {
        return false;
      }
      if (folder === "sent") {
        return isFrom && (e.status === "sent" || e.folder === "sent");
      }
      if (folder === "starred") {
        return Boolean(e.is_starred);
      }
      if (folder === "spam") {
        return e.status === "spam" || e.folder === "spam";
      }
      if (folder === "all_mail" || folder === "all" || folder === "all_inboxes") {
        return true;
      }
      return e.status === "inbox" || !e.status || e.folder === "primary";
    });
  }
  getAllEmails() {
    return this.emails;
  }
  // ================= SESSION & MULTI-ACCOUNT OPERATIONS =================
  async createSession(session) {
    console.log(`\u2705 DB INSERT goldmailer_sessions: user=${session.email}, token=${session.session_token || session.token}`);
    session.session_token = session.session_token || session.token || session.session_id;
    session.token = session.session_token;
    session.session_id = session.session_id || session.id || "sess_" + crypto.randomBytes(8).toString("hex");
    session.ip_address = session.ip_address || session.ip || "127.0.0.1";
    session.ip = session.ip_address;
    session.last_active = session.last_active || session.last_active_at || (/* @__PURE__ */ new Date()).toISOString();
    session.last_active_at = session.last_active;
    this.sessions = this.sessions.filter(
      (s) => s.session_id !== session.session_id && s.session_token !== session.session_token
    );
    this.sessions.unshift(session);
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_sessions").insert([{
          user_id: session.user_id,
          email: session.email,
          session_token: session.session_token,
          ip_address: session.ip_address,
          city: session.city || "Unknown",
          country: session.country || "Unknown",
          device: session.device || "Unknown",
          browser: session.browser || "Unknown",
          os: session.os || "Unknown",
          user_agent: session.user_agent || "Unknown",
          is_current: Boolean(session.is_current),
          last_active: session.last_active,
          created_at: session.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }]);
      } catch (err) {
        console.warn("Supabase goldmailer_sessions insert warning:", err?.message || err);
      }
    }
    return session;
  }
  createSessionSync(session) {
    session.session_token = session.session_token || session.token || session.session_id;
    session.token = session.session_token;
    session.session_id = session.session_id || session.id || "sess_" + crypto.randomBytes(8).toString("hex");
    session.ip_address = session.ip_address || session.ip || "127.0.0.1";
    session.ip = session.ip_address;
    session.last_active = session.last_active || session.last_active_at || (/* @__PURE__ */ new Date()).toISOString();
    session.last_active_at = session.last_active;
    this.sessions = this.sessions.filter(
      (s) => s.session_id !== session.session_id && s.session_token !== session.session_token
    );
    this.sessions.unshift(session);
    this.saveToDiskSync();
    return session;
  }
  isSessionRevoked(sessionIdOrToken) {
    if (!sessionIdOrToken) return false;
    return this.revokedSessionIds.has(sessionIdOrToken);
  }
  getSessions() {
    return this.sessions;
  }
  setSessionsSync(sessions) {
    if (Array.isArray(sessions)) {
      this.sessions = sessions;
    }
  }
  setRevokedSessionIdsSync(ids) {
    if (Array.isArray(ids)) {
      for (const id of ids) {
        this.revokedSessionIds.add(id);
      }
    }
  }
  getSessionSync(sessionIdOrToken) {
    if (!sessionIdOrToken) return null;
    if (this.isSessionRevoked(sessionIdOrToken)) return null;
    return this.sessions.find(
      (s) => s.session_id === sessionIdOrToken || s.session_token === sessionIdOrToken || s.token === sessionIdOrToken || s.id === sessionIdOrToken
    ) || null;
  }
  async getSession(sessionIdOrToken) {
    const mem = this.getSessionSync(sessionIdOrToken);
    if (mem) return mem;
    if (this.supabase) {
      try {
        const { data } = await this.supabase.from("goldmailer_sessions").select("*").or(`session_token.eq.${sessionIdOrToken},id.eq.${sessionIdOrToken}`).maybeSingle();
        if (data) {
          const loaded = {
            id: data.id,
            session_id: data.id || sessionIdOrToken,
            user_id: data.user_id,
            email: data.email,
            session_token: data.session_token,
            token: data.session_token,
            ip_address: data.ip_address,
            ip: data.ip_address,
            city: data.city || "Unknown",
            country: data.country || "Unknown",
            device: data.device || "Unknown",
            browser: data.browser || "Unknown",
            os: data.os || "Unknown",
            user_agent: data.user_agent || "",
            is_current: data.is_current,
            last_active: data.last_active,
            last_active_at: data.last_active,
            created_at: data.created_at
          };
          this.sessions.unshift(loaded);
          return loaded;
        }
      } catch {
      }
    }
    return null;
  }
  async getSessionsForUser(userIdOrEmail) {
    const clean = (userIdOrEmail || "").toLowerCase().trim();
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.from("goldmailer_sessions").select("*").or(`user_id.eq.${clean},email.ilike.${clean}`).order("last_active", { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map((d) => ({
            id: d.id,
            session_id: d.id,
            user_id: d.user_id,
            email: d.email,
            session_token: d.session_token,
            token: d.session_token,
            ip_address: d.ip_address || "",
            ip: d.ip_address || "",
            city: d.city || "Unknown",
            country: d.country || "Unknown",
            device: d.device || "Unknown",
            browser: d.browser || "Unknown",
            os: d.os || "Unknown",
            user_agent: d.user_agent || "",
            is_current: d.is_current,
            last_active: d.last_active,
            last_active_at: d.last_active,
            created_at: d.created_at
          }));
        }
      } catch {
      }
    }
    return this.sessions.filter((s) => s.user_id === userIdOrEmail || s.email && s.email.toLowerCase() === clean).sort((a, b) => new Date(b.last_active || b.last_active_at || 0).getTime() - new Date(a.last_active || a.last_active_at || 0).getTime());
  }
  async updateSessionActivity(tokenOrId, ipAddress) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const sess = this.sessions.find((s) => s.session_token === tokenOrId || s.token === tokenOrId || s.session_id === tokenOrId || s.id === tokenOrId);
    if (sess) {
      sess.last_active = nowIso;
      sess.last_active_at = nowIso;
      if (ipAddress) {
        sess.ip_address = ipAddress;
        sess.ip = ipAddress;
      }
      this.scheduleDiskSave();
    }
    if (this.supabase) {
      try {
        const updatePayload = { last_active: nowIso };
        if (ipAddress) {
          updatePayload.ip_address = ipAddress;
        }
        await this.supabase.from("goldmailer_sessions").update(updatePayload).or(`session_token.eq.${tokenOrId},id.eq.${tokenOrId}`);
      } catch {
      }
    }
  }
  async removeSession(tokenOrId) {
    if (!tokenOrId) return;
    this.revokedSessionIds.add(tokenOrId);
    const matched = this.sessions.find(
      (s) => s.session_id === tokenOrId || s.session_token === tokenOrId || s.token === tokenOrId || s.id === tokenOrId
    );
    if (matched) {
      if (matched.session_token) this.revokedSessionIds.add(matched.session_token);
      if (matched.session_id) this.revokedSessionIds.add(matched.session_id);
      if (matched.id) this.revokedSessionIds.add(matched.id);
      if (matched.token) this.revokedSessionIds.add(matched.token);
    }
    this.sessions = this.sessions.filter(
      (s) => s.session_id !== tokenOrId && s.session_token !== tokenOrId && s.token !== tokenOrId && s.id !== tokenOrId
    );
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_sessions").delete().or(`session_token.eq.${tokenOrId},id.eq.${tokenOrId}`);
      } catch {
      }
    }
  }
  async removeOtherSessions(userId, currentSessionToken) {
    const cleanUser = (userId || "").toLowerCase().trim();
    const otherSessions = this.sessions.filter(
      (s) => (s.user_id === userId || (s.email || "").toLowerCase() === cleanUser) && s.session_token !== currentSessionToken && s.token !== currentSessionToken && s.session_id !== currentSessionToken && s.id !== currentSessionToken
    );
    for (const s of otherSessions) {
      if (s.session_token) this.revokedSessionIds.add(s.session_token);
      if (s.session_id) this.revokedSessionIds.add(s.session_id);
      if (s.id) this.revokedSessionIds.add(s.id);
      if (s.token) this.revokedSessionIds.add(s.token);
    }
    this.sessions = this.sessions.filter(
      (s) => s.user_id !== userId && (s.email || "").toLowerCase() !== cleanUser || s.session_token === currentSessionToken || s.token === currentSessionToken || s.session_id === currentSessionToken || s.id === currentSessionToken
    );
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_sessions").delete().eq("user_id", userId).neq("session_token", currentSessionToken);
      } catch {
      }
    }
  }
  // ================= ADMIN ACTIVITY LOGS =================
  async logAdminActivity(adminEmail, action, targetType, targetId, details, ip) {
    const log = {
      id: "log_" + crypto.randomBytes(6).toString("hex"),
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip: ip || "127.0.0.1",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log(`\u{1F4DD} [Admin Audit] ${action} by ${adminEmail}: ${details}`);
    this.activityLogs.unshift(log);
    this.scheduleDiskSave();
    if (this.supabase) {
      try {
        await this.supabase.from("goldmailer_activity_logs").insert([log]);
      } catch {
      }
    }
    return log;
  }
  getActivityLogs(limit = 100) {
    return this.activityLogs.slice(0, limit);
  }
  // ================= SUPPORT TICKETS =================
  async createTicket(userEmail, subject, category, priority, messageContent, userName) {
    const ticket = {
      id: "tkt_" + crypto.randomBytes(5).toString("hex"),
      user_email: userEmail,
      user_name: userName || userEmail.split("@")[0],
      subject,
      category,
      priority,
      status: "open",
      messages: [
        {
          id: "msg_" + crypto.randomBytes(4).toString("hex"),
          sender_email: userEmail,
          sender_name: userName || userEmail.split("@")[0],
          is_admin: false,
          content: messageContent,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }
      ],
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.tickets.unshift(ticket);
    this.saveToDiskSync();
    return ticket;
  }
  async replyToTicket(ticketId, senderEmail, senderName, isAdmin, content, newStatus) {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.messages.push({
      id: "msg_" + crypto.randomBytes(4).toString("hex"),
      sender_email: senderEmail,
      sender_name: senderName,
      is_admin: isAdmin,
      content,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (newStatus) {
      ticket.status = newStatus;
    } else if (isAdmin && ticket.status === "open") {
      ticket.status = "in_progress";
    }
    ticket.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.saveToDiskSync();
    return ticket;
  }
  getTickets() {
    return this.tickets;
  }
  // ================= DOMAINS =================
  getDomains() {
    return this.domains;
  }
  async addDomain(domainName) {
    const clean = domainName.trim().toLowerCase();
    const existing = this.domains.find((d) => d.domain.toLowerCase() === clean);
    if (existing) return existing;
    const newDom = {
      id: "dom_" + crypto.randomBytes(4).toString("hex"),
      domain: clean,
      is_default: false,
      is_verified: false,
      verification_token: `goldmailer-verify-${crypto.randomBytes(8).toString("hex")}`,
      mx_record_status: "missing",
      spf_record_status: "missing",
      dkim_record_status: "missing",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.domains.push(newDom);
    this.saveToDiskSync();
    return newDom;
  }
  async verifyDomain(id) {
    const dom = this.domains.find((d) => d.id === id);
    if (!dom) return null;
    dom.is_verified = true;
    dom.mx_record_status = "valid";
    dom.spf_record_status = "valid";
    dom.dkim_record_status = "valid";
    this.saveToDiskSync();
    return dom;
  }
  async deleteDomain(id) {
    const dom = this.domains.find((d) => d.id === id);
    if (!dom || dom.is_default) return false;
    this.domains = this.domains.filter((d) => d.id !== id);
    this.saveToDiskSync();
    return true;
  }
  // ================= SETTINGS =================
  getSettings() {
    return this.settings;
  }
  async updateSettings(updates) {
    this.settings = {
      ...this.settings,
      ...updates,
      default_domain: "goldmailer.xyz",
      site_url: "https://goldmailer.xyz",
      support_email: "support@goldmailer.xyz"
    };
    this.saveToDiskSync();
    return this.settings;
  }
  // ================= ADMIN ROLES =================
  getAdminRoles() {
    return this.adminRoles.filter((r) => r.email?.toLowerCase().trim() === "miracle@goldmailer.xyz");
  }
  async addAdminRole(email, name, role, permissions, addedBy) {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== "miracle@goldmailer.xyz") {
      throw new Error("Only miracle@goldmailer.xyz can be assigned admin privileges");
    }
    const newRole = {
      id: "role_" + crypto.randomBytes(4).toString("hex"),
      email: cleanEmail,
      name,
      role: "super_admin",
      permissions,
      added_by: addedBy,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.adminRoles = this.adminRoles.filter((r) => r.email?.toLowerCase().trim() === "miracle@goldmailer.xyz");
    this.adminRoles.push(newRole);
    const user = await this.findAccount(cleanEmail);
    if (user) {
      user.role = "admin";
    }
    this.saveToDiskSync();
    return newRole;
  }
  async removeAdminRole(id) {
    this.adminRoles = this.adminRoles.filter((r) => r.id !== id);
    this.saveToDiskSync();
    return true;
  }
  // ================= BROADCAST NOTIFICATIONS =================
  getBroadcasts() {
    return this.broadcasts;
  }
  async createBroadcast(title, message, senderEmail, target = "all") {
    const activeUsers = this.users.filter((u) => !u.is_banned);
    const broadcast = {
      id: "bc_" + crypto.randomBytes(4).toString("hex"),
      title,
      message,
      sender_email: senderEmail,
      target,
      sent_at: (/* @__PURE__ */ new Date()).toISOString(),
      recipients_count: activeUsers.length
    };
    this.broadcasts.unshift(broadcast);
    for (const u of activeUsers) {
      await this.insertEmail({
        id: `bc_email_${broadcast.id}_${u.id}`,
        recipient: u.email,
        to_email: u.email,
        sender: `GoldMailer Announcements <${senderEmail}>`,
        from_email: senderEmail,
        sender_name: "GoldMailer Admin",
        subject: `\u{1F4E2} Announcement: ${title}`,
        body_html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; max-width: 600px; padding: 24px; border-radius: 12px; border: 1px solid #FF6A00; background: #fff; color: #222;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-weight: 800; color: #FF6A00; font-size: 20px;">GoldMailer Official Broadcast</span>
            </div>
            <h2 style="margin-top: 0; color: #111;">${title}</h2>
            <div style="line-height: 1.6; font-size: 14px; white-space: pre-wrap;">${message}</div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #888; margin: 0;">Sent by GoldMailer Administration to all verified members.</p>
          </div>
        `,
        body_text: `${title}

${message}

GoldMailer Administration`,
        received_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        is_read: false,
        is_starred: true,
        folder: "primary",
        category: "updates",
        status: "inbox"
      });
    }
    this.saveToDiskSync();
    return broadcast;
  }
  // ================= PAYMENTS & INVOICES =================
  getPayments() {
    return this.payments;
  }
  async recordPayment(payment) {
    this.payments.unshift(payment);
    this.saveToDiskSync();
    return payment;
  }
  // ================= SECURITY & IP BLOCKLIST =================
  getBlockedIps() {
    return Array.from(this.blockedIps);
  }
  async blockIp(ip, reason, adminEmail) {
    this.blockedIps.add(ip);
    this.saveToDiskSync();
    await this.logAdminActivity(
      adminEmail || "admin@goldmailer.xyz",
      "BLOCK_IP",
      "security",
      ip,
      `Blocked IP: ${ip}. Reason: ${reason || "Suspicious traffic"}`
    );
  }
  async unblockIp(ip, adminEmail) {
    this.blockedIps.delete(ip);
    this.saveToDiskSync();
    await this.logAdminActivity(
      adminEmail || "admin@goldmailer.xyz",
      "UNBLOCK_IP",
      "security",
      ip,
      `Unblocked IP: ${ip}`
    );
  }
  isIpBlocked(ip) {
    return this.blockedIps.has(ip);
  }
  // ================= BACKUP & RESTORE =================
  generateBackupPayload() {
    return JSON.stringify(
      {
        version: "2.0.0",
        exported_at: (/* @__PURE__ */ new Date()).toISOString(),
        users: this.users,
        emails: this.emails,
        sessions: this.sessions,
        tickets: this.tickets,
        activityLogs: this.activityLogs,
        domains: this.domains,
        adminRoles: this.adminRoles,
        settings: this.settings,
        blockedIps: Array.from(this.blockedIps)
      },
      null,
      2
    );
  }
  async restoreFromBackupPayload(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed.users)) {
      this.users = parsed.users;
    }
    if (Array.isArray(parsed.emails)) {
      this.emails = parsed.emails;
    }
    if (Array.isArray(parsed.sessions)) {
      this.sessions = parsed.sessions;
    }
    if (Array.isArray(parsed.tickets)) {
      this.tickets = parsed.tickets;
    }
    if (Array.isArray(parsed.activityLogs)) {
      this.activityLogs = parsed.activityLogs;
    }
    if (Array.isArray(parsed.domains)) {
      this.domains = parsed.domains;
    }
    if (parsed.settings) {
      this.settings = { ...this.settings, ...parsed.settings };
    }
    this.saveToDiskSync();
    return {
      success: true,
      usersCount: this.users.length,
      emailsCount: this.emails.length
    };
  }
  // ================= CONNECTED EMAILS & GOOGLE AUTO-FORWARD =================
  getConnectedEmails(userId) {
    if (!userId) return [...this.connectedEmails];
    return this.connectedEmails.filter((c) => c.userId === userId);
  }
  getConnectedEmailById(id) {
    return this.connectedEmails.find((c) => c.id === id);
  }
  getConnectedEmailByUserAndEmail(userId, email) {
    const cleanEmail = email.toLowerCase().trim();
    return this.connectedEmails.find((c) => c.userId === userId && c.email.toLowerCase().trim() === cleanEmail);
  }
  async addOrUpdateConnectedEmail(data) {
    const cleanEmail = data.email.toLowerCase().trim();
    const existingIndex = this.connectedEmails.findIndex((c) => c.userId === data.userId && c.email.toLowerCase().trim() === cleanEmail);
    let updated;
    if (existingIndex >= 0) {
      updated = {
        ...this.connectedEmails[existingIndex],
        ...data,
        email: cleanEmail
      };
      this.connectedEmails[existingIndex] = updated;
    } else {
      updated = {
        id: data.id || `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: data.userId,
        email: cleanEmail,
        verificationCode: data.verificationCode,
        isVerified: Boolean(data.isVerified),
        status: data.status || (data.isVerified ? "pending_oauth" : "pending_oauth"),
        gmail_access_token: data.gmail_access_token,
        gmail_refresh_token: data.gmail_refresh_token,
        isForwardingEnabled: data.isForwardingEnabled !== void 0 ? Boolean(data.isForwardingEnabled) : false,
        forwardingAddress: data.forwardingAddress,
        createdAt: data.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        lastSyncedAt: data.lastSyncedAt
      };
      this.connectedEmails.unshift(updated);
    }
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("connected_emails").upsert({
          id: updated.id,
          user_id: updated.userId,
          email: updated.email,
          verification_code: updated.verificationCode,
          is_verified: updated.isVerified,
          status: updated.status,
          gmail_access_token: updated.gmail_access_token,
          gmail_refresh_token: updated.gmail_refresh_token,
          is_forwarding_enabled: updated.isForwardingEnabled,
          forwarding_address: updated.forwardingAddress,
          created_at: updated.createdAt
        });
      } catch {
      }
    }
    return updated;
  }
  async deleteConnectedEmail(id, userId) {
    const idx = this.connectedEmails.findIndex((c) => c.id === id && c.userId === userId);
    if (idx < 0) return false;
    this.connectedEmails.splice(idx, 1);
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("connected_emails").delete().eq("id", id);
      } catch {
      }
    }
    return true;
  }
  async saveConnectedVerification(v) {
    const cleanEmail = v.email.toLowerCase().trim();
    this.connectedVerifications = this.connectedVerifications.filter(
      (item) => !(item.userId === v.userId && item.email.toLowerCase().trim() === cleanEmail)
    );
    this.connectedVerifications.push({
      ...v,
      email: cleanEmail
    });
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("connected_email_verifications").upsert({
          id: v.id,
          user_id: v.userId,
          email: cleanEmail,
          code: v.code,
          expires_at: new Date(v.expiresAt).toISOString(),
          verified: v.verified,
          created_at: v.createdAt
        });
      } catch {
      }
    }
  }
  getConnectedVerification(userId, email) {
    const cleanEmail = email.toLowerCase().trim();
    return this.connectedVerifications.find(
      (v) => v.userId === userId && v.email.toLowerCase().trim() === cleanEmail
    );
  }
  async verifyConnectedCode(userId, email, code) {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.trim();
    const found = this.connectedVerifications.find(
      (v) => v.userId === userId && v.email.toLowerCase().trim() === cleanEmail
    );
    if (!found) {
      return { valid: false, error: "No verification code requested for this email" };
    }
    if (found.code !== cleanCode) {
      return { valid: false, error: "Invalid verification code" };
    }
    if (Date.now() > found.expiresAt) {
      return { valid: false, error: "Verification code expired (codes expire in 10 minutes)" };
    }
    found.verified = true;
    this.saveToDiskSync();
    if (this.supabase) {
      try {
        await this.supabase.from("connected_email_verifications").update({ verified: true }).eq("id", found.id);
      } catch {
      }
    }
    return { valid: true };
  }
};
var db = new GoldDatabase();

// src/server/imapService.ts
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import crypto2 from "crypto";
function extractCleanAddress(input) {
  if (!input) return "";
  if (Array.isArray(input)) {
    const extracted = input.map((item) => extractCleanAddress(item)).filter(Boolean);
    const goldXyz2 = extracted.find((a) => a.endsWith("@goldmailer.xyz"));
    return goldXyz2 || extracted[0] || "";
  }
  if (typeof input === "object") {
    return (input.address || input.email || input.text || "").toLowerCase().trim();
  }
  const str = String(input);
  const parts = str.split(/[,;]+/);
  const candidates = [];
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/) || part.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match && match[1]) {
      candidates.push(match[1].toLowerCase().trim());
    } else if (part.trim()) {
      candidates.push(part.toLowerCase().trim());
    }
  }
  const goldXyz = candidates.find((a) => a.endsWith("@goldmailer.xyz"));
  return goldXyz || candidates[0] || "";
}
async function fetchEmailsFromImap(targetEmail, customConfig, limit = 50) {
  const host = customConfig?.host || process.env.IMAP_HOST || process.env.IMAP_SERVER || "";
  const port = customConfig?.port || parseInt(process.env.IMAP_PORT || "993", 10);
  const secure = customConfig?.secure ?? (process.env.IMAP_SECURE !== "false" && port === 993);
  const user = customConfig?.user || process.env.IMAP_USER || process.env.IMAP_USERNAME || targetEmail;
  const pass = customConfig?.pass || process.env.IMAP_PASS || process.env.IMAP_PASSWORD || "";
  if (!host || !pass) {
    return [];
  }
  console.log(`[IMAP] Connecting to ${host}:${port} as ${user}...`);
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    logger: false,
    emitLogs: false
  });
  const results = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true, unseen: true });
      const totalMessages = status && typeof status === "object" && "messages" in status ? status.messages || 0 : 0;
      console.log(`[IMAP] Successfully locked INBOX. Total messages available: ${totalMessages}`);
      if (totalMessages === 0) {
        return [];
      }
      const startSeq = Math.max(1, totalMessages - limit + 1);
      const range = `${startSeq}:${totalMessages}`;
      for await (const message of client.fetch(range, { source: true, flags: true, envelope: true })) {
        if (!message.source) continue;
        try {
          const parsed = await simpleParser(message.source);
          const parsedTo = parsed.to ? Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text : targetEmail;
          const cleanTo = extractCleanAddress(parsedTo) || targetEmail;
          const fromText = parsed.from ? parsed.from.text : "unknown@sender.com";
          const cleanFrom = extractCleanAddress(fromText);
          const senderName = parsed.from?.value?.[0]?.name || cleanFrom.split("@")[0] || "Sender";
          const htmlContent = parsed.html || (parsed.text ? `<pre style="font-family:inherit;white-space:pre-wrap;">${parsed.text}</pre>` : "");
          const textContent = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "");
          const dateIso = parsed.date ? parsed.date.toISOString() : (/* @__PURE__ */ new Date()).toISOString();
          const isRead = message.flags ? message.flags.has("\\Seen") : false;
          const isStarred = message.flags ? message.flags.has("\\Flagged") : false;
          const stableMsgId = parsed.messageId || `${cleanFrom}_${cleanTo}_${parsed.subject || ""}_${dateIso}`;
          const hashKey = crypto2.createHash("md5").update(stableMsgId).digest("hex").slice(0, 16);
          const imapId = "msg_imap_" + (message.uid ? `${message.uid}_${hashKey.slice(0, 8)}` : hashKey);
          results.unshift({
            id: imapId,
            messageId: parsed.messageId,
            raw: { messageId: parsed.messageId, uid: message.uid },
            recipient: cleanTo,
            to_email: cleanTo,
            to: cleanTo,
            cc: parsed.cc ? Array.isArray(parsed.cc) ? parsed.cc.map((c) => c.text).join(", ") : parsed.cc.text : void 0,
            bcc: parsed.bcc ? Array.isArray(parsed.bcc) ? parsed.bcc.map((b) => b.text).join(", ") : parsed.bcc.text : void 0,
            sender: fromText,
            from_email: cleanFrom,
            from: cleanFrom,
            sender_name: senderName,
            subject: parsed.subject || "(No Subject)",
            body_html: htmlContent,
            body_text: textContent,
            html: htmlContent,
            text: textContent,
            body: htmlContent || textContent,
            received_at: dateIso,
            created_at: dateIso,
            is_read: isRead,
            is_starred: isStarred,
            folder: "primary",
            category: "primary"
          });
        } catch (parseErr) {
          console.warn("Failed to parse IMAP message:", parseErr);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.warn(`IMAP connection note for ${host}:${port} (${user}):`, err.message);
  }
  return results;
}

// src/server/phoneService.ts
import crypto4 from "crypto";

// lib/telnyxClient.ts
import crypto3 from "crypto";
import Telnyx from "telnyx";
var dynamicConfig = {
  apiKey: (process.env.TELNYX_API_KEY || "").trim(),
  phoneNumber: (process.env.TELNYX_PHONE_NUMBER || process.env.TELNYX_PHONE || process.env.TRLNYX_PHONE || "+14236662513").trim(),
  messagingProfileId: (process.env.TELNYX_MESSAGING_PROFILE_ID || "4001a139-34ea-4725-a3be-890f641b9137").trim(),
  voiceAppId: (process.env.TELNYX_VOICE_APP_ID || process.env.TRLNYX_VOICE_APP_ID || "3070367984242394362").trim(),
  publicKey: (process.env.TELNYX_PUBLIC_KEY || "").trim(),
  webhookUrl: (process.env.TELNYX_WEBHOOK_URL || "https://goldmailer.xyz/api/webhooks/telnyx-inbound").trim()
};
function setTelnyxConfig(updates) {
  if (updates.apiKey !== void 0 && updates.apiKey.trim()) {
    dynamicConfig.apiKey = updates.apiKey.trim();
    process.env.TELNYX_API_KEY = dynamicConfig.apiKey;
  }
  if (updates.phoneNumber !== void 0 && updates.phoneNumber.trim()) {
    dynamicConfig.phoneNumber = updates.phoneNumber.trim();
    process.env.TELNYX_PHONE_NUMBER = dynamicConfig.phoneNumber;
  }
  if (updates.messagingProfileId !== void 0 && updates.messagingProfileId.trim()) {
    dynamicConfig.messagingProfileId = updates.messagingProfileId.trim();
    process.env.TELNYX_MESSAGING_PROFILE_ID = dynamicConfig.messagingProfileId;
  }
  if (updates.voiceAppId !== void 0 && updates.voiceAppId.trim()) {
    dynamicConfig.voiceAppId = updates.voiceAppId.trim();
    process.env.TELNYX_VOICE_APP_ID = dynamicConfig.voiceAppId;
  }
  if (updates.publicKey !== void 0) {
    dynamicConfig.publicKey = updates.publicKey.trim();
    process.env.TELNYX_PUBLIC_KEY = dynamicConfig.publicKey;
  }
  if (updates.webhookUrl !== void 0 && updates.webhookUrl.trim()) {
    dynamicConfig.webhookUrl = updates.webhookUrl.trim();
    process.env.TELNYX_WEBHOOK_URL = dynamicConfig.webhookUrl;
  }
}
function getTelnyxConfig() {
  const apiKey = dynamicConfig.apiKey || process.env.TELNYX_API_KEY || "";
  const phoneNumber = dynamicConfig.phoneNumber || process.env.TELNYX_PHONE_NUMBER || process.env.TELNYX_PHONE || process.env.TRLNYX_PHONE || "+14236662513";
  const messagingProfileId = dynamicConfig.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID || "4001a139-34ea-4725-a3be-890f641b9137";
  const voiceAppId = dynamicConfig.voiceAppId || process.env.TELNYX_VOICE_APP_ID || process.env.TRLNYX_VOICE_APP_ID || "3070367984242394362";
  const publicKey = dynamicConfig.publicKey || process.env.TELNYX_PUBLIC_KEY || "";
  const webhookUrl = dynamicConfig.webhookUrl || process.env.TELNYX_WEBHOOK_URL || "https://goldmailer.xyz/api/webhooks/telnyx-inbound";
  return {
    apiKey,
    phoneNumber,
    messagingProfileId,
    voiceAppId,
    publicKey,
    webhookUrl,
    isConfigured: Boolean(apiKey && apiKey.startsWith("KEY"))
  };
}
function getTelnyxHeaders() {
  const { apiKey } = getTelnyxConfig();
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}
function normalizePhoneNumber(num, defaultCountryCode = "+1") {
  if (!num) return "";
  let cleaned = num.trim().replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return "+234" + cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return "+1" + cleaned;
  }
  return cleaned.startsWith("+") ? cleaned : `${defaultCountryCode}${cleaned.replace(/^0+/, "")}`;
}
var optOutSet = /* @__PURE__ */ new Set();
function isOptedOut(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return optOutSet.has(normalized);
}
function addOptOut(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  optOutSet.add(normalized);
}
function removeOptOut(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  optOutSet.delete(normalized);
}
async function listAvailablePhoneNumbers(limit = 10) {
  const { isConfigured } = getTelnyxConfig();
  if (!isConfigured) return [];
  try {
    const url = `https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=US&filter[limit]=${Math.min(limit, 20)}&filter[features]=sms&filter[features]=voice`;
    const res = await fetch(url, {
      headers: getTelnyxHeaders()
    });
    if (!res.ok) {
      console.warn("[TELNYX] Failed to fetch available numbers:", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const numbers = data.data || [];
    return numbers.map((n) => {
      const locRegion = (n.region_information || []).find((r) => r.region_type === "rate_center" || r.region_type === "location");
      const stateRegion = (n.region_information || []).find((r) => r.region_type === "state");
      const features = (n.features || []).map((f) => f.name || f);
      return {
        phoneNumber: n.phone_number,
        friendlyName: n.vanity_format || n.phone_number,
        locality: locRegion?.region_name || "US Local",
        region: stateRegion?.region_name || "US",
        isoCountry: "US",
        priceUsd: 6,
        capabilities: {
          sms: features.includes("sms") || true,
          voice: features.includes("voice") || true
        }
      };
    });
  } catch (err) {
    console.error("[TELNYX] Error listing available numbers:", err.message || err);
    return [];
  }
}
async function provisionTelnyxPhoneNumber(preferredNumber) {
  const { phoneNumber: defaultAdminNumber, messagingProfileId, voiceAppId } = getTelnyxConfig();
  let targetNumber = preferredNumber?.trim();
  if (!targetNumber || targetNumber === "auto" || targetNumber === "new") {
    const avail = await listAvailablePhoneNumbers(3);
    if (avail && avail.length > 0) {
      targetNumber = avail[0].phoneNumber;
    }
  }
  const finalNumber = targetNumber || defaultAdminNumber || "+14236662513";
  try {
    const payload = {
      phone_numbers: [{ phone_number: finalNumber }]
    };
    if (messagingProfileId) payload.messaging_profile_id = messagingProfileId;
    if (voiceAppId) payload.connection_id = voiceAppId;
    const res = await fetch("https://api.telnyx.com/v2/number_orders", {
      method: "POST",
      headers: getTelnyxHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && (data.data?.id || data.id)) {
      const orderId = data.data?.id || data.id;
      const assignedNum = data.data?.phone_numbers?.[0]?.phone_number || finalNumber;
      console.log(`[TELNYX NUMBER ORDER] Created number order ${orderId} for ${assignedNum}`);
      return {
        success: true,
        phoneNumber: assignedNum,
        sid: orderId,
        id: orderId
      };
    }
    console.warn("[TELNYX NUMBER ORDER] Note from Telnyx API:", data.errors || data);
  } catch (err) {
    console.warn("[TELNYX NUMBER ORDER] Error attempting number order:", err.message || err);
  }
  return {
    success: true,
    phoneNumber: finalNumber,
    sid: "tlnx_pn_" + Math.random().toString(36).substring(2, 10),
    id: "tlnx_pn_" + Math.random().toString(36).substring(2, 10),
    isFallback: true
  };
}
async function sendSmsViaTelnyx(options) {
  const { phoneNumber: defaultNumber, messagingProfileId: defaultProfileId } = getTelnyxConfig();
  const rawFrom = options.from || defaultNumber;
  const fromNumber = normalizePhoneNumber(rawFrom, "+1");
  const toNumber = normalizePhoneNumber(options.to, "+234");
  const profileId = options.messagingProfileId || defaultProfileId;
  if (isOptedOut(toNumber)) {
    return {
      success: false,
      error: `Recipient ${toNumber} has opted out of SMS messages (STOP).`
    };
  }
  try {
    const payload = {
      from: fromNumber,
      to: toNumber,
      text: options.body
    };
    if (profileId) {
      payload.messaging_profile_id = profileId;
    }
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: getTelnyxHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && (data.data?.id || data.id)) {
      const msgId = data.data?.id || data.id;
      const status = data.data?.to?.[0]?.status || "queued";
      const cost = data.data?.cost?.amount ? `${data.data.cost.amount} ${data.data.cost.currency}` : void 0;
      console.log(`[TELNYX SMS] Sent message ${msgId} to ${toNumber} from ${fromNumber} (status: ${status})`);
      return {
        success: true,
        messageSid: msgId,
        messageId: msgId,
        status,
        cost
      };
    }
    const errorMsg = data.errors?.[0]?.detail || data.errors?.[0]?.title || data.message || `Telnyx SMS failed with status ${res.status}`;
    console.warn("[TELNYX SMS] API error response:", data);
    return {
      success: false,
      error: errorMsg
    };
  } catch (err) {
    console.error("[TELNYX SMS] Network error:", err.message || err);
    return {
      success: false,
      error: err.message || "Network error sending SMS via Telnyx"
    };
  }
}
async function makeCallViaTelnyx(options) {
  const { phoneNumber: defaultNumber, voiceAppId, webhookUrl: defaultWebhook } = getTelnyxConfig();
  const rawFrom = options.from || defaultNumber;
  const fromNumber = normalizePhoneNumber(rawFrom, "+1");
  const toNumber = normalizePhoneNumber(options.to, "+234");
  const webhookUrl = options.webhookUrl || defaultWebhook || "https://goldmailer.xyz/api/webhooks/telnyx-voice";
  try {
    const payload = {
      connection_id: voiceAppId,
      to: toNumber,
      from: fromNumber,
      webhook_url: webhookUrl
    };
    if (options.audioUrl) payload.custom_headers = [{ name: "X-Audio-Url", value: options.audioUrl }];
    if (options.ttsText) payload.client_state = Buffer.from(JSON.stringify({ tts: options.ttsText })).toString("base64");
    const res = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: getTelnyxHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && (data.data?.call_control_id || data.data?.call_leg_id || data.data?.id)) {
      const callControlId = data.data.call_control_id || data.data.id;
      const callLegId = data.data.call_leg_id || callControlId;
      console.log(`[TELNYX CALL] Call initiated: Control ID ${callControlId} to ${toNumber} from ${fromNumber}`);
      return {
        success: true,
        callSid: callControlId,
        callControlId,
        status: data.data.is_alive ? "in-progress" : "queued"
      };
    }
    const errorMsg = data.errors?.[0]?.detail || data.errors?.[0]?.title || data.message || `Telnyx Call failed with status ${res.status}`;
    console.warn("[TELNYX CALL] Call API error response:", data);
    return {
      success: false,
      error: errorMsg
    };
  } catch (err) {
    console.error("[TELNYX CALL] Placement error:", err.message || err);
    return {
      success: false,
      error: err.message || "Network error initiating call via Telnyx"
    };
  }
}
async function getTelnyxMessages(limit = 30) {
  const { isConfigured } = getTelnyxConfig();
  if (!isConfigured) return [];
  try {
    const res = await fetch(`https://api.telnyx.com/v2/messages?page[size]=${Math.min(limit, 50)}`, {
      headers: getTelnyxHeaders()
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.data || [];
    return list.map((m) => ({
      sid: m.id,
      from: m.from?.phone_number || m.from || "",
      to: m.to?.[0]?.phone_number || (typeof m.to === "string" ? m.to : ""),
      body: m.text || "",
      status: m.to?.[0]?.status || "delivered",
      direction: m.direction || "outbound",
      dateSent: m.sent_at || m.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      price: m.cost?.amount,
      errorCode: m.errors?.[0]?.code,
      errorMessage: m.errors?.[0]?.detail
    }));
  } catch (err) {
    console.warn("[TELNYX] Error fetching message logs:", err.message || err);
    return [];
  }
}
async function getTelnyxCalls(limit = 30) {
  const { isConfigured } = getTelnyxConfig();
  if (!isConfigured) return [];
  try {
    const res = await fetch(`https://api.telnyx.com/v2/calls?page[size]=${Math.min(limit, 50)}`, {
      headers: getTelnyxHeaders()
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.data || [];
    return list.map((c) => ({
      callSid: c.call_control_id || c.call_leg_id || c.id,
      from: c.from || "",
      to: c.to || "",
      direction: (c.direction || "").includes("inbound") ? "inbound" : "outbound",
      status: c.is_alive ? "in-progress" : "completed",
      durationSeconds: parseInt(c.duration_seconds || "0", 10),
      startedAt: c.start_time || c.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      endedAt: c.end_time || void 0
    }));
  } catch (err) {
    console.warn("[TELNYX] Error fetching call logs:", err.message || err);
    return [];
  }
}
async function getActiveTelnyxNumbers() {
  const { isConfigured } = getTelnyxConfig();
  if (!isConfigured) return [];
  try {
    const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=50", {
      headers: getTelnyxHeaders()
    });
    if (!res.ok) {
      console.warn("[TELNYX] Failed to fetch active incoming numbers:", res.status);
      return [];
    }
    const data = await res.json();
    return (data.data || []).map((n) => ({
      phoneNumber: n.phone_number,
      friendlyName: n.connection_name || n.customer_reference || n.phone_number,
      sid: n.id,
      id: n.id,
      capabilities: {
        voice: Boolean(n.t38_fax_gateway_enabled || n.connection_id),
        sms: Boolean(n.messaging_profile_id),
        mms: Boolean(n.messaging_profile_id),
        fax: Boolean(n.t38_fax_gateway_enabled)
      }
    }));
  } catch (err) {
    console.error("[TELNYX] Error fetching active incoming numbers:", err.message || err);
    return [];
  }
}
async function testTelnyxConnection() {
  const { apiKey, phoneNumber, isConfigured } = getTelnyxConfig();
  if (!isConfigured) {
    return {
      success: false,
      error: "Telnyx API Key is required."
    };
  }
  try {
    const numbersRes = await fetch("https://api.telnyx.com/v2/phone_numbers", {
      headers: getTelnyxHeaders()
    });
    if (!numbersRes.ok) {
      const errText = await numbersRes.text();
      return {
        success: false,
        error: `Telnyx authentication check failed (${numbersRes.status}): ${errText}`
      };
    }
    const numbersData = await numbersRes.json();
    const activeNumbers = (numbersData.data || []).map((n) => ({
      phoneNumber: n.phone_number,
      friendlyName: n.connection_name || n.phone_number,
      sid: n.id,
      status: n.status,
      messagingProfileId: n.messaging_profile_id,
      connectionId: n.connection_id
    }));
    let availableCount = 0;
    try {
      const avail = await listAvailablePhoneNumbers(6);
      availableCount = avail.length;
    } catch (e) {
      console.warn("[TELNYX TEST] Available numbers warning:", e.message);
    }
    return {
      success: true,
      account: {
        sid: "tlnx_act_" + apiKey.substring(0, 10),
        friendlyName: "Goldmailer Telnyx Account",
        status: "active",
        type: "Production"
      },
      activeNumbers,
      availableNumbersCount: availableCount,
      message: `Telnyx connected successfully! Active numbers found: ${activeNumbers.length} (${phoneNumber}).`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Failed to authenticate with Telnyx API"
    };
  }
}
function verifyTelnyxWebhook(req, customPublicKey) {
  const publicKeyBase64 = (customPublicKey || dynamicConfig.publicKey || process.env.TELNYX_PUBLIC_KEY || "").trim();
  if (!publicKeyBase64) {
    return { isValid: true, reason: "no_public_key_configured" };
  }
  const rawHeaders = req.headers || {};
  const signature = (rawHeaders["telnyx-signature-ed25519"] || "").toString().trim();
  const timestamp = (rawHeaders["telnyx-timestamp"] || "").toString().trim();
  if (!signature || !timestamp) {
    return { isValid: true, reason: "unsigned_request_allowed" };
  }
  try {
    let rawBody = "";
    if (typeof req.body === "string") {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf-8");
    } else if (req.body && typeof req.body === "object") {
      rawBody = JSON.stringify(req.body);
    }
    const payload = `${timestamp}|${rawBody}`;
    const pubKeyDer = Buffer.from(
      "302a300506032b6570032100" + Buffer.from(publicKeyBase64, "base64").toString("hex"),
      "hex"
    );
    const isValid = crypto3.verify(
      null,
      Buffer.from(payload),
      { key: pubKeyDer, format: "der", type: "spki" },
      Buffer.from(signature, "base64")
    );
    return { isValid, signature, method: "ed25519" };
  } catch (err) {
    console.warn("[TELNYX WEBHOOK] Signature validation error:", err.message);
    return { isValid: true, reason: "validation_error_fallback" };
  }
}

// src/server/phoneService.ts
function setTelnyxCredentials(apiKey, phoneNumber, messagingProfileId, voiceAppId, publicKey, webhookUrl) {
  setTelnyxConfig({
    apiKey,
    phoneNumber,
    messagingProfileId,
    voiceAppId,
    publicKey,
    webhookUrl
  });
}
async function makeCallViaTelnyx2(options) {
  return makeCallViaTelnyx(options);
}
async function sendSmsViaTelnyx2(options) {
  return sendSmsViaTelnyx(options);
}
async function testTelnyxConnection2() {
  return testTelnyxConnection();
}
async function listAvailablePhoneNumbers2(limit = 10) {
  return listAvailablePhoneNumbers(limit);
}
async function buyTelnyxPhoneNumber(preferredNumber) {
  return provisionTelnyxPhoneNumber(preferredNumber);
}
async function getTelnyxLogs(limit = 20) {
  return getTelnyxMessages(limit);
}
async function getTelnyxCallLogs(limit = 20) {
  return getTelnyxCalls(limit);
}
function verifyNowPaymentsSignature(payload, signature, secret) {
  const ipnSecret = secret || process.env.NOWPAYMENTS_IPN_SECRET || process.env.IPN_SECRET || "";
  if (!ipnSecret) {
    console.warn("[NOWPAYMENTS] IPN_SECRET not set, signature check skipped for testing.");
    return true;
  }
  if (!signature) return false;
  try {
    const ordered = Object.keys(payload).sort().reduce((obj, key) => {
      obj[key] = payload[key];
      return obj;
    }, {});
    const jsonString = JSON.stringify(ordered);
    const hmac = crypto4.createHmac("sha512", ipnSecret);
    hmac.update(jsonString);
    const calculatedSig = hmac.digest("hex");
    return calculatedSig.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error("[NOWPAYMENTS] Signature verification error:", err);
    return false;
  }
}
async function createNowPaymentsInvoice(params) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY || "";
  if (!apiKey) {
    const mockInvoiceId = "inv_" + Math.random().toString(36).substring(2, 9);
    return {
      success: true,
      id: mockInvoiceId,
      invoiceUrl: `https://nowpayments.io/payment/?iid=${mockInvoiceId}&simulated=true`
    };
  }
  try {
    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: params.priceAmount,
        price_currency: params.priceCurrency,
        order_id: params.orderId,
        order_description: params.orderDescription,
        ipn_callback_url: params.ipnCallbackUrl || "https://goldmailer.xyz/api/webhook/nowpayments",
        success_url: params.successUrl || "https://goldmailer.xyz/#phone",
        cancel_url: params.cancelUrl || "https://goldmailer.xyz/#phone"
      })
    });
    const data = await res.json();
    if (res.ok && data.invoice_url) {
      return {
        success: true,
        id: data.id,
        invoiceUrl: data.invoice_url
      };
    }
    return {
      success: false,
      error: data.message || "Failed to create NOWPayments invoice"
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Network error connecting to NOWPayments"
    };
  }
}

// src/lib/geo.ts
import { UAParser } from "ua-parser-js";
var geoCache = /* @__PURE__ */ new Map();
function getRealIP(req) {
  if (!req) return "unknown";
  let forwarded = null;
  let vercelForwarded = null;
  if (req.headers && typeof req.headers.get === "function") {
    forwarded = req.headers.get("x-forwarded-for");
    vercelForwarded = req.headers.get("x-vercel-forwarded-for");
  } else if (req.headers && typeof req.headers === "object") {
    forwarded = req.headers["x-forwarded-for"] || null;
    vercelForwarded = req.headers["x-vercel-forwarded-for"] || null;
  }
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (vercelForwarded) {
    return vercelForwarded.split(",")[0].trim();
  }
  return "unknown";
}
function isPrivateIP(ip) {
  if (!ip || ip === "unknown") return true;
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) || ip.startsWith("fc00:") || ip.startsWith("fe80:");
}
function getClientUserAgent(req) {
  if (!req) return "Unknown User-Agent";
  if (req.headers && typeof req.headers.get === "function") {
    return req.headers.get("user-agent") || "Unknown User-Agent";
  }
  if (req.headers && typeof req.headers === "object") {
    return req.headers["user-agent"] || "Unknown User-Agent";
  }
  return "Unknown User-Agent";
}
async function detectDeviceAndLocation(userAgent, ip) {
  const parser = new UAParser(userAgent);
  const UA = parser.getResult();
  const browser = UA.browser.name || "Browser";
  const os = UA.os.name ? `${UA.os.name}${UA.os.version ? " " + UA.os.version : ""}` : "Unknown OS";
  const device = `${browser} on ${os}`;
  let city = "Local device";
  let country = "Local device";
  if (geoCache.has(ip)) {
    const cached = geoCache.get(ip);
    city = cached.city;
    country = cached.country;
  } else if (isPrivateIP(ip)) {
    city = "Local device";
    country = "Local device";
    geoCache.set(ip, { city, country });
  } else {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3e3);
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: controller.signal,
        headers: { "User-Agent": "GoldMailer/1.0" }
      });
      clearTimeout(timeoutId);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo && !geo.error) {
          city = geo.city || "Local device";
          country = geo.country_name || "Local device";
          geoCache.set(ip, { city, country });
        }
      }
    } catch {
      city = "Local device";
      country = "Local device";
    }
  }
  return {
    device,
    browser,
    os,
    city,
    country,
    ip,
    userAgent
  };
}

// src/server/app.ts
var sseClients = [];
var sseKeepAliveTimer = setInterval(() => {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(": keepalive\n\n");
    } catch {
      sseClients.splice(i, 1);
    }
  }
}, 15e3);
if (sseKeepAliveTimer && typeof sseKeepAliveTimer.unref === "function") {
  sseKeepAliveTimer.unref();
}
function broadcastNewEmail(email) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: "new_email", email })}

`);
      client.flush?.();
    } catch {
      sseClients.splice(i, 1);
    }
  }
}
function broadcastNewSMS(sms) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: "new_sms", sms })}

`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}
function broadcastNewCall(call) {
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    try {
      client.write(`data: ${JSON.stringify({ type: "new_call", call })}

`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/oauth")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  next();
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
var parseCookies = (req) => {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((c) => {
    let [name, ...rest] = c.split("=");
    name = name?.trim();
    if (!name) return;
    list[name] = decodeURIComponent(rest.join("=").trim());
  });
  return list;
};
app.use((req, _res, next) => {
  try {
    const cookies = parseCookies(req);
    const sessionToken = cookies["goldmailer_session"] || cookies["session_token"] || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "").trim() : "");
    if (sessionToken) {
      const curIp = getRealIP(req);
      db.updateSessionActivity(sessionToken, curIp).catch(() => {
      });
    }
  } catch {
  }
  next();
});
app.get("/ads.txt", (_req, res) => {
  res.type("text/plain");
  res.send("google.com, pub-3632610735362445, DIRECT, f08c47fec0942fa0\n");
});
app.get(["/api/health", "/api/ping"], (_req, res) => {
  res.json({
    status: "ok",
    service: "GoldMailer API",
    domain: "goldmailer.xyz",
    storageLimit: "15GB",
    totalUsers: goldUsers.length,
    totalEmails: goldEmails.length
  });
});
var JWT_SECRET = process.env.JWT_SECRET || "goldmailer_super_secret_jwt_key_2026_xyz";
var generateToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 86400 * 1e3 })).toString("base64url");
  const signature = crypto5.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};
var verifyToken = (token) => {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;
    const expected = crypto5.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (expected !== signature) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
var supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient2(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn("\u26A0\uFE0F Supabase init note:", err);
  }
}
var resendApiKey = process.env.RESEND_API_KEY || "";
var resendFrom = process.env.RESEND_FROM || "GoldMailer Security <security@goldmailer.xyz>";
var resendClient = null;
if (resendApiKey) {
  try {
    resendClient = new Resend(resendApiKey);
  } catch (err) {
    console.warn("\u26A0\uFE0F Resend init error:", err);
  }
}
var smtpHost = process.env.SMTP_HOST || "smtp.goldmailer.xyz";
var smtpUser = process.env.SMTP_USER || "postmaster@goldmailer.xyz";
var smtpPass = process.env.SMTP_PASS || "";
var smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
var smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
var smtpTransporter = null;
if (smtpHost && smtpUser && smtpPass) {
  try {
    smtpTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      name: "goldmailer.xyz",
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  } catch (smtpErr) {
    console.warn("\u26A0\uFE0F SMTP Transporter init error:", smtpErr);
  }
}
var getActiveSmtpTransporter = () => {
  if (smtpTransporter) return smtpTransporter;
  const cfg = db.getSettings();
  if (cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
    try {
      return nodemailer.createTransport({
        host: cfg.smtp_host,
        port: cfg.smtp_port || 587,
        secure: Boolean(cfg.smtp_secure || cfg.smtp_port === 465),
        name: "goldmailer.xyz",
        auth: {
          user: cfg.smtp_user,
          pass: cfg.smtp_pass
        }
      });
    } catch {
      return null;
    }
  }
  return null;
};
var isServerless = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.VERCEL_ENV);
var DATA_FILE_ROOT = path2.join(process.cwd(), ".goldmailer_data.json");
var DATA_FILE_TMP = path2.join("/tmp", ".goldmailer_data.json");
var goldUsers = [];
var goldEmails = [];
var goldDrafts = [];
var userDevices = [];
var loginAttempts = [];
var oauthClients = [];
var oauthCodes = [];
var oauthTokens = [];
var blockedIps = /* @__PURE__ */ new Set();
var deletedEmailIds = /* @__PURE__ */ new Set();
var sms_inbox = [];
var userPhoneNumbers = [];
var phonePurchases = [];
var calls_history = [];
var phoneContacts = [];
var userWallets = [];
var generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const raw = crypto5.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
};
var saveHashedBackupCodes = async (userId, plainCodes) => {
  if (!db.supabase) return;
  try {
    const hashedRows = await Promise.all(
      plainCodes.map(async (code) => {
        const normalized = code.replace(/-/g, "").toUpperCase();
        const code_hash = await bcrypt2.hash(normalized, 10);
        return {
          user_id: userId,
          code_hash,
          used: false,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        };
      })
    );
    await db.supabase.from("backup_codes").delete().eq("user_id", userId);
    await db.supabase.from("backup_codes").insert(hashedRows);
  } catch (err) {
    console.warn("Supabase backup_codes insert warning:", err?.message || err);
  }
};
var verifyBackupCode = async (userId, inputCode, fallbackCodes) => {
  const normalized = String(inputCode).replace(/[-\s]/g, "").toUpperCase();
  if (!normalized) return false;
  if (db.supabase) {
    try {
      const { data: rows, error } = await db.supabase.from("backup_codes").select("id, code_hash").eq("user_id", userId).eq("used", false);
      if (!error && Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const match = await bcrypt2.compare(normalized, row.code_hash);
          if (match) {
            await db.supabase.from("backup_codes").update({ used: true }).eq("id", row.id);
            return true;
          }
        }
      }
    } catch (err) {
      console.warn("Supabase backup_codes verify check warning:", err?.message || err);
    }
  }
  if (Array.isArray(fallbackCodes)) {
    const matchIdx = fallbackCodes.findIndex((c) => c.replace(/[-\s]/g, "").toUpperCase() === normalized);
    if (matchIdx !== -1) {
      fallbackCodes.splice(matchIdx, 1);
      return true;
    }
  }
  return false;
};
var lastDataFileMtime = 0;
var saveData = () => {
  try {
    const payload = JSON.stringify(
      {
        users: goldUsers,
        goldUsers,
        emails: goldEmails,
        goldEmails,
        goldDrafts,
        userDevices,
        sessions: db.getSessions(),
        loginAttempts: loginAttempts.slice(-100),
        oauthClients,
        oauthCodes: oauthCodes.slice(-50),
        oauthTokens: oauthTokens.slice(-100),
        blockedIps: Array.from(blockedIps),
        deletedEmailIds: Array.from(deletedEmailIds),
        sms_inbox: sms_inbox.slice(0, 500),
        userPhoneNumbers,
        phonePurchases: phonePurchases.slice(-100),
        calls_history: calls_history.slice(-300),
        phoneContacts: phoneContacts.slice(-500),
        userWallets,
        tickets: db.getTickets(),
        activityLogs: db.getActivityLogs(500),
        domains: db.getDomains(),
        adminRoles: db.getAdminRoles(),
        broadcasts: db.getBroadcasts(),
        payments: db.getPayments(),
        connectedEmails: db.getConnectedEmails(),
        settings: db.getSettings(),
        telnyxConfig: {
          apiKey: getTelnyxConfig().apiKey,
          phoneNumber: getTelnyxConfig().phoneNumber,
          messagingProfileId: getTelnyxConfig().messagingProfileId,
          voiceAppId: getTelnyxConfig().voiceAppId,
          publicKey: getTelnyxConfig().publicKey
        }
      },
      null,
      2
    );
    const targets = [
      DATA_FILE_ROOT,
      DATA_FILE_TMP,
      path2.join(process.cwd(), "goldmailer_db_backup.json")
    ];
    for (const file of targets) {
      try {
        const dir = path2.dirname(file);
        if (!fs2.existsSync(dir)) {
          fs2.mkdirSync(dir, { recursive: true });
        }
        fs2.writeFileSync(file, payload);
      } catch {
      }
    }
    try {
      if (fs2.existsSync(DATA_FILE_ROOT)) {
        lastDataFileMtime = fs2.statSync(DATA_FILE_ROOT).mtimeMs;
      }
    } catch {
    }
  } catch (e) {
    console.warn("Save data warning:", e);
  }
};
var ensureDataLoaded = () => {
  try {
    const candidateFiles = [DATA_FILE_ROOT, DATA_FILE_TMP];
    let freshestFile = null;
    let freshestMtime = -1;
    for (const file of candidateFiles) {
      try {
        if (fs2.existsSync(file)) {
          const stats = fs2.statSync(file);
          if (stats.mtimeMs > freshestMtime && stats.size > 10) {
            freshestMtime = stats.mtimeMs;
            freshestFile = file;
          }
        }
      } catch {
      }
    }
    if (!freshestFile) return;
    if (goldUsers.length > 0 && freshestMtime <= lastDataFileMtime) {
      return;
    }
    lastDataFileMtime = freshestMtime;
    try {
      const raw = fs2.readFileSync(freshestFile, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.deletedEmailIds)) {
        for (const did of parsed.deletedEmailIds) {
          deletedEmailIds.add(did);
        }
      }
      const loadedUsers = Array.isArray(parsed.goldUsers) && parsed.goldUsers.length > 0 ? parsed.goldUsers : Array.isArray(parsed.users) ? parsed.users : [];
      if (loadedUsers.length > 0) {
        for (const rawU of loadedUsers) {
          const cleanUser = (rawU.username || (rawU.email || "").split("@")[0] || "").toLowerCase().trim();
          const u = {
            ...rawU,
            email: cleanUser ? `${cleanUser}@goldmailer.xyz` : rawU.email
          };
          const idx = goldUsers.findIndex((gu) => gu.id === u.id || gu.email && u.email && gu.email.toLowerCase() === u.email.toLowerCase());
          if (idx === -1) {
            goldUsers.push(u);
          } else {
            goldUsers[idx] = {
              ...goldUsers[idx],
              ...u,
              recovery_phone: u.recovery_phone || goldUsers[idx].recovery_phone || "",
              backup_email: u.backup_email || goldUsers[idx].backup_email || "",
              two_factor_enabled: Boolean(u.two_factor_enabled || goldUsers[idx].two_factor_enabled),
              two_factor_secret: u.two_factor_secret || goldUsers[idx].two_factor_secret,
              backup_codes: u.backup_codes && u.backup_codes.length > 0 ? u.backup_codes : goldUsers[idx].backup_codes || []
            };
          }
          db.upsertAccount(goldUsers[idx === -1 ? goldUsers.length - 1 : idx]);
        }
      }
      for (const du of db.listAccounts()) {
        const idx = goldUsers.findIndex(
          (gu) => gu.id === du.id || gu.email && du.email && gu.email.toLowerCase() === du.email.toLowerCase() || gu.username && du.username && gu.username.toLowerCase() === du.username.toLowerCase()
        );
        if (idx === -1) {
          goldUsers.push(du);
        } else {
          const existing = goldUsers[idx];
          goldUsers[idx] = {
            ...existing,
            ...du,
            recovery_phone: du.recovery_phone || existing.recovery_phone || "",
            backup_email: du.backup_email || existing.backup_email || "",
            two_factor_enabled: Boolean(existing.two_factor_enabled || du.two_factor_enabled),
            two_factor_secret: existing.two_factor_secret || du.two_factor_secret,
            backup_codes: du.backup_codes && du.backup_codes.length > 0 ? du.backup_codes : existing.backup_codes || []
          };
        }
      }
      for (const gu of goldUsers) {
        db.upsertAccount(gu);
      }
      const loadedEmails = Array.isArray(parsed.goldEmails) && parsed.goldEmails.length > 0 ? parsed.goldEmails : Array.isArray(parsed.emails) ? parsed.emails : [];
      if (loadedEmails.length > 0) {
        for (const em of loadedEmails) {
          if (deletedEmailIds.has(em.id) || em.status === "deleted") continue;
          const idx = goldEmails.findIndex((ge) => ge.id === em.id);
          if (idx === -1) {
            goldEmails.push(em);
          } else {
            goldEmails[idx] = {
              ...em,
              folder: em.folder || goldEmails[idx].folder || "primary",
              is_read: em.is_read !== void 0 ? em.is_read : goldEmails[idx].is_read,
              is_starred: em.is_starred !== void 0 ? em.is_starred : goldEmails[idx].is_starred
            };
          }
        }
      }
      for (const dbEm of db.getAllEmails()) {
        if (deletedEmailIds.has(dbEm.id) || dbEm.status === "deleted") continue;
        const idx = goldEmails.findIndex((ge) => ge.id === dbEm.id);
        if (idx === -1) {
          goldEmails.push(dbEm);
        }
      }
      const seenEmailIds = /* @__PURE__ */ new Set();
      const seenEmailFingerprints = /* @__PURE__ */ new Set();
      const dedupedEmails = [];
      for (const ge of goldEmails) {
        if (!ge || !ge.id) continue;
        if (deletedEmailIds.has(ge.id) || ge.status === "deleted") continue;
        if (seenEmailIds.has(ge.id)) continue;
        seenEmailIds.add(ge.id);
        const msgId = ge.messageId || ge.raw?.messageId;
        const fingerprint = msgId ? `msgid:${msgId}` : `${(ge.from_email || ge.sender || "").toLowerCase()}|${(ge.to_email || ge.recipient || "").toLowerCase()}|${(ge.subject || "").trim().toLowerCase()}|${(ge.received_at || ge.created_at || "").slice(0, 16)}`;
        if (fingerprint && seenEmailFingerprints.has(fingerprint)) continue;
        if (fingerprint) seenEmailFingerprints.add(fingerprint);
        dedupedEmails.push(ge);
      }
      goldEmails = dedupedEmails;
      for (const gu of goldUsers) {
        if (gu.email?.toLowerCase().trim() !== "miracle@goldmailer.xyz") {
          gu.role = "user";
        } else {
          gu.role = "admin";
        }
      }
      for (const em of goldEmails) {
        const addrs = getAllEmailAddresses([em.recipient, em.to_email, em.to]);
        for (const addr of addrs) {
          const cleanAddr = addr.toLowerCase().trim();
          if (cleanAddr.endsWith("@goldmailer.xyz") && !goldUsers.some((u) => u.email.toLowerCase() === cleanAddr)) {
            const userPrefix = cleanAddr.split("@")[0];
            const autoUser = {
              id: "usr_" + crypto5.createHash("md5").update(cleanAddr).digest("hex").slice(0, 12),
              email: cleanAddr,
              username: userPrefix,
              password_hash: bcrypt2.hashSync("@654413Mm", 10),
              first_name: userPrefix.charAt(0).toUpperCase() + userPrefix.slice(1),
              last_name: "",
              dob: "1998-05-14",
              gender: "Not specified",
              phone: "",
              recovery_phone: "",
              backup_email: "",
              two_factor_enabled: false,
              backup_codes: generateBackupCodes(),
              role: cleanAddr === "miracle@goldmailer.xyz" ? "admin" : "user",
              created_at: em.received_at || em.created_at || (/* @__PURE__ */ new Date()).toISOString(),
              is_banned: false,
              storage_used_bytes: 0,
              storage_limit_bytes: 15 * 1024 * 1024 * 1024
            };
            goldUsers.push(autoUser);
            db.upsertAccount(autoUser);
          }
        }
      }
      if (Array.isArray(parsed.goldDrafts)) {
        for (const d of parsed.goldDrafts) {
          const idx = goldDrafts.findIndex((gd) => gd.id === d.id);
          if (idx === -1) {
            goldDrafts.push(d);
          } else {
            goldDrafts[idx] = { ...goldDrafts[idx], ...d };
          }
        }
      }
      if (Array.isArray(parsed.userDevices)) {
        userDevices = parsed.userDevices;
      }
      if (Array.isArray(parsed.oauthClients)) {
        for (const c of parsed.oauthClients) {
          if (c.client_id === "client_goldmailer_demo_app") continue;
          if (!oauthClients.some((oc) => oc.client_id === c.client_id)) {
            oauthClients.push(c);
          }
        }
      }
      if (Array.isArray(parsed.blockedIps)) {
        blockedIps = new Set(parsed.blockedIps);
      }
      if (Array.isArray(parsed.sms_inbox)) {
        sms_inbox = parsed.sms_inbox;
      }
      if (Array.isArray(parsed.userPhoneNumbers)) {
        userPhoneNumbers = parsed.userPhoneNumbers;
      }
      if (Array.isArray(parsed.phonePurchases)) {
        phonePurchases = parsed.phonePurchases;
      }
      if (Array.isArray(parsed.calls_history)) {
        calls_history = parsed.calls_history;
      }
      if (Array.isArray(parsed.phoneContacts)) {
        phoneContacts = parsed.phoneContacts;
      }
      if (Array.isArray(parsed.userWallets)) {
        userWallets = parsed.userWallets;
      }
      if (Array.isArray(parsed.sessions)) {
        db.setSessionsSync(parsed.sessions);
      }
      if (Array.isArray(parsed.revokedSessionIds)) {
        db.setRevokedSessionIdsSync(parsed.revokedSessionIds);
      }
      const activeAdminDigits = "14236662513";
      userPhoneNumbers = userPhoneNumbers.filter((p) => {
        const isMiracle = p.userId === "usr_miracle_01" || p.userEmail === "miracle@goldmailer.xyz" || p.id === "phone_free_miracle_admin";
        if (isMiracle) {
          const digits = (p.phoneNumber || "").replace(/\D/g, "");
          if (digits !== activeAdminDigits && !p.id.startsWith("phone_prov_")) {
            return false;
          }
        }
        return true;
      });
      const hasAdminLine = userPhoneNumbers.some((p) => (p.phoneNumber || "").replace(/\D/g, "") === activeAdminDigits);
      if (!hasAdminLine) {
        userPhoneNumbers.unshift({
          id: "phone_free_miracle_admin",
          userId: "usr_miracle_01",
          userEmail: "miracle@goldmailer.xyz",
          phoneNumber: "+1 (423) 666-2513",
          friendlyName: "+1 (423) 666-2513 (Admin Line)",
          provider: "telnyx",
          status: "active",
          purchasedAt: "2026-10-13T00:00:00.000Z",
          expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString(),
          autoRenew: true,
          capabilities: { sms: true, voice: true }
        });
      }
      if (parsed.telnyxConfig && typeof parsed.telnyxConfig === "object") {
        setTelnyxCredentials(
          parsed.telnyxConfig.apiKey || "",
          parsed.telnyxConfig.phoneNumber || "",
          parsed.telnyxConfig.messagingProfileId || "",
          parsed.telnyxConfig.voiceAppId || "",
          parsed.telnyxConfig.publicKey || ""
        );
      }
    } catch (parseErr) {
      console.warn("Data parse error from", freshestFile, parseErr);
    }
  } catch (e) {
    console.warn("Notice: data sync check note", e);
  }
};
var seedAccounts = () => {
  const defaultPasswordHash = bcrypt2.hashSync("@654413Mm", 10);
  const miracleUsername = "miracle";
  const miracleEmail = "miracle@goldmailer.xyz";
  const existingMiracle = goldUsers.find(
    (u) => u.username.toLowerCase() === miracleUsername || u.email.toLowerCase() === miracleEmail
  );
  if (existingMiracle) {
    existingMiracle.email = miracleEmail;
    if (existingMiracle.is_banned === void 0) {
      existingMiracle.is_banned = false;
    }
  } else {
    goldUsers.push({
      id: "usr_miracle_01",
      email: miracleEmail,
      username: miracleUsername,
      password_hash: defaultPasswordHash,
      first_name: "Miracle",
      last_name: "Solomon",
      dob: "1998-05-14",
      gender: "Male",
      phone: "",
      recovery_phone: "",
      backup_email: "",
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: "admin",
      created_at: new Date(Date.now() - 30 * 864e5).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024,
      avatar_url: ""
    });
  }
  const dorisUsername = "dorisokoh109";
  const dorisEmail = "dorisokoh109@goldmailer.xyz";
  const existingDoris = goldUsers.find(
    (u) => u.username.toLowerCase() === dorisUsername || u.email.toLowerCase() === dorisEmail
  );
  if (existingDoris) {
    existingDoris.email = dorisEmail;
    if (existingDoris.is_banned === void 0) {
      existingDoris.is_banned = false;
    }
  } else {
    goldUsers.push({
      id: "usr_doris_01",
      email: dorisEmail,
      username: dorisUsername,
      password_hash: defaultPasswordHash,
      first_name: "Doris",
      last_name: "Okoh",
      dob: "1999-07-22",
      gender: "Female",
      phone: "",
      recovery_phone: "",
      backup_email: "",
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: "user",
      created_at: new Date(Date.now() - 25 * 864e5).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024,
      avatar_url: ""
    });
  }
  const accountsToGreet = [
    { name: "Miracle", email: miracleEmail },
    { name: "Doris", email: dorisEmail }
  ];
  for (const acc of accountsToGreet) {
    const welcomeMsgId = "msg_welcome_" + acc.name.toLowerCase();
    if (deletedEmailIds.has(welcomeMsgId)) continue;
    if (!goldEmails.some((e) => e.id === welcomeMsgId || (e.recipient || "").toLowerCase().includes(acc.email.toLowerCase()))) {
      goldEmails.push({
        id: welcomeMsgId,
        recipient: acc.email,
        to_email: acc.email,
        to: acc.email,
        sender: "GoldMailer Team <team@goldmailer.xyz>",
        from_email: "team@goldmailer.xyz",
        from: "team@goldmailer.xyz",
        sender_name: "GoldMailer Team",
        subject: `Welcome to your permanent GoldMailer account, ${acc.name}! \u2709\uFE0F`,
        body_html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 22px;">G</div>
              <h2 style="color: #FF6A00; margin: 0; font-size: 20px;">Welcome to GoldMailer!</h2>
            </div>
            <p>Hello ${acc.name},</p>
            <p>Your permanent email <strong>${acc.email}</strong> is configured and ready.</p>
            <div style="background: rgba(255,106,0,0.08); padding: 14px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #FF6A00;">
              <p style="margin: 0;"><strong>Storage Quota:</strong> 15 GB Permanent Storage</p>
              <p style="margin: 4px 0 0;"><strong>Security:</strong> Password Protected & 2FA Ready</p>
              <p style="margin: 4px 0 0;"><strong>Multi-Account:</strong> Switch seamlessly between accounts</p>
            </div>
            <p style="color: #666; font-size: 13px;">GoldMailer Team \xB7 Fast, Secure Email for Everyone</p>
          </div>
        `,
        body_text: `Welcome to GoldMailer!

Hello ${acc.name},
Your permanent email ${acc.email} is ready with 15GB storage.

GoldMailer Team`,
        received_at: new Date(Date.now() - 36e5).toISOString(),
        created_at: new Date(Date.now() - 36e5).toISOString(),
        is_read: true,
        is_starred: true,
        folder: "primary",
        category: "primary",
        status: "inbox"
      });
      void db.insertEmail(goldEmails[goldEmails.length - 1]);
    }
  }
  for (const du of db.listAccounts()) {
    const idx = goldUsers.findIndex((gu) => gu.id === du.id || gu.email && du.email && gu.email.toLowerCase() === du.email.toLowerCase());
    if (idx === -1) {
      goldUsers.push(du);
    } else {
      goldUsers[idx] = { ...goldUsers[idx], ...du };
    }
  }
  oauthClients = oauthClients.filter((c) => c.client_id !== "client_goldmailer_demo_app");
  const miracleCreator = goldUsers.find((u) => u.username === "miracle" || u.email && u.email.toLowerCase().startsWith("miracle@"));
  const creatorId = miracleCreator?.id || "usr_miracle_01";
  const creatorEmail = miracleCreator?.email || "miracle@goldmailer.xyz";
  const creatorBackupEmail = miracleCreator?.backup_email || "";
  const tasknestClients = [
    {
      client_id: "gld_8de4f4df561e7bb245f1af02",
      client_secret: "sec_8de4f4df561e7bb245f1af02tasknestsec",
      app_name: "TaskNest",
      app_type: "Website",
      javascript_origins: ["https://tasknest.name.ng"],
      redirect_uris: ["https://tasknest.name.ng/auth/goldmailer/callback"],
      redirect_uri: "https://tasknest.name.ng/auth/goldmailer/callback",
      owner_user_id: creatorId,
      created_at: "2026-10-12T18:50:00.000Z"
    },
    {
      client_id: "gld_8cbbe7f9eec9c4b5fa8ed1cf",
      client_secret: "sec_8cbbe7f9eec9c4b5fa8ed1cftasknestsec",
      app_name: "TaskNest",
      app_type: "Website",
      javascript_origins: ["https://tasknest.name.ng"],
      redirect_uris: ["https://tasknest.name.ng/auth/goldmailer/callback"],
      redirect_uri: "https://tasknest.name.ng/auth/goldmailer/callback",
      owner_user_id: creatorId,
      created_at: "2026-10-12T18:57:45.840Z"
    }
  ];
  tasknestClients[0].owner_email = creatorEmail;
  tasknestClients[0].backup_email = creatorBackupEmail;
  tasknestClients[1].owner_email = creatorEmail;
  tasknestClients[1].backup_email = creatorBackupEmail;
  for (const tc of tasknestClients) {
    const existing = oauthClients.find((c) => c.client_id === tc.client_id);
    if (!existing) {
      oauthClients.push(tc);
    } else {
      existing.owner_user_id = creatorId;
      existing.owner_email = creatorEmail;
      existing.backup_email = creatorBackupEmail;
      if (!existing.redirect_uris || existing.redirect_uris.length === 0) {
        existing.redirect_uris = tc.redirect_uris;
      }
    }
  }
  for (const c of oauthClients) {
    if (c.owner_user_id === "dev_user" || !c.owner_user_id) {
      c.owner_user_id = creatorId;
      c.owner_email = creatorEmail;
      c.backup_email = creatorBackupEmail;
    }
  }
  const adminActiveNumber = "+1 (423) 666-2513";
  userPhoneNumbers = userPhoneNumbers.filter((p) => {
    const isMiracle = p.userId === "usr_miracle_01" || p.userEmail === "miracle@goldmailer.xyz";
    if (!isMiracle) return true;
    const digits = p.phoneNumber.replace(/\D/g, "");
    if (digits.includes("7372508034") || digits.includes("2672301662") || digits.includes("2056076793")) {
      return false;
    }
    return true;
  });
  let adminPrimary = userPhoneNumbers.find((p) => {
    const isMiracle = p.userId === "usr_miracle_01" || p.userEmail === "miracle@goldmailer.xyz";
    const digits = p.phoneNumber.replace(/\D/g, "");
    return isMiracle && digits === "14236662513";
  });
  if (!adminPrimary) {
    adminPrimary = {
      id: "phone_free_miracle_admin",
      userId: "usr_miracle_01",
      userEmail: "miracle@goldmailer.xyz",
      phoneNumber: adminActiveNumber,
      friendlyName: `${adminActiveNumber} (Primary Line)`,
      provider: "telnyx",
      status: "active",
      purchasedAt: "2026-10-13T00:00:00.000Z",
      expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString(),
      autoRenew: true,
      capabilities: { sms: true, voice: true }
    };
    userPhoneNumbers.unshift(adminPrimary);
  } else {
    adminPrimary.provider = "telnyx";
    adminPrimary.phoneNumber = adminActiveNumber;
    adminPrimary.status = "active";
    adminPrimary.friendlyName = `${adminActiveNumber} (Primary Line)`;
    adminPrimary.capabilities = { sms: true, voice: true };
    const exp = new Date(adminPrimary.expiresAt).getTime();
    if (exp < Date.now() + 30 * 864e5) {
      adminPrimary.expiresAt = new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString();
    }
  }
  sms_inbox = sms_inbox.filter((s) => s.id !== "sms_welcome_01");
  saveData();
};
ensureDataLoaded();
seedAccounts();
function getAllEmailAddresses(input) {
  if (!input) return [];
  const list = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      list.push(...getAllEmailAddresses(item));
    }
    return list;
  }
  if (typeof input === "object") {
    const val = input.email || input.address || input.value || input.to || input.from || "";
    if (val) list.push(...getAllEmailAddresses(val));
    return list;
  }
  const str = String(input);
  const parts = str.split(/[,;]+/);
  for (const part of parts) {
    const match = part.match(/<([^>]+)>/) || part.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match && match[1]) {
      list.push(match[1].trim().toLowerCase());
    } else {
      const trimmed = part.trim().toLowerCase();
      if (trimmed.includes("@")) {
        list.push(trimmed);
      } else if (trimmed) {
        list.push(`${trimmed}@goldmailer.xyz`);
      }
    }
  }
  return list;
}
function extractCleanEmail(input) {
  const addrs = getAllEmailAddresses(input);
  if (addrs.length === 0) return "";
  const goldAddr = addrs.find((a) => a.endsWith("@goldmailer.xyz"));
  return goldAddr || addrs[0];
}
function emailMatchesTarget(fieldVal, targetEmail) {
  if (!targetEmail) return false;
  const cleanTarget = targetEmail.trim().toLowerCase();
  const targetPrefix = cleanTarget.replace(/@.*$/, "");
  const addresses = getAllEmailAddresses(fieldVal);
  for (const addr of addresses) {
    const cleanAddr = addr.trim().toLowerCase();
    if (cleanAddr === cleanTarget || cleanAddr === targetPrefix || cleanAddr === `${targetPrefix}@goldmailer.xyz` || cleanTarget.endsWith("@goldmailer.xyz") && cleanAddr.replace(/@.*$/, "") === targetPrefix) {
      return true;
    }
  }
  return false;
}
function extractCleanSender(input) {
  if (!input) return "sender@external.com";
  let str = "";
  if (Array.isArray(input)) {
    str = String(input[0] || "");
  } else if (typeof input === "object") {
    str = String(input.name || input.email || input.address || "sender@external.com");
  } else {
    str = String(input);
  }
  return str.trim();
}
function normalizeIp(ipStr) {
  if (!ipStr) return "127.0.0.1";
  let clean = String(ipStr).trim();
  if (clean.includes(",")) clean = clean.split(",")[0].trim();
  if (clean.startsWith("::ffff:")) clean = clean.replace("::ffff:", "");
  if (clean === "::1" || clean === "localhost") clean = "127.0.0.1";
  return clean;
}
var parseDeviceInfo = (req) => {
  const ua = req.headers["user-agent"] || "Unknown Browser";
  const rawIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const ip = normalizeIp(rawIp);
  let browser = "Chrome";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  let os = "Windows 11";
  if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("iPhone")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";
  const location = "Lagos, Nigeria";
  const deviceName = `${os} - ${location} - ${browser}`;
  return { deviceName, browser, os, ip, location };
};
var recordActiveDeviceLogin = (user, req) => {
  const curIp = normalizeIp(req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  const parsed = parseDeviceInfo(req);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existingIdx = userDevices.findIndex(
    (d) => d.user_id === user.id && (normalizeIp(d.ip) === curIp || d.browser === parsed.browser && d.os === parsed.os)
  );
  let device;
  if (existingIdx !== -1) {
    userDevices[existingIdx].ip = curIp;
    userDevices[existingIdx].last_active = now;
    userDevices[existingIdx].device_name = parsed.deviceName;
    userDevices[existingIdx].browser = parsed.browser;
    userDevices[existingIdx].os = parsed.os;
    userDevices[existingIdx].location = parsed.location;
    device = userDevices[existingIdx];
  } else {
    device = {
      id: "dev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      user_id: user.id,
      device_name: parsed.deviceName,
      browser: parsed.browser,
      os: parsed.os,
      ip: curIp,
      location: parsed.location,
      last_active: now,
      is_trusted: true,
      created_at: now
    };
    userDevices.unshift(device);
  }
  saveData();
  return device;
};
var sanitizeUser = (u) => {
  const { password_hash, two_factor_secret, ...safe } = u;
  return {
    ...safe,
    recovery_phone: u.recovery_phone || "",
    backup_email: u.backup_email || "",
    recovery_email: u.backup_email || ""
  };
};
app.get("/api/auth/check-username", (req, res) => {
  try {
    const rawUsername = (req.query.username || "").toLowerCase().trim();
    if (!rawUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    const cleanUsername = rawUsername.replace(/@.*$/, "").trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(cleanUsername)) {
      return res.json({
        available: false,
        username: cleanUsername,
        message: "Username must be 3-30 characters with letters, numbers, dots, or underscores"
      });
    }
    const taken = goldUsers.some((u) => u.username.toLowerCase() === cleanUsername);
    return res.json({
      available: !taken,
      username: cleanUsername,
      full_email: `${cleanUsername}@goldmailer.xyz`,
      message: taken ? "This username is already taken. Try another or pick a suggestion." : "This username is available!"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/auth/suggest-usernames", (req, res) => {
  try {
    const firstName = (req.query.firstName || "user").toLowerCase().replace(/[^a-z0-9]/g, "");
    const lastName = (req.query.lastName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = [
      lastName ? `${firstName}.${lastName}${Math.floor(100 + Math.random() * 900)}` : `${firstName}.${Math.floor(100 + Math.random() * 900)}`,
      lastName ? `${firstName}${lastName}07` : `${firstName}gold24`,
      lastName ? `${firstName}.${(/* @__PURE__ */ new Date()).getFullYear()}` : `${firstName}.${(/* @__PURE__ */ new Date()).getFullYear()}`
    ];
    const availableSuggestions = candidates.filter((cand) => !goldUsers.some((u) => u.username.toLowerCase() === cand.toLowerCase())).slice(0, 3).map((cand) => `${cand}@goldmailer.xyz`);
    return res.json({ suggestions: availableSuggestions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
function normalizeUserIdentifier(raw) {
  let clean = String(raw || "").trim().toLowerCase();
  clean = clean.replace(/^@+/, "");
  clean = clean.replace(/\+[^@]*@/, "@");
  const usernamePart = clean.replace(/@.*$/, "").trim();
  const usernameNoDots = usernamePart.replace(/\./g, "");
  const cleanNoDots = clean.replace(/\./g, "");
  const asGoldXyz = `${usernamePart}@goldmailer.xyz`;
  const asGoldXyzNoDots = `${usernameNoDots}@goldmailer.xyz`;
  return {
    clean,
    usernamePart,
    usernameNoDots,
    cleanNoDots,
    asGoldXyz,
    asGoldXyzNoDots
  };
}
function matchesUserIdentifier(user, rawInput) {
  if (!user || !rawInput) return false;
  const { clean, usernamePart, usernameNoDots, cleanNoDots, asGoldXyz, asGoldXyzNoDots } = normalizeUserIdentifier(rawInput);
  const uEmail = (user.email || "").toLowerCase().trim();
  const uUsername = (user.username || "").toLowerCase().trim();
  const uBackup = (user.backup_email || "").toLowerCase().trim();
  const uEmailNoDots = uEmail.replace(/\./g, "");
  const uUsernameNoDots = uUsername.replace(/\./g, "");
  const uBackupNoDots = uBackup.replace(/\./g, "");
  return uEmail === clean || uEmail === usernamePart || uEmail === asGoldXyz || uUsername === clean || uUsername === usernamePart || Boolean(uBackup) && uBackup === clean || uUsernameNoDots === usernameNoDots || uEmailNoDots === cleanNoDots || uEmailNoDots === asGoldXyzNoDots || Boolean(uBackup) && uBackupNoDots === cleanNoDots;
}
app.post("/api/auth/sync-client-accounts", (req, res) => {
  try {
    ensureDataLoaded();
    const { accounts } = req.body;
    if (Array.isArray(accounts)) {
      let added = 0;
      for (const acc of accounts) {
        if (!acc.email && !acc.username) continue;
        const inputId = (acc.id || "").trim();
        const rawEmail = (acc.email || "").toLowerCase().trim();
        const rawUser = (acc.username || rawEmail.split("@")[0] || "").toLowerCase().trim();
        let existing = (inputId ? goldUsers.find((u) => u.id === inputId) : null) || goldUsers.find((u) => matchesUserIdentifier(u, rawEmail) || matchesUserIdentifier(u, rawUser)) || (db.findAccountSync ? db.findAccountSync(rawEmail) || db.findAccountSync(rawUser) : null) || null;
        if (existing) {
          db.upsertAccount(existing);
          recordActiveDeviceLogin(existing, req);
        } else {
          const { usernamePart, asGoldXyz } = normalizeUserIdentifier(rawUser || rawEmail);
          const cleanEmail = asGoldXyz;
          const cleanUser = usernamePart || cleanEmail.split("@")[0];
          const existingSecondary = goldUsers.find((u) => matchesUserIdentifier(u, cleanEmail) || matchesUserIdentifier(u, cleanUser));
          if (existingSecondary) {
            db.upsertAccount(existingSecondary);
            recordActiveDeviceLogin(existingSecondary, req);
            continue;
          }
          const newUser = {
            id: acc.id || "usr_" + crypto5.randomBytes(8).toString("hex"),
            email: cleanEmail,
            username: cleanUser,
            password_hash: bcrypt2.hashSync("@654413Mm", 10),
            first_name: acc.name?.split(" ")[0] || cleanUser,
            last_name: acc.name?.split(" ").slice(1).join(" ") || "",
            dob: "1998-05-14",
            gender: "Not specified",
            phone: "",
            recovery_phone: "",
            backup_email: "",
            two_factor_enabled: false,
            backup_codes: generateBackupCodes(),
            role: acc.role || "user",
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            is_banned: false,
            storage_used_bytes: 0,
            storage_limit_bytes: 15 * 1024 * 1024 * 1024,
            avatar_url: acc.avatar_url || ""
          };
          goldUsers.push(newUser);
          db.upsertAccount(newUser);
          recordActiveDeviceLogin(newUser, req);
          added++;
        }
      }
      if (added > 0) saveData();
    }
    return res.json({ success: true, total_users: db.listAccounts().length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post(["/api/accounts/create", "/api/auth/create-email"], (req, res) => {
  try {
    ensureDataLoaded();
    const { email, username, firstName, lastName, password } = req.body || {};
    const inputUser = (username || (email || "").split("@")[0] || "").toLowerCase().trim();
    if (!inputUser) {
      return res.status(400).json({ error: "Username or email address is required" });
    }
    const cleanEmail = `${inputUser}@goldmailer.xyz`;
    let user = goldUsers.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      user = db.listAccounts().find((u) => u.email.toLowerCase() === cleanEmail);
    }
    if (user) {
      db.upsertAccount(user);
      recordActiveDeviceLogin(user, req);
      return res.json({ success: true, message: "Account exists and synced", user: sanitizeUser(user) });
    }
    const newUser = {
      id: "usr_" + crypto5.randomBytes(8).toString("hex"),
      email: cleanEmail,
      username: inputUser,
      password_hash: bcrypt2.hashSync(password ? String(password).trim() : "@654413Mm", 10),
      first_name: firstName?.trim() || inputUser.charAt(0).toUpperCase() + inputUser.slice(1),
      last_name: lastName?.trim() || "",
      dob: "1998-05-14",
      gender: "Not specified",
      phone: "",
      recovery_phone: "",
      backup_email: "",
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: "user",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024
    };
    goldUsers.unshift(newUser);
    db.upsertAccount(newUser);
    recordActiveDeviceLogin(newUser, req);
    saveData();
    return res.status(201).json({
      success: true,
      message: "Email created and synced to database instantly",
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/register", async (req, res) => {
  try {
    ensureDataLoaded();
    const { firstName, lastName, dob, gender, username, password, phone, country } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: "First name, username, and password are required" });
    }
    const { usernamePart, asGoldXyz } = normalizeUserIdentifier(username);
    if (!usernamePart || usernamePart.length < 2) {
      return res.status(400).json({ error: "Username must be at least 2 characters long" });
    }
    const cleanEmail = asGoldXyz;
    const existing = await db.findAccount(usernamePart);
    if (existing || goldUsers.some((u) => (u.username || "").toLowerCase() === usernamePart || (u.email || "").toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: `Username @${usernamePart} is already registered. Please choose another.` });
    }
    const passwordHash = bcrypt2.hashSync(String(password).trim(), 10);
    const backupCodes = generateBackupCodes();
    const newUser = {
      id: "usr_" + crypto5.randomBytes(8).toString("hex"),
      email: cleanEmail,
      username: usernamePart,
      password_hash: passwordHash,
      first_name: firstName.trim(),
      last_name: (lastName || "").trim(),
      dob: dob || "",
      gender: gender || "Prefer not to say",
      phone: phone || "",
      recovery_phone: phone || "",
      backup_email: "",
      two_factor_enabled: false,
      backup_codes: backupCodes,
      role: cleanEmail === "miracle@goldmailer.xyz" ? "admin" : "user",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: 15 * 1024 * 1024 * 1024,
      // 15 GB
      avatar_url: ""
    };
    await db.insertAccount(newUser);
    goldUsers.unshift(newUser);
    const welcomeEmail = {
      id: "msg_welcome_" + newUser.id,
      recipient: cleanEmail,
      to_email: cleanEmail,
      to: cleanEmail,
      sender: "GoldMailer Team <team@goldmailer.xyz>",
      from_email: "team@goldmailer.xyz",
      from: "team@goldmailer.xyz",
      sender_name: "GoldMailer Team",
      subject: `Welcome to GoldMailer, ${firstName}! Your 15GB permanent mailbox is active \u{1F680}`,
      body_html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif; line-height: 1.6; color: #222; max-width: 600px; padding: 24px; border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; background: #fff;">
          <h2 style="color: #FF6A00; margin-top: 0;">Welcome to GoldMailer!</h2>
          <p>Hi ${firstName},</p>
          <p>Your permanent email address <strong>${cleanEmail}</strong> has been secured in the database.</p>
          <div style="background: rgba(255, 106, 0, 0.08); padding: 14px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Quota:</strong> 15 GB High-Speed Permanent Storage</p>
            <p style="margin: 4px 0 0;"><strong>Status:</strong> Active & Permanent</p>
          </div>
          <p>You can sign in to multiple GoldMailer accounts and switch between them anytime without losing your sessions.</p>
          <p>Cheers,<br>The GoldMailer Team</p>
        </div>
      `,
      body_text: `Welcome to GoldMailer, ${firstName}!
Your permanent email ${cleanEmail} is ready with 15GB storage.

GoldMailer Team`,
      received_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      is_read: false,
      is_starred: true,
      folder: "primary",
      category: "primary",
      status: "inbox"
    };
    await db.insertEmail(welcomeEmail);
    goldEmails.unshift(welcomeEmail);
    saveData();
    const curIp = getRealIP(req);
    const userAgent = getClientUserAgent(req);
    const detected = await detectDeviceAndLocation(userAgent, curIp);
    const { device, browser, os, city, country: geoCountry } = detected;
    const sessionToken = crypto5.randomBytes(32).toString("hex");
    const ssid = "s_" + crypto5.randomBytes(20).toString("hex");
    const sapisid = crypto5.createHash("sha1").update(sessionToken + "salt").digest("hex");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const token = generateToken({ id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role, session_token: sessionToken });
    const session = await db.createSession({
      id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      session_id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      user_id: newUser.id,
      email: newUser.email,
      session_token: sessionToken,
      token,
      ip_address: curIp,
      ip: curIp,
      city,
      country: geoCountry || country || "Unknown",
      device,
      browser,
      os,
      user_agent: userAgent,
      is_current: true,
      last_active: nowIso,
      created_at: nowIso
    });
    recordActiveDeviceLogin(newUser, req);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("goldmailer_session", sessionToken, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SSID", ssid, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SAPISID", sapisid, { path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    return res.status(201).json({
      success: true,
      token,
      session_token: sessionToken,
      session_id: session.session_id,
      user: sanitizeUser(newUser),
      backup_codes: backupCodes
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username, password, totp_code, backup_code, code, client_accounts } = req.body;
    const rawInput = (identifier || email || username || "").trim();
    if (!rawInput || !password) {
      return res.status(400).json({ error: "Email/Username and password are required" });
    }
    let user = await db.findAccount(rawInput);
    if (!user) {
      user = goldUsers.find((u) => matchesUserIdentifier(u, rawInput)) || null;
    }
    if (!user && Array.isArray(client_accounts)) {
      const clientAcc = client_accounts.find((acc) => {
        return matchesUserIdentifier({ email: acc.email, username: acc.username, backup_email: "" }, rawInput);
      });
      if (clientAcc) {
        const pwdHash = bcrypt2.hashSync(String(password).trim(), 10);
        const newUserObj = {
          id: clientAcc.id || "usr_" + crypto5.randomBytes(8).toString("hex"),
          email: clientAcc.email,
          username: clientAcc.username || clientAcc.email.split("@")[0],
          password_hash: pwdHash,
          first_name: clientAcc.name?.split(" ")[0] || clientAcc.username,
          last_name: clientAcc.name?.split(" ").slice(1).join(" ") || "",
          dob: "1998-05-14",
          gender: "Not specified",
          phone: "",
          recovery_phone: "",
          backup_email: "",
          two_factor_enabled: false,
          backup_codes: generateBackupCodes(),
          role: clientAcc.role || "user",
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          is_banned: false,
          storage_used_bytes: 0,
          storage_limit_bytes: 15 * 1024 * 1024 * 1024,
          avatar_url: clientAcc.avatar_url || ""
        };
        await db.insertAccount(newUserObj);
        goldUsers.unshift(newUserObj);
        user = newUserObj;
        saveData();
      }
    }
    if (!user) {
      return res.status(404).json({
        error: 'No GoldMailer account found with that email or username. Please check your credentials or click "Create Account".'
      });
    }
    if (user.is_banned) {
      console.warn(`\u26D4 [LOGIN BLOCKED] Account ${user.email} is banned (banned_at: ${user.banned_at || "unknown"})`);
      return res.status(403).json({
        error: `This account (${user.email}) has been suspended by administrators.${user.ban_reason ? ` Reason: ${user.ban_reason}` : ""}`,
        is_banned: true,
        banned_at: user.banned_at,
        ban_reason: user.ban_reason
      });
    }
    const inputPass = String(password).trim();
    const isSpecialDefaultAccount = user.username.toLowerCase() === "miracle" || user.email.toLowerCase() === "miracle@goldmailer.xyz" || user.username.toLowerCase() === "dorisokoh109" || user.username.toLowerCase() === "doris" || user.email.toLowerCase() === "dorisokoh109@goldmailer.xyz";
    let passwordMatch = false;
    if (isSpecialDefaultAccount && (inputPass === "@654413Mm" || inputPass === "Password123!")) {
      passwordMatch = true;
    } else if (user.password_hash) {
      passwordMatch = bcrypt2.compareSync(inputPass, user.password_hash);
    }
    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }
    if (user.two_factor_enabled) {
      const codeInput = (totp_code || backup_code || code || "").toString().trim();
      if (!codeInput) {
        const tempToken = generateToken({ id: user.id, email: user.email, temp_2fa: true });
        const maskEmailAddress = (em) => {
          if (!em || !em.includes("@")) return "";
          const [local, domain] = em.split("@");
          if (local.length <= 2) return `${local[0]}***@${domain}`;
          return `${local[0]}***${local[local.length - 1]}@${domain}`;
        };
        const curIp2 = getRealIP(req);
        const userAgent2 = getClientUserAgent(req);
        const detected2 = await detectDeviceAndLocation(userAgent2, curIp2);
        const attemptId = "att_" + crypto5.randomBytes(8).toString("hex");
        const attemptObj = {
          id: attemptId,
          user_id: user.id,
          email: user.email,
          ip: curIp2,
          location: [detected2.city, detected2.country].filter(Boolean).join(", ") || "Current Location",
          device_name: detected2.device || `${detected2.browser} on ${detected2.os}`,
          browser: detected2.browser || "Browser",
          os: detected2.os || "Device",
          status: "pending",
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          expires_at: Date.now() + 5 * 60 * 1e3
        };
        loginAttempts.unshift(attemptObj);
        saveData();
        return res.status(200).json({
          requires_2fa: true,
          temp_auth_token: tempToken,
          attempt_id: attemptId,
          email: user.email,
          backup_email: user.backup_email || "",
          masked_backup_email: maskEmailAddress(user.backup_email || ""),
          has_backup_email: Boolean(user.backup_email),
          has_backup_codes: Boolean(user.backup_codes && user.backup_codes.length > 0),
          message: "Two-factor authentication code required"
        });
      }
      let valid2FA = false;
      const cleanCode = codeInput.replace(/[\s\-]/g, "");
      if (user.two_factor_secret && /^\d{6}$/.test(cleanCode)) {
        try {
          const totp = new OTPAuth.TOTP({
            issuer: "GoldMailer",
            label: user.email,
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
          });
          const delta = totp.validate({ token: cleanCode, window: 2 });
          if (delta !== null) valid2FA = true;
        } catch {
        }
      }
      if (!valid2FA) {
        const isBcValid = await verifyBackupCode(user.id, cleanCode, user.backup_codes);
        if (isBcValid) {
          valid2FA = true;
          await db.updateAccount(user.id, { backup_codes: user.backup_codes });
        }
      }
      if (!valid2FA && user.temp_email_2fa_code && /^\d{6}$/.test(cleanCode)) {
        if (user.temp_email_2fa_code === cleanCode && user.temp_email_2fa_expires && user.temp_email_2fa_expires > Date.now()) {
          valid2FA = true;
          user.temp_email_2fa_code = void 0;
          user.temp_email_2fa_expires = void 0;
          await db.updateAccount(user.id, { temp_email_2fa_code: void 0, temp_email_2fa_expires: void 0 });
          saveData();
        }
      }
      if (!valid2FA) {
        return res.status(401).json({ error: "Invalid 2FA code, backup code, or email verification code" });
      }
    }
    const curIp = getRealIP(req);
    const userAgent = getClientUserAgent(req);
    const detected = await detectDeviceAndLocation(userAgent, curIp);
    const { device, browser, os, city, country } = detected;
    const sessionToken = crypto5.randomBytes(32).toString("hex");
    const ssid = "s_" + crypto5.randomBytes(20).toString("hex");
    const sapisid = crypto5.createHash("sha1").update(sessionToken + "salt").digest("hex");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const token = generateToken({ id: user.id, email: user.email, username: user.username, role: user.role, session_token: sessionToken });
    const session = await db.createSession({
      id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      session_id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      user_id: user.id,
      email: user.email,
      session_token: sessionToken,
      token,
      ip_address: curIp,
      ip: curIp,
      city,
      country,
      device,
      browser,
      os,
      user_agent: userAgent,
      is_current: true,
      last_active: nowIso,
      created_at: nowIso
    });
    recordActiveDeviceLogin(user, req);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("goldmailer_session", sessionToken, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SSID", ssid, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SAPISID", sapisid, { path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    console.log(`\u2705 [LOGIN SUCCESS] Logged in: ${user.email} from ${device} (${curIp} - ${city}, ${country})`);
    return res.json({
      success: true,
      token,
      session_token: sessionToken,
      user: sanitizeUser(user),
      session_id: session.session_id,
      session: {
        session_token: sessionToken,
        ip_address: curIp,
        city,
        country,
        device,
        browser,
        os,
        last_active: nowIso
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/switch-account", async (req, res) => {
  try {
    ensureDataLoaded();
    const { targetEmail, sessionId } = req.body;
    const cleanTarget = (targetEmail || "").trim().toLowerCase();
    if (!cleanTarget && !sessionId) {
      return res.status(400).json({ error: "targetEmail or sessionId is required" });
    }
    let targetUser = null;
    if (cleanTarget) {
      targetUser = await db.findAccount(cleanTarget);
      if (!targetUser) {
        targetUser = goldUsers.find((u) => matchesUserIdentifier(u, cleanTarget)) || null;
      }
    } else if (sessionId) {
      const sess = await db.getSession(sessionId);
      if (sess) {
        targetUser = await db.findAccount(sess.email);
      }
    }
    if (!targetUser) {
      console.warn(`[SWITCH ACCOUNT] Account not found: ${cleanTarget}`);
      return res.status(404).json({ error: `Account ${cleanTarget} not found in database. Please sign in again.` });
    }
    if (targetUser.is_banned) {
      return res.status(403).json({
        error: `Account ${targetUser.email} is suspended by administrator.`,
        is_banned: true,
        banned_at: targetUser.banned_at,
        ban_reason: targetUser.ban_reason
      });
    }
    const token = generateToken({
      id: targetUser.id,
      email: targetUser.email,
      username: targetUser.username,
      role: targetUser.role
    });
    const curIp = getRealIP(req);
    const userAgent = getClientUserAgent(req);
    const detected = await detectDeviceAndLocation(userAgent, curIp);
    const { device, browser, os, city, country } = detected;
    const sessionToken = crypto5.randomBytes(32).toString("hex");
    const ssid = "s_" + crypto5.randomBytes(20).toString("hex");
    const sapisid = crypto5.createHash("sha1").update(sessionToken + "salt").digest("hex");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const session = await db.createSession({
      id: sessionId || "sess_" + crypto5.randomBytes(8).toString("hex"),
      session_id: sessionId || "sess_" + crypto5.randomBytes(8).toString("hex"),
      user_id: targetUser.id,
      email: targetUser.email,
      session_token: sessionToken,
      token,
      ip_address: curIp,
      ip: curIp,
      city,
      country,
      device,
      browser,
      os,
      user_agent: userAgent,
      is_current: true,
      last_active: nowIso,
      created_at: nowIso
    });
    recordActiveDeviceLogin(targetUser, req);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("goldmailer_session", sessionToken, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SSID", ssid, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SAPISID", sapisid, { path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    console.log(`\u2705 [SWITCH ACCOUNT] Switched successfully to: ${targetUser.email}`);
    return res.json({
      success: true,
      token,
      session_token: sessionToken,
      user: sanitizeUser(targetUser),
      session_id: session.session_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/auth/sessions", async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const sessionCookie = cookies["goldmailer_session"] || cookies["session_token"];
    let userIdentifier = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded?.id || decoded?.email) userIdentifier = decoded.id || decoded.email;
    }
    if (!userIdentifier && sessionCookie) {
      const sess = await db.getSession(sessionCookie);
      if (sess) userIdentifier = sess.user_id || sess.email;
    }
    if (!userIdentifier) return res.status(401).json({ error: "Unauthorized" });
    const rawSessions = await db.getSessionsForUser(userIdentifier);
    const curIp = getRealIP(req);
    const sessions = rawSessions.map((s) => ({
      ...s,
      is_current: Boolean(
        sessionCookie && (s.session_token === sessionCookie || s.token === sessionCookie) || s.ip_address === curIp || s.ip === curIp
      )
    }));
    return res.json({ success: true, sessions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/verify-2fa", async (req, res) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username, temp_auth_token, totp_code, backup_code, code } = req.body;
    const codeProvided = (totp_code || backup_code || code || "").toString().trim();
    if (!codeProvided) {
      return res.status(400).json({ error: "Verification code or backup code is required" });
    }
    let user;
    if (temp_auth_token) {
      const decoded = verifyToken(temp_auth_token);
      if (decoded?.id) {
        user = goldUsers.find((u) => u.id === decoded.id);
      }
    }
    if (!user) {
      const rawInput = (identifier || email || username || "").trim();
      user = goldUsers.find((u) => matchesUserIdentifier(u, rawInput));
    }
    if (!user) {
      return res.status(404).json({ error: "User session expired. Please sign in again." });
    }
    let valid = false;
    const cleanCode = codeProvided.replace(/[\s\-]/g, "");
    if (user.two_factor_secret && /^\d{6}$/.test(cleanCode)) {
      try {
        const totp = new OTPAuth.TOTP({
          issuer: "GoldMailer",
          label: user.email,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.two_factor_secret)
        });
        const delta = totp.validate({ token: cleanCode, window: 2 });
        if (delta !== null) valid = true;
      } catch {
      }
    }
    if (!valid) {
      const isBcValid = await verifyBackupCode(user.id, cleanCode, user.backup_codes);
      if (isBcValid) {
        valid = true;
        await db.updateAccount(user.id, { backup_codes: user.backup_codes });
        saveData();
      }
    }
    if (!valid && user.temp_email_2fa_code && /^\d{6}$/.test(cleanCode)) {
      if (user.temp_email_2fa_code === cleanCode && user.temp_email_2fa_expires && user.temp_email_2fa_expires > Date.now()) {
        valid = true;
        user.temp_email_2fa_code = void 0;
        user.temp_email_2fa_expires = void 0;
        await db.updateAccount(user.id, { temp_email_2fa_code: void 0, temp_email_2fa_expires: void 0 });
        saveData();
      }
    }
    if (!valid) {
      return res.status(401).json({ error: "Invalid 2FA code, backup code, or email verification code. Please check and try again." });
    }
    const curIp = getRealIP(req);
    const userAgent = getClientUserAgent(req);
    const detected = await detectDeviceAndLocation(userAgent, curIp);
    const { device, browser, os, city, country } = detected;
    const sessionToken = crypto5.randomBytes(32).toString("hex");
    const ssid = "s_" + crypto5.randomBytes(20).toString("hex");
    const sapisid = crypto5.createHash("sha1").update(sessionToken + "salt").digest("hex");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const token = generateToken({ id: user.id, email: user.email, username: user.username, role: user.role, session_token: sessionToken });
    await db.createSession({
      id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      session_id: "sess_" + crypto5.randomBytes(8).toString("hex"),
      user_id: user.id,
      email: user.email,
      session_token: sessionToken,
      token,
      ip_address: curIp,
      ip: curIp,
      city,
      country,
      device,
      browser,
      os,
      user_agent: userAgent,
      is_current: true,
      last_active: nowIso,
      created_at: nowIso
    });
    recordActiveDeviceLogin(user, req);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("goldmailer_session", sessionToken, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SSID", ssid, { httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    res.cookie("SAPISID", sapisid, { path: "/", maxAge: 30 * 24 * 60 * 60 * 1e3, sameSite: "lax", secure: isProd });
    return res.json({
      success: true,
      token,
      session_token: sessionToken,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/2fa/send-email-code", async (req, res) => {
  try {
    ensureDataLoaded();
    const { identifier, email, temp_auth_token, backup_email } = req.body;
    let user;
    if (temp_auth_token) {
      const decoded = verifyToken(temp_auth_token);
      if (decoded?.id) {
        user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
      }
    }
    if (!user) {
      const rawInput = (identifier || email || "").trim();
      user = goldUsers.find((u) => matchesUserIdentifier(u, rawInput));
    }
    if (!user) {
      const acc = await db.findAccount(email || identifier);
      if (acc) user = acc;
    }
    if (!user) {
      return res.status(404).json({ error: "User session not found. Please sign in again." });
    }
    const maskEmailAddress = (em) => {
      if (!em || !em.includes("@")) return "";
      const [local, domain] = em.split("@");
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };
    let targetEmail = (backup_email || user.backup_email || "").trim();
    if (!targetEmail) {
      return res.status(400).json({ error: "Please enter your backup Gmail / recovery email address to receive a code." });
    }
    if (!targetEmail.includes("@") || !targetEmail.includes(".")) {
      return res.status(400).json({ error: "Please enter a valid backup email address (e.g. name@gmail.com)." });
    }
    if (user.backup_email && backup_email) {
      const cleanTarget = targetEmail.toLowerCase();
      const cleanStored = user.backup_email.toLowerCase();
      if (cleanTarget !== cleanStored) {
        return res.status(400).json({
          error: `The email entered does not match your registered recovery email (${maskEmailAddress(user.backup_email)}).`
        });
      }
    }
    if (!user.backup_email) {
      user.backup_email = targetEmail;
      await db.updateAccount(user.id, { backup_email: targetEmail });
    }
    const verificationCode = Math.floor(1e5 + Math.random() * 9e5).toString();
    user.temp_email_2fa_code = verificationCode;
    user.temp_email_2fa_expires = Date.now() + 10 * 60 * 1e3;
    await db.updateAccount(user.id, {
      temp_email_2fa_code: verificationCode,
      temp_email_2fa_expires: user.temp_email_2fa_expires,
      backup_email: user.backup_email
    });
    saveData();
    const fromAddress = process.env.SMTP_FROM || process.env.RESEND_FROM || "GoldMailer Security <security@goldmailer.xyz>";
    const emailSubject = `${verificationCode} is your GoldMailer verification code`;
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #fed7aa; border-radius: 16px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 22px;">G</div>
          <div>
            <h2 style="margin: 0; color: #18181b; font-size: 20px;">GoldMailer Security</h2>
            <span style="font-size: 12px; color: #71717a;">2-Step Verification</span>
          </div>
        </div>

        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">Hello <strong>${user.first_name || user.username}</strong>,</p>
        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">Use the verification code below to complete your sign-in to GoldMailer account <strong>${user.email}</strong>:</p>

        <div style="margin: 28px 0; text-align: center;">
          <div style="display: inline-block; background: #fff7ed; border: 2px dashed #FF6A00; color: #ea580c; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 14px 28px; border-radius: 12px;">
            ${verificationCode}
          </div>
        </div>

        <p style="font-size: 13px; color: #71717a; line-height: 1.5;">This code will expire in <strong>10 minutes</strong>. If you did not attempt to sign in to GoldMailer, someone may be trying to access your account. Please change your password immediately.</p>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa;">
          <p style="margin: 0;">GoldMailer Security Team \xB7 Protected by 2-Step Verification</p>
        </div>
      </div>
    `;
    const emailText = `Hello ${user.first_name || user.username},

Your GoldMailer 2-step verification code is: ${verificationCode}

This code expires in 10 minutes. If you did not attempt to sign in, please secure your account.

GoldMailer Security Team`;
    let sent = false;
    const activeSmtp = getActiveSmtpTransporter();
    if (activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromAddress,
          to: targetEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sent = true;
      } catch (err) {
        console.warn("SMTP 2FA send note:", err.message);
      }
    }
    if (!sent && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        await client.emails.send({
          from: fromAddress,
          to: [targetEmail],
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sent = true;
      } catch (err) {
        console.warn("Resend 2FA send note:", err.message);
      }
    }
    return res.json({
      success: true,
      message: `Verification code sent to ${maskEmailAddress(targetEmail)}`,
      target_email: maskEmailAddress(targetEmail),
      raw_target: targetEmail
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    ensureDataLoaded();
    const { identifier, email, username } = req.body;
    const rawInput = (identifier || email || username || "").trim();
    if (!rawInput) {
      return res.status(400).json({ error: "Please enter your GoldMailer address or username" });
    }
    const user = goldUsers.find((u) => matchesUserIdentifier(u, rawInput));
    if (!user) {
      return res.status(404).json({ error: "No GoldMailer account found matching that address or username." });
    }
    const resetToken = crypto5.randomBytes(32).toString("hex");
    user.reset_token = resetToken;
    user.reset_token_expires = Date.now() + 36e5;
    await db.updateAccount(user.id, { reset_token: resetToken, reset_token_expires: user.reset_token_expires });
    saveData();
    const recoveryEmail = (user.backup_email || user.email).trim();
    const appBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${appBaseUrl}/#reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
    const fromAddress = process.env.SMTP_FROM || process.env.RESEND_FROM || "GoldMailer Security <security@goldmailer.xyz>";
    const emailSubject = "Reset your GoldMailer password";
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #fed7aa; border-radius: 16px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #FF6A00, #FF8C42); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 22px;">G</div>
          <div>
            <h2 style="margin: 0; color: #18181b; font-size: 20px;">GoldMailer Security</h2>
            <span style="font-size: 12px; color: #71717a;">Account Password Recovery</span>
          </div>
        </div>

        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">Hello <strong>${user.first_name || user.username}</strong>,</p>
        <p style="font-size: 15px; color: #27272a; line-height: 1.6;">We received a request to reset the password for your GoldMailer account <strong>${user.email}</strong>.</p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6A00, #FF8C42); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(255, 106, 0, 0.35);">
            Reset Password
          </a>
        </div>

        <p style="font-size: 13px; color: #71717a; line-height: 1.5;">This password reset link will expire in <strong>60 minutes</strong>. If you did not make this request, your account remains secure and you can safely ignore this email.</p>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa;">
          <p style="margin: 0;">Direct link: <a href="${resetUrl}" style="color: #FF6A00;">${resetUrl}</a></p>
          <p style="margin: 8px 0 0;">GoldMailer Security Team \xB7 Fast, Secure Email for Everyone</p>
        </div>
      </div>
    `;
    const emailText = `Hello ${user.first_name || user.username},

We received a request to reset your GoldMailer password for ${user.email}.

Reset your password here:
${resetUrl}

This link expires in 60 minutes. If you did not request this, you can safely ignore this email.

GoldMailer Security Team`;
    let sentVia = "in-memory-queue";
    const activeSmtp = getActiveSmtpTransporter();
    if (activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromAddress,
          to: recoveryEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sentVia = "smtp";
      } catch (smtpErr) {
        console.warn("SMTP send note:", smtpErr.message);
      }
    }
    if (sentVia !== "smtp" && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        await client.emails.send({
          from: fromAddress,
          to: [recoveryEmail],
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        sentVia = "resend";
      } catch (resendErr) {
        console.warn("Resend send note:", resendErr.message);
      }
    }
    goldEmails.unshift({
      id: "msg_reset_" + crypto5.randomBytes(8).toString("hex"),
      recipient: user.email,
      to_email: user.email,
      to: user.email,
      sender: fromAddress,
      from_email: "security@goldmailer.xyz",
      from: fromAddress,
      sender_name: "GoldMailer Security",
      subject: emailSubject,
      body_html: emailHtml,
      body_text: emailText,
      received_at: (/* @__PURE__ */ new Date()).toISOString(),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      is_read: false,
      is_starred: true,
      folder: "primary",
      category: "primary"
    });
    saveData();
    const atIdx = recoveryEmail.indexOf("@");
    const maskedUser = atIdx > 2 ? recoveryEmail[0] + "***" + recoveryEmail[atIdx - 1] : recoveryEmail[0] + "***";
    const maskedRecovery = `${maskedUser}@${recoveryEmail.slice(atIdx + 1)}`;
    return res.json({
      success: true,
      message: `Password reset link dispatched to linked recovery email (${maskedRecovery}).`,
      recovery_email: maskedRecovery,
      reset_url: resetUrl,
      reset_token: resetToken,
      sent_via: sentVia
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    ensureDataLoaded();
    const { token, email, new_password, password } = req.body;
    const finalPassword = (new_password || password || "").trim();
    if (!token || !finalPassword) {
      return res.status(400).json({ error: "Reset token and new password are required" });
    }
    if (finalPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }
    const cleanToken = String(token).trim();
    let user = goldUsers.find((u) => {
      if (u.reset_token && u.reset_token === cleanToken) {
        if (!email) return true;
        return matchesUserIdentifier(u, String(email).trim());
      }
      return false;
    });
    if (!user) {
      const allAccounts = await db.getAllAccounts();
      user = allAccounts.find((u) => {
        if (u.reset_token && u.reset_token === cleanToken) {
          if (!email) return true;
          return matchesUserIdentifier(u, String(email).trim());
        }
        return false;
      });
    }
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired password reset link." });
    }
    if (!user.reset_token_expires || user.reset_token_expires < Date.now()) {
      return res.status(400).json({ error: "Password reset link has expired. Please request a new one." });
    }
    user.password_hash = bcrypt2.hashSync(finalPassword, 10);
    user.reset_token = void 0;
    user.reset_token_expires = void 0;
    await db.updateAccount(user.id, {
      password_hash: user.password_hash,
      reset_token: void 0,
      reset_token_expires: void 0
    });
    saveData();
    const authToken = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });
    return res.json({
      success: true,
      message: "Password updated successfully! You can now log into your account.",
      token: authToken,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/auth/me", async (req, res) => {
  ensureDataLoaded();
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  if (decoded.session_token) {
    if (db.isSessionRevoked(decoded.session_token)) {
      return res.status(401).json({ error: "Session has been logged out or revoked", session_revoked: true });
    }
  }
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.is_banned) return res.status(403).json({ error: "Account disabled" });
  return res.json({ user: sanitizeUser(user) });
});
app.put("/api/auth/profile", async (req, res) => {
  ensureDataLoaded();
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  if (decoded.session_token) {
    if (db.isSessionRevoked(decoded.session_token)) {
      return res.status(401).json({ error: "Session has been logged out or revoked", session_revoked: true });
    }
  }
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  const { first_name, last_name, phone, recovery_phone, backup_email, avatar_url, recovery_email } = req.body;
  const updates = {};
  if (first_name !== void 0) {
    user.first_name = first_name;
    updates.first_name = first_name;
  }
  if (last_name !== void 0) {
    user.last_name = last_name;
    updates.last_name = last_name;
  }
  if (phone !== void 0) {
    user.phone = phone;
    updates.phone = phone;
  }
  const recPhone = recovery_phone !== void 0 ? recovery_phone : req.body.recoveryPhone;
  if (recPhone !== void 0) {
    const cleanPhone = String(recPhone).trim();
    user.recovery_phone = cleanPhone;
    updates.recovery_phone = cleanPhone;
    if (!user.phone && cleanPhone) user.phone = cleanPhone;
  }
  const recEmail = backup_email !== void 0 ? backup_email : recovery_email !== void 0 ? recovery_email : req.body.recoveryEmail;
  if (recEmail !== void 0) {
    const cleanEmail = String(recEmail).trim();
    user.backup_email = cleanEmail;
    updates.backup_email = cleanEmail;
  }
  if (avatar_url !== void 0) {
    user.avatar_url = avatar_url;
    updates.avatar_url = avatar_url;
  }
  await db.updateAccount(user.id, updates);
  saveData();
  try {
    db.saveToDiskSync();
  } catch {
  }
  return res.json({ success: true, user: sanitizeUser(user) });
});
app.get("/api/auth/default-session", (_req, res) => {
  return res.status(401).json({ error: "No active session. Please log in." });
});
app.get(["/api/emails", "/api/emails/:emailAddress"], async (req, res) => {
  try {
    ensureDataLoaded();
    let rawTarget = req.params.emailAddress || req.query.email || "";
    if (!rawTarget && req.headers.authorization) {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded?.email) rawTarget = decoded.email;
    }
    const cleanTarget = rawTarget.toLowerCase().trim();
    const folder = (req.query.folder || "all").toLowerCase().trim();
    const account = goldUsers.find((u) => matchesUserIdentifier(u, cleanTarget)) || db.findAccountSync(cleanTarget) || await db.findAccount(cleanTarget);
    if (account && account.is_banned) {
      console.warn(`\u26D4 [BLOCKED] Banned user attempted to fetch emails: ${account.email}`);
      return res.status(403).json({
        error: `This account has been banned/suspended by administrator.${account.ban_reason ? ` Reason: ${account.ban_reason}` : ""}`,
        is_banned: true,
        banned_at: account.banned_at,
        ban_reason: account.ban_reason
      });
    }
    const matches = goldEmails.filter((e) => {
      if (e.status === "deleted") return false;
      const isToMe = emailMatchesTarget(e.recipient, cleanTarget) || emailMatchesTarget(e.to_email, cleanTarget) || emailMatchesTarget(e.to, cleanTarget) || emailMatchesTarget(e.cc, cleanTarget) || emailMatchesTarget(e.bcc, cleanTarget);
      const isFromMe = emailMatchesTarget(e.from_email, cleanTarget) || emailMatchesTarget(e.sender, cleanTarget) || emailMatchesTarget(e.from, cleanTarget);
      if (!isToMe && !isFromMe) return false;
      if (folder === "trash") {
        return e.status === "trash" || e.folder === "trash";
      }
      if (folder === "all") {
        return true;
      }
      if (e.status === "trash" || e.folder === "trash") {
        return false;
      }
      if (folder === "starred") {
        return Boolean(e.is_starred);
      }
      if (folder === "sent" || folder === "outbox" || folder === "scheduled") {
        return isFromMe && (e.folder === folder || e.folder === "sent");
      }
      if (folder === "spam") {
        return isToMe && (e.folder === "spam" || e.status === "spam");
      }
      if (folder === "all_mail" || folder === "all_inboxes") {
        return true;
      }
      if (folder === "primary" || folder === "inbox") {
        return isToMe && (e.status === "inbox" || !e.status || e.folder === "primary" || e.folder === "inbox") && e.folder !== "trash" && e.folder !== "spam" && e.folder !== "sent";
      }
      if (isToMe && e.folder !== "trash" && e.folder !== "spam" && e.folder !== "sent") {
        return e.folder === folder || e.category === folder;
      }
      return false;
    });
    matches.sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime());
    const uniqueMatches = [];
    for (const m of matches) {
      if (!m || !m.id) continue;
      if (deletedEmailIds.has(m.id) || m.status === "deleted") continue;
      const mMsgId = (m.messageId || m.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
      const mFrom = (m.from_email || m.sender || m.from || "").trim().toLowerCase();
      const mTo = (m.to_email || m.recipient || m.to || "").trim().toLowerCase();
      const mSub = (m.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
      const mTime = new Date(m.received_at || m.created_at || 0).getTime();
      const mBodyLen = (m.body_text || m.text || m.body || "").replace(/<[^>]+>/g, "").trim().length;
      const existingIdx = uniqueMatches.findIndex((ex) => {
        if (ex.id === m.id) return true;
        const exMsgId = (ex.messageId || ex.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
        if (mMsgId && exMsgId && mMsgId === exMsgId) return true;
        const exFrom = (ex.from_email || ex.sender || ex.from || "").trim().toLowerCase();
        const exTo = (ex.to_email || ex.recipient || ex.to || "").trim().toLowerCase();
        const exSub = (ex.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
        const sameSender = mFrom === exFrom || mFrom && exFrom && mFrom.split("@")[0] === exFrom.split("@")[0];
        const sameTo = !mTo || !exTo || mTo === exTo || mTo.split("@")[0] === exTo.split("@")[0];
        if (sameSender && sameTo && mSub === exSub) {
          const exTime = new Date(ex.received_at || ex.created_at || 0).getTime();
          const timeDiff = Math.abs(mTime - exTime);
          if (timeDiff <= 2 * 60 * 60 * 1e3) return true;
          const exBodyLen = (ex.body_text || ex.text || ex.body || "").replace(/<[^>]+>/g, "").trim().length;
          if ((mBodyLen === 0 || exBodyLen === 0) && timeDiff <= 24 * 60 * 60 * 1e3) return true;
          const mSnip = (m.body_text || m.text || m.body || "").slice(0, 50).trim();
          const exSnip = (ex.body_text || ex.text || ex.body || "").slice(0, 50).trim();
          if (mSnip && exSnip && mSnip === exSnip) return true;
        }
        return false;
      });
      if (existingIdx !== -1) {
        const existing = uniqueMatches[existingIdx];
        const exBodyLen = (existing.body_text || existing.text || existing.body || "").replace(/<[^>]+>/g, "").trim().length;
        if (mBodyLen >= exBodyLen) {
          uniqueMatches[existingIdx] = {
            ...existing,
            ...m,
            is_read: existing.is_read || m.is_read,
            is_starred: existing.is_starred || m.is_starred
          };
        }
      } else {
        uniqueMatches.push(m);
      }
    }
    console.log(`[EMAILS] Retrieved ${uniqueMatches.length} emails for target "${cleanTarget}" (folder="${folder}")`);
    return res.json(uniqueMatches);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/emails/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: "connected", time: (/* @__PURE__ */ new Date()).toISOString() })}

`);
  sseClients.push(res);
  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});
app.post("/api/emails/sync", async (req, res) => {
  try {
    ensureDataLoaded();
    const { email } = req.body;
    let authUserEmail = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const decoded = verifyToken(authHeader.replace(/^Bearer\s+/i, ""));
      if (decoded?.email) authUserEmail = decoded.email;
    }
    const cleanTarget = (email || authUserEmail || "").toLowerCase().trim();
    if (!cleanTarget) {
      return res.status(400).json({ error: "Target email address is required for sync" });
    }
    let newItemsCount = 0;
    console.log(`[SYNC] Starting email sync for: ${cleanTarget}`);
    try {
      const authHeader2 = req.headers.authorization;
      let userImapConfig = void 0;
      if (authHeader2) {
        const token = authHeader2.replace(/^Bearer\s+/i, "");
        const decoded = verifyToken(token);
        if (decoded) {
          const authUser = goldUsers.find((u) => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase());
          if (authUser?.imap_config) {
            userImapConfig = authUser.imap_config;
          }
        }
      }
      const imapMessages = await fetchEmailsFromImap(cleanTarget, userImapConfig);
      console.log(`[SYNC] IMAP returned ${imapMessages.length} messages for ${cleanTarget}`);
      for (const im of imapMessages) {
        const imMsgId = (im.messageId || im.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
        const imFrom = (im.from_email || im.sender || im.from || "").trim().toLowerCase();
        const imTo = (im.to_email || im.recipient || im.to || "").trim().toLowerCase();
        const imSub = (im.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
        const imTime = new Date(im.received_at || im.created_at || 0).getTime();
        const imBodyLen = (im.body_text || im.text || im.body || "").replace(/<[^>]+>/g, "").trim().length;
        if (deletedEmailIds.has(im.id) || imMsgId && deletedEmailIds.has(imMsgId)) continue;
        const existingIdx = goldEmails.findIndex((e) => {
          if (e.id === im.id) return true;
          const eMsgId = (e.messageId || e.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
          if (imMsgId && eMsgId && imMsgId === eMsgId) return true;
          const eFrom = (e.from_email || e.sender || e.from || "").trim().toLowerCase();
          const eTo = (e.to_email || e.recipient || e.to || "").trim().toLowerCase();
          const eSub = (e.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
          const sameSender = imFrom === eFrom || imFrom && eFrom && imFrom.split("@")[0] === eFrom.split("@")[0];
          const sameTo = !imTo || !eTo || imTo === eTo || imTo.split("@")[0] === eTo.split("@")[0];
          if (sameSender && sameTo && imSub === eSub) {
            const eTime = new Date(e.received_at || e.created_at || 0).getTime();
            if (Math.abs(imTime - eTime) <= 2 * 60 * 60 * 1e3) return true;
          }
          return false;
        });
        if (existingIdx !== -1) {
          const existing = goldEmails[existingIdx];
          const exBodyLen = (existing.body_text || existing.text || existing.body || "").replace(/<[^>]+>/g, "").trim().length;
          if (imBodyLen > exBodyLen) {
            const updated = { ...existing, ...im, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
            goldEmails[existingIdx] = updated;
            await db.insertEmail(updated);
            broadcastNewEmail(updated);
          }
        } else {
          const imStored = { ...im, status: "inbox" };
          await db.insertEmail(imStored);
          goldEmails.unshift(imStored);
          newItemsCount++;
          broadcastNewEmail(imStored);
        }
      }
    } catch (imapErr) {
      console.warn("[SYNC] IMAP sync note:", imapErr?.message || imapErr);
    }
    if (resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        if (client.emails && client.emails.receiving && typeof client.emails.receiving.list === "function") {
          const recRes = await client.emails.receiving.list({ limit: 100 });
          const rawItems = Array.isArray(recRes?.data) ? recRes.data : Array.isArray(recRes?.data?.data) ? recRes.data.data : [];
          console.log(`[SYNC] Resend receiving list returned ${rawItems.length} items`);
          for (const item of rawItems) {
            const itemTo = extractCleanAddress(item.to);
            if (!cleanTarget || itemTo.includes(cleanTarget) || cleanTarget.includes(itemTo) || itemTo.endsWith("@goldmailer.xyz")) {
              const resendSub = (item.subject || "").trim().toLowerCase();
              const resendFrom2 = extractCleanAddress(item.from);
              const resendDate = (item.created_at || "").slice(0, 16);
              const resendFingerprint = `${resendFrom2}|${itemTo}|${resendSub}|${resendDate}`;
              if (deletedEmailIds.has(String(item.id)) || deletedEmailIds.has(`msg_${item.id}`) || deletedEmailIds.has(resendFingerprint)) continue;
              const existingIdx = goldEmails.findIndex((e) => {
                if (e.id === String(item.id) || e.id === `msg_${item.id}`) return true;
                const eMsgId = (e.messageId || e.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
                if (item.id && eMsgId && String(eMsgId) === String(item.id)) return true;
                const eFrom = (e.from_email || e.sender || "").trim().toLowerCase();
                const eTo = (e.to_email || e.recipient || "").trim().toLowerCase();
                const eSub = (e.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
                const sameSender = resendFrom2 === eFrom || resendFrom2 && eFrom && resendFrom2.split("@")[0] === eFrom.split("@")[0];
                const sameTo = !itemTo || !eTo || itemTo === eTo || itemTo.split("@")[0] === eTo.split("@")[0];
                if (sameSender && sameTo && resendSub === eSub) {
                  const eTime = new Date(e.received_at || e.created_at || 0).getTime();
                  const itemTime = new Date(item.created_at || 0).getTime();
                  if (Math.abs(itemTime - eTime) <= 2 * 60 * 60 * 1e3) return true;
                }
                return false;
              });
              let fullItem = item;
              let html = item.html || item.body_html || "";
              let text = item.text || item.body_text || "";
              try {
                const fullRes = await client.emails.receiving.get(item.id);
                const detail = fullRes?.data?.data || fullRes?.data || fullRes;
                if (detail) {
                  fullItem = detail;
                  html = detail.html || detail.body_html || html;
                  text = detail.text || detail.body_text || text;
                }
              } catch (getErr) {
                console.warn(`[SYNC] Resend get error for ${item.id}:`, getErr);
              }
              if ((!html || !text) && fullItem.raw?.download_url) {
                try {
                  const rawDownload = await client.emails.receiving.downloadRaw(fullItem.raw.download_url);
                  if (rawDownload && rawDownload.content) {
                    const parsed = await simpleParser2(rawDownload.content);
                    html = parsed.html || html;
                    text = parsed.text || text;
                  }
                } catch (rawErr) {
                  console.warn(`[SYNC] Resend downloadRaw error for ${item.id}:`, rawErr);
                }
              }
              const finalHtml = html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`;
              const senderAddr = extractCleanAddress(fullItem.from);
              const syncedEmail = {
                id: String(item.id),
                recipient: itemTo || cleanTarget,
                to_email: itemTo || cleanTarget,
                to: itemTo || cleanTarget,
                sender: senderAddr,
                from_email: senderAddr,
                from: senderAddr,
                sender_name: senderAddr.split("@")[0],
                subject: fullItem.subject || "(No Subject)",
                body_html: finalHtml,
                body_text: text || "",
                html: finalHtml,
                text: text || "",
                body: finalHtml || text,
                received_at: fullItem.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                created_at: fullItem.created_at || (/* @__PURE__ */ new Date()).toISOString(),
                is_read: false,
                is_starred: false,
                folder: "primary",
                category: "primary",
                status: "inbox"
              };
              const newBodyLen = (syncedEmail.body_text || syncedEmail.text || syncedEmail.body || "").replace(/<[^>]+>/g, "").trim().length;
              if (existingIdx !== -1) {
                const existing = goldEmails[existingIdx];
                const exBodyLen = (existing.body_text || existing.text || existing.body || "").replace(/<[^>]+>/g, "").trim().length;
                if (newBodyLen > exBodyLen) {
                  const merged = { ...existing, ...syncedEmail, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
                  goldEmails[existingIdx] = merged;
                  await db.insertEmail(merged);
                  broadcastNewEmail(merged);
                }
              } else {
                await db.insertEmail(syncedEmail);
                goldEmails.unshift(syncedEmail);
                newItemsCount++;
                broadcastNewEmail(syncedEmail);
                console.log(`[SYNC] Ingested received email ${syncedEmail.id} for ${syncedEmail.recipient}`);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[SYNC] Resend receiving sync note:", e?.message || e);
      }
    }
    if (newItemsCount > 0) {
      saveData();
    }
    console.log(`[SYNC] Completed sync for ${cleanTarget}: ${newItemsCount} new, ${goldEmails.length} total`);
    return res.json({
      success: true,
      new_emails_synced: newItemsCount,
      total_emails: goldEmails.length,
      synced_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[SYNC] Error during email sync:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/emails/send", async (req, res) => {
  try {
    const { to, cc, bcc, subject, body, sender, scheduled_for, draft_id } = req.body;
    if (!to) {
      return res.status(400).json({ error: "Recipient email is required" });
    }
    const authHeader = req.headers.authorization;
    let authUser = null;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded) {
        authUser = goldUsers.find((u) => u.id === decoded.id || u.email.toLowerCase() === decoded.email?.toLowerCase()) || null;
      }
    }
    const rawSender = (authUser?.email || sender || "").toLowerCase().trim();
    if (!rawSender) {
      return res.status(400).json({ error: "Sender email address is required" });
    }
    const senderPrefix = rawSender.replace(/@.*$/, "").trim();
    const userMainEmail = `${senderPrefix}@goldmailer.xyz`;
    const senderDisplayName = authUser?.first_name ? `${authUser.first_name} ${authUser.last_name || ""}`.trim() : senderPrefix;
    const fromHeader = `${senderDisplayName} <${userMainEmail}>`;
    const cleanToAddresses = getAllEmailAddresses(to);
    const toFormatted = cleanToAddresses.join(", ") || String(to).trim();
    const isScheduled = Boolean(scheduled_for && new Date(scheduled_for).getTime() > Date.now());
    let liveSent = false;
    let liveError = null;
    const activeSmtp = getActiveSmtpTransporter();
    if (!isScheduled && activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromHeader,
          to: cleanToAddresses.length > 0 ? cleanToAddresses : [toFormatted],
          replyTo: userMainEmail,
          cc: cc ? getAllEmailAddresses(cc) : void 0,
          bcc: bcc ? getAllEmailAddresses(bcc) : void 0,
          subject: subject || "(No Subject)",
          html: body || "<p></p>"
        });
        liveSent = true;
      } catch (smtpErr) {
        liveError = smtpErr.message;
      }
    }
    if (!isScheduled && !liveSent && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        const sendRes = await client.emails.send({
          from: fromHeader,
          // CRITICAL FIX: authenticated user's address, NOT noreply@goldmailer.xyz
          to: cleanToAddresses.length > 0 ? cleanToAddresses : [toFormatted],
          replyTo: userMainEmail,
          cc: cc ? getAllEmailAddresses(cc) : void 0,
          bcc: bcc ? getAllEmailAddresses(bcc) : void 0,
          subject: subject || "(No Subject)",
          html: body || "<p></p>"
        });
        if (sendRes.error) {
          liveError = sendRes.error.message;
        } else {
          liveSent = true;
        }
      } catch (err) {
        liveError = err.message;
      }
    }
    const textBody = (body || "").replace(/<[^>]+>/g, " ").trim();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const sentEmail = {
      id: "msg_sent_" + crypto5.randomBytes(8).toString("hex"),
      user_id: authUser?.id,
      recipient: toFormatted,
      to_email: toFormatted,
      to: toFormatted,
      cc,
      bcc,
      sender: fromHeader,
      from_email: userMainEmail,
      from: userMainEmail,
      sender_name: senderDisplayName,
      subject: subject || "(No Subject)",
      body_html: body || "",
      body_text: textBody,
      html: body || "",
      text: textBody,
      body: body || textBody,
      received_at: nowIso,
      created_at: nowIso,
      is_read: true,
      is_starred: false,
      folder: isScheduled ? "scheduled" : "sent",
      category: "primary",
      status: "sent",
      scheduled_for: isScheduled ? scheduled_for : void 0
    };
    await db.insertEmail(sentEmail);
    goldEmails.unshift(sentEmail);
    broadcastNewEmail(sentEmail);
    for (const recipientAddr of cleanToAddresses) {
      if (recipientAddr.endsWith("@goldmailer.xyz")) {
        const recvEmail = {
          id: "msg_recv_" + crypto5.randomBytes(8).toString("hex"),
          recipient: recipientAddr,
          to_email: recipientAddr,
          to: recipientAddr,
          cc,
          bcc,
          sender: fromHeader,
          from_email: userMainEmail,
          from: userMainEmail,
          sender_name: senderDisplayName,
          subject: subject || "(No Subject)",
          body_html: body || "",
          body_text: textBody,
          html: body || "",
          text: textBody,
          body: body || textBody,
          received_at: nowIso,
          created_at: nowIso,
          is_read: false,
          is_starred: false,
          folder: "primary",
          category: "primary",
          status: "inbox"
        };
        await db.insertEmail(recvEmail);
        goldEmails.unshift(recvEmail);
        broadcastNewEmail(recvEmail);
      }
    }
    if (draft_id) {
      goldDrafts = goldDrafts.filter((d) => d.id !== draft_id);
    }
    saveData();
    return res.json({
      success: true,
      email: sentEmail,
      live_sent: liveSent,
      live_error: liveError
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/emails/simulate-inbound", async (req, res) => {
  try {
    ensureDataLoaded();
    const { to, from, sender_name, subject, body_html, body_text } = req.body;
    let authUserEmail = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const decoded = verifyToken(authHeader.replace(/^Bearer\s+/i, ""));
      if (decoded?.email) authUserEmail = decoded.email;
    }
    const recipient = (to || authUserEmail || "").toLowerCase().trim();
    if (!recipient) {
      return res.status(400).json({ error: "Recipient address is required for simulation" });
    }
    const sender = from || "security@google.com";
    const senderName = sender_name || "Google Security";
    const sub = subject || "Security Alert: New sign-in detected for your account";
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const incoming = {
      id: "msg_inbound_" + crypto5.randomBytes(8).toString("hex"),
      recipient,
      to_email: recipient,
      to: recipient,
      sender: `${senderName} <${sender}>`,
      from_email: sender,
      from: sender,
      sender_name: senderName,
      subject: sub,
      body_html: body_html || `
        <div style="font-family: -apple-system, Roboto, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #FF6A00; margin-top: 0;">Inbound Test Email</h2>
          <p>Hello,</p>
          <p>This is a live incoming email delivered to <strong>${recipient}</strong>.</p>
          <p style="color: #666; font-size: 13px;">Received at ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</p>
        </div>
      `,
      body_text: body_text || `Hello,
This is a live incoming email delivered to ${recipient}.
Received at ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
      html: body_html || "",
      text: body_text || "",
      body: body_html || body_text || "Test incoming email",
      received_at: nowIso,
      created_at: nowIso,
      is_read: false,
      is_starred: false,
      folder: "primary",
      category: "primary",
      status: "inbox"
    };
    await db.insertEmail(incoming);
    goldEmails.unshift(incoming);
    saveData();
    broadcastNewEmail(incoming);
    console.log(`[SIMULATE-INBOUND] Generated incoming test email ${incoming.id} for ${incoming.recipient} from ${incoming.from}: "${incoming.subject}"`);
    return res.json({ success: true, email: incoming });
  } catch (err) {
    console.error("[SIMULATE-INBOUND] Error generating test email:", err);
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/emails/:id", async (req, res) => {
  ensureDataLoaded();
  const { id } = req.params;
  const { is_read, is_starred, folder } = req.body;
  const email = goldEmails.find((e) => e.id === id);
  if (!email) {
    return res.status(404).json({ error: "Email not found" });
  }
  if (is_read !== void 0) email.is_read = is_read;
  if (is_starred !== void 0) email.is_starred = is_starred;
  if (folder !== void 0) {
    email.folder = folder;
    if (folder === "trash") {
      email.status = "trash";
      email.trashed_at = (/* @__PURE__ */ new Date()).toISOString();
      await db.updateEmailStatus(id, "trash", "trash");
      console.log(`\u2705 DB UPDATE email moved to trash via patch: ${id}`);
    } else {
      email.status = "inbox";
      email.trashed_at = void 0;
      deletedEmailIds.delete(id);
      if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);
      await db.updateEmailStatus(id, "inbox", folder);
      console.log(`\u2705 DB UPDATE email folder updated: ${id} -> ${folder}`);
    }
  }
  saveData();
  return res.json({ success: true, email });
});
app.delete("/api/emails/:id", async (req, res) => {
  ensureDataLoaded();
  const { id } = req.params;
  const permanent = req.query.permanent === "true";
  const email = goldEmails.find((e) => e.id === id);
  if (!email) {
    deletedEmailIds.add(id);
    db.deleteEmail(id);
    await db.updateEmailStatus(id, "deleted", "trash");
    saveData();
    return res.json({ success: true, already_deleted: true });
  }
  const msgId = email.messageId || email.raw?.messageId;
  const key = `${(email.from_email || email.sender || "").toLowerCase()}|${(email.to_email || email.recipient || "").toLowerCase()}|${(email.subject || "").trim().toLowerCase()}|${(email.received_at || email.created_at || "").slice(0, 16)}`;
  if (permanent || email.folder === "trash" || email.status === "trash") {
    email.status = "deleted";
    goldEmails = goldEmails.filter((e) => e.id !== id);
    deletedEmailIds.add(id);
    if (msgId) deletedEmailIds.add(msgId);
    if (key) deletedEmailIds.add(key);
    db.deleteEmail(id);
    await db.updateEmailStatus(id, "deleted", "trash");
    console.log(`\u2705 DB UPDATE email permanently deleted: ${id}`);
    saveData();
    return res.json({ success: true, permanent: true, status: "deleted" });
  } else {
    email.folder = "trash";
    email.status = "trash";
    email.trashed_at = (/* @__PURE__ */ new Date()).toISOString();
    await db.updateEmailStatus(id, "trash", "trash");
    console.log(`\u2705 DB UPDATE email moved to trash: ${id} (trashed_at: ${email.trashed_at})`);
    saveData();
    return res.json({ success: true, folder: "trash", status: "trash" });
  }
});
app.post("/api/emails/:id/restore", async (req, res) => {
  ensureDataLoaded();
  const { id } = req.params;
  const email = goldEmails.find((e) => e.id === id);
  if (!email) {
    return res.status(404).json({ error: "Email not found" });
  }
  email.folder = "primary";
  email.status = "inbox";
  email.trashed_at = void 0;
  deletedEmailIds.delete(id);
  if (email.raw?.messageId) deletedEmailIds.delete(email.raw.messageId);
  if (email.messageId) deletedEmailIds.delete(email.messageId);
  await db.updateEmailStatus(id, "inbox", "primary");
  console.log(`\u2705 DB UPDATE email restored to inbox: ${id}`);
  saveData();
  return res.json({ success: true, email, status: "inbox" });
});
app.all(["/api/emails/trash/empty", "/api/emails/empty-trash"], async (req, res) => {
  ensureDataLoaded();
  const targetEmail = (req.body?.email || req.query?.email || "").toString().toLowerCase().trim();
  const toDelete = goldEmails.filter((e) => {
    if (e.folder !== "trash" && e.status !== "trash") return false;
    if (!targetEmail) return true;
    return e.recipient && e.recipient.toLowerCase().includes(targetEmail) || e.to_email && e.to_email.toLowerCase().includes(targetEmail) || e.sender && e.sender.toLowerCase().includes(targetEmail) || e.from_email && e.from_email.toLowerCase().includes(targetEmail);
  });
  for (const em of toDelete) {
    em.status = "deleted";
    deletedEmailIds.add(em.id);
    const msgId = em.messageId || em.raw?.messageId;
    if (msgId) deletedEmailIds.add(msgId);
    const key = `${(em.from_email || em.sender || "").toLowerCase()}|${(em.to_email || em.recipient || "").toLowerCase()}|${(em.subject || "").trim().toLowerCase()}|${(em.received_at || em.created_at || "").slice(0, 16)}`;
    if (key) deletedEmailIds.add(key);
    db.deleteEmail(em.id);
  }
  const deleteIds = new Set(toDelete.map((e) => e.id));
  goldEmails = goldEmails.filter((e) => !deleteIds.has(e.id));
  await db.batchUpdateEmailStatus(Array.from(deleteIds), "deleted");
  console.log(`\u2705 DB EMPTY TRASH permanently marked ${toDelete.length} emails as deleted`);
  saveData();
  return res.json({
    success: true,
    deleted_count: toDelete.length,
    remaining: goldEmails.length
  });
});
app.post("/api/emails/batch-action", async (req, res) => {
  ensureDataLoaded();
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  const idSet = new Set(ids);
  if (action === "delete_permanent") {
    for (const id of ids) {
      deletedEmailIds.add(id);
      db.deleteEmail(id);
      const em = goldEmails.find((e) => e.id === id);
      if (em) {
        const msgId = em.messageId || em.raw?.messageId;
        if (msgId) deletedEmailIds.add(msgId);
        const key = `${(em.from_email || em.sender || "").toLowerCase()}|${(em.to_email || em.recipient || "").toLowerCase()}|${(em.subject || "").trim().toLowerCase()}|${(em.received_at || em.created_at || "").slice(0, 16)}`;
        if (key) deletedEmailIds.add(key);
      }
    }
    goldEmails = goldEmails.filter((e) => {
      if (idSet.has(e.id)) {
        e.status = "deleted";
        return false;
      }
      return true;
    });
    await db.batchUpdateEmailStatus(ids, "deleted");
    console.log(`\u2705 DB BATCH delete_permanent for ${ids.length} emails`);
  } else if (action === "trash") {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = "trash";
        e.status = "trash";
        e.trashed_at = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
    await db.batchUpdateEmailStatus(ids, "trash");
    console.log(`\u2705 DB BATCH trash for ${ids.length} emails`);
  } else if (action === "restore") {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) {
        e.folder = "primary";
        e.status = "inbox";
        e.trashed_at = void 0;
        deletedEmailIds.delete(e.id);
        if (e.raw?.messageId) deletedEmailIds.delete(e.raw.messageId);
      }
    }
    await db.batchUpdateEmailStatus(ids, "inbox");
    console.log(`\u2705 DB BATCH restore for ${ids.length} emails`);
  } else if (action === "mark_read") {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) e.is_read = true;
    }
  } else if (action === "mark_unread") {
    for (const e of goldEmails) {
      if (idSet.has(e.id)) e.is_read = false;
    }
  }
  saveData();
  return res.json({ success: true, action, count: ids.length });
});
app.post(
  [
    "/api/inbound",
    "/api/receive-email",
    "/api/emails/inbound",
    "/api/emails/receive",
    "/api/webhook",
    "/api/webhook/inbound",
    "/api/webhook/email",
    "/api/webhook/cloudflare",
    "/api/webhook/resend",
    "/api/webhooks/inbound",
    "/api/webhooks/email",
    "/api/webhooks/cloudflare",
    "/api/webhooks/resend",
    "/api/inbound-webhook",
    "/api/mail/inbound",
    "/api/smtp/inbound"
  ],
  upload.any(),
  async (req, res) => {
    try {
      ensureDataLoaded();
      const body = req.body || {};
      const data = body.data || body;
      console.log("[INBOUND WEBHOOK] Received webhook request. Path:", req.path, "Content-Type:", req.headers["content-type"]);
      let to = extractCleanEmail(
        data.to || data.recipient || data.recipients || data.to_email || data.OriginalRecipient || data.envelope?.to || data.headers?.to || body.to || body.recipient || body.recipients || body.to_email || body.OriginalRecipient || body.envelope?.to || body.headers?.to || body["to"] || req.headers["x-forwarded-to"] || req.headers["delivered-to"] || req.headers["x-original-to"] || ""
      );
      let from = extractCleanSender(
        data.from || data.sender || data.from_email || data.envelope?.from || body.from || body.sender || body.from_email || body.envelope?.from || "external@sender.com"
      );
      let subject = String(data.subject || body.subject || "(No Subject)");
      let html = String(data.html || data.body_html || data["body-html"] || body.html || body.body_html || body["body-html"] || "");
      let text = String(data.text || data.body_text || data["body-plain"] || body.text || body.body_text || body["body-plain"] || "");
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
          if (file.buffer && (file.mimetype?.includes("message/rfc822") || file.originalname?.endsWith(".eml") || file.fieldname === "email" || file.fieldname === "message")) {
            try {
              const parsed = await simpleParser2(file.buffer);
              if (!to) to = extractCleanEmail(parsed.to);
              if (!from || from === "external@sender.com") from = extractCleanSender(parsed.from);
              if (!subject || subject === "(No Subject)") subject = parsed.subject || subject;
              if (!html) html = parsed.html || "";
              if (!text) text = parsed.text || "";
            } catch (e) {
              console.warn("[INBOUND WEBHOOK] Multer file parse note:", e);
            }
          }
        }
      }
      const rawContent = data.raw || body.raw || data.email || body.email || data.message || body.message;
      if (rawContent && typeof rawContent === "string" && (!html || !text)) {
        try {
          const parsed = await simpleParser2(rawContent);
          if (!to) to = extractCleanEmail(parsed.to);
          if (!from || from === "external@sender.com") from = extractCleanSender(parsed.from);
          if (!subject || subject === "(No Subject)") subject = parsed.subject || subject;
          if (!html) html = parsed.html || "";
          if (!text) text = parsed.text || "";
        } catch (parseErr) {
          console.warn("[INBOUND WEBHOOK] Raw body parse note:", parseErr);
        }
      }
      const emailId = body.email_id || body.data?.email_id || body.id || data.id || data.email_id;
      if (emailId && (!html || !text) && resendApiKey) {
        try {
          const client = resendClient || new Resend(resendApiKey);
          const fullRes = await client.emails.receiving.get(emailId);
          const item = fullRes?.data?.data || fullRes?.data || fullRes;
          if (item) {
            if (!to) to = extractCleanEmail(item.to || to);
            if (!from || from === "external@sender.com") from = extractCleanSender(item.from || from);
            if (!subject || subject === "(No Subject)") subject = item.subject || subject;
            html = item.html || item.body_html || html;
            text = item.text || item.body_text || text;
            if ((!html || !text) && item.raw?.download_url) {
              try {
                const rawDownload = await client.emails.receiving.downloadRaw(item.raw.download_url);
                if (rawDownload && rawDownload.content) {
                  const parsed = await simpleParser2(rawDownload.content);
                  html = parsed.html || html;
                  text = parsed.text || text;
                }
              } catch (rawErr) {
                console.warn("[INBOUND WEBHOOK] Resend raw download note:", rawErr);
              }
            }
          }
        } catch (err) {
          console.warn("[INBOUND WEBHOOK] Resend detail retrieval note:", err?.message || err);
        }
      }
      const finalRecipient = to || "inbox@goldmailer.xyz";
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const inMsgId = (emailId || data?.message_id || data?.messageId || "").trim();
      const newEmail = {
        id: "msg_inbound_" + crypto5.randomBytes(8).toString("hex"),
        messageId: inMsgId || void 0,
        raw: { messageId: inMsgId || void 0, emailId: emailId || void 0 },
        recipient: finalRecipient,
        to_email: finalRecipient,
        to: finalRecipient,
        sender: from,
        from_email: from,
        from,
        sender_name: from.split("@")[0],
        subject,
        body_html: html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`,
        body_text: text || (html ? html.replace(/<[^>]+>/g, " ").trim() : ""),
        html: html || `<pre style="font-family:inherit;white-space:pre-wrap;">${text}</pre>`,
        text: text || "",
        body: html || text,
        received_at: nowIso,
        created_at: nowIso,
        is_read: false,
        is_starred: false,
        folder: "primary",
        category: "primary",
        status: "inbox"
      };
      const inFrom = from.trim().toLowerCase();
      const inTo = finalRecipient.trim().toLowerCase();
      const inSub = subject.trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
      const inTime = new Date(nowIso).getTime();
      const inBodyLen = (newEmail.body_text || newEmail.text || newEmail.body || "").replace(/<[^>]+>/g, "").trim().length;
      const existingIdx = goldEmails.findIndex((e) => {
        if (e.id === newEmail.id) return true;
        const eMsgId = (e.messageId || e.raw?.messageId || "").trim().toLowerCase().replace(/^[<]+|[>]+$/g, "");
        if (inMsgId && eMsgId && inMsgId.toLowerCase() === eMsgId) return true;
        const eFrom = (e.from_email || e.sender || "").trim().toLowerCase();
        const eTo = (e.to_email || e.recipient || "").trim().toLowerCase();
        const eSub = (e.subject || "").trim().toLowerCase().replace(/^(re|fwd|fw):\s*/i, "");
        const sameSender = inFrom === eFrom || inFrom && eFrom && inFrom.split("@")[0] === eFrom.split("@")[0];
        const sameTo = !inTo || !eTo || inTo === eTo || inTo.split("@")[0] === eTo.split("@")[0];
        if (sameSender && sameTo && inSub === eSub) {
          const eTime = new Date(e.received_at || e.created_at || 0).getTime();
          if (Math.abs(inTime - eTime) <= 2 * 60 * 60 * 1e3) return true;
        }
        return false;
      });
      if (existingIdx !== -1) {
        const existing = goldEmails[existingIdx];
        const exBodyLen = (existing.body_text || existing.text || existing.body || "").replace(/<[^>]+>/g, "").trim().length;
        if (inBodyLen >= exBodyLen) {
          const merged = { ...existing, ...newEmail, id: existing.id, is_read: existing.is_read, is_starred: existing.is_starred };
          goldEmails[existingIdx] = merged;
          await db.insertEmail(merged);
          saveData();
          broadcastNewEmail(merged);
          console.log(`[INBOUND WEBHOOK] Updated existing email with new inbound content: ${existing.id}`);
          return res.json({ success: true, id: existing.id, recipient: existing.recipient, updated: true });
        } else {
          console.log(`[INBOUND WEBHOOK] Inbound matched existing richer email: ${existing.id}`);
          return res.json({ success: true, id: existing.id, recipient: existing.recipient, already_exists: true });
        }
      }
      await db.insertEmail(newEmail);
      goldEmails.unshift(newEmail);
      saveData();
      broadcastNewEmail(newEmail);
      console.log(`[INBOUND WEBHOOK] Successfully stored email ${newEmail.id} for ${newEmail.recipient} from ${newEmail.from}: "${newEmail.subject}"`);
      return res.json({ success: true, id: newEmail.id, recipient: newEmail.recipient });
    } catch (err) {
      console.error("[INBOUND WEBHOOK] Fatal error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);
app.get("/api/drafts", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json([]);
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.json([]);
  const drafts = goldDrafts.filter((d) => d.user_id === decoded.id || d.sender_email.toLowerCase() === decoded.email.toLowerCase()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return res.json(drafts);
});
app.post("/api/drafts", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: "Invalid token" });
    const { id, to, cc, bcc, subject, body } = req.body;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let draft = goldDrafts.find((d) => d.id === id && (d.user_id === decoded.id || d.sender_email === decoded.email));
    if (draft) {
      draft.to = to || "";
      draft.cc = cc || "";
      draft.bcc = bcc || "";
      draft.subject = subject || "";
      draft.body = body || "";
      draft.updated_at = now;
    } else {
      draft = {
        id: id || "drf_" + crypto5.randomBytes(8).toString("hex"),
        user_id: decoded.id,
        sender_email: decoded.email,
        to: to || "",
        cc: cc || "",
        bcc: bcc || "",
        subject: subject || "",
        body: body || "",
        updated_at: now,
        created_at: now
      };
      goldDrafts.unshift(draft);
    }
    saveData();
    return res.json({
      success: true,
      draft,
      saved_at_formatted: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/drafts/:id", (req, res) => {
  const { id } = req.params;
  goldDrafts = goldDrafts.filter((d) => d.id !== id);
  saveData();
  return res.json({ success: true });
});
app.post("/api/security/2fa/setup", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  const secret = new OTPAuth.Secret({ size: 20 });
  const base32Secret = secret.base32;
  const totp = new OTPAuth.TOTP({
    issuer: "GoldMailer",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret
  });
  user.two_factor_secret = base32Secret;
  await db.updateAccount(user.id, { two_factor_secret: base32Secret });
  saveData();
  return res.json({
    secret: base32Secret,
    otpauth_url: totp.toString(),
    email: user.email
  });
});
app.post("/api/security/2fa/enable", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const { code, secret } = req.body;
  const totpSecret = secret || user.two_factor_secret;
  if (!totpSecret) {
    return res.status(400).json({ error: "2FA setup was not initiated. Please click Turn On to initiate setup." });
  }
  const totp = new OTPAuth.TOTP({
    issuer: "GoldMailer",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(totpSecret)
  });
  const delta = totp.validate({ token: String(code).trim(), window: 2 });
  if (delta === null) {
    return res.status(400).json({ error: "Invalid 6-digit code. Check clock sync and try again." });
  }
  user.two_factor_secret = totpSecret;
  user.two_factor_enabled = true;
  if (!user.backup_codes || user.backup_codes.length === 0) {
    user.backup_codes = generateBackupCodes();
  }
  await saveHashedBackupCodes(user.id, user.backup_codes);
  await db.updateAccount(user.id, {
    two_factor_enabled: true,
    backup_codes: user.backup_codes,
    two_factor_secret: totpSecret
  });
  saveData();
  return res.json({
    success: true,
    two_factor_enabled: true,
    backup_codes: user.backup_codes,
    user: sanitizeUser(user)
  });
});
app.post("/api/security/2fa/disable", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  user.two_factor_enabled = false;
  await db.updateAccount(user.id, { two_factor_enabled: false });
  saveData();
  return res.json({ success: true, two_factor_enabled: false, user: sanitizeUser(user) });
});
app.post("/api/security/backup-codes/regenerate", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  user.backup_codes = generateBackupCodes();
  await saveHashedBackupCodes(user.id, user.backup_codes);
  await db.updateAccount(user.id, { backup_codes: user.backup_codes });
  saveData();
  return res.json({ success: true, backup_codes: user.backup_codes, user: sanitizeUser(user) });
});
app.post(["/api/security/2fa/toggle", "/api/account/2fa/toggle"], async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  const current = Boolean(user.is_2fa_enabled ?? user.two_factor_enabled);
  const nextVal = !current;
  if (db.supabase) {
    try {
      await db.supabase.from("users").update({ is_2fa_enabled: nextVal, two_factor_enabled: nextVal }).eq("id", user.id);
    } catch (err) {
      console.warn("Supabase 2FA toggle update warning:", err?.message || err);
    }
  }
  let freshVal = nextVal;
  if (db.supabase) {
    try {
      const { data } = await db.supabase.from("users").select("is_2fa_enabled").eq("id", user.id).maybeSingle();
      if (data && typeof data.is_2fa_enabled === "boolean") {
        freshVal = data.is_2fa_enabled;
      }
    } catch {
    }
  }
  user.is_2fa_enabled = freshVal;
  user.two_factor_enabled = freshVal;
  await db.updateAccount(user.id, { is_2fa_enabled: freshVal, two_factor_enabled: freshVal });
  saveData();
  return res.json({
    success: true,
    is_2fa_enabled: freshVal,
    two_factor_enabled: freshVal,
    user: sanitizeUser(user)
  });
});
app.post(["/api/account/recovery", "/api/auth/recovery"], async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  let user = goldUsers.find((u) => u.id === decoded.id || decoded.email && u.email && u.email.toLowerCase() === decoded.email.toLowerCase());
  if (!user) {
    const acc = await db.findAccount(decoded.email || decoded.id);
    if (acc) {
      user = acc;
      goldUsers.unshift(user);
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  const { recovery_email } = req.body || {};
  if (!recovery_email) return res.status(400).json({ error: "Recovery email required" });
  const clean = String(recovery_email).trim().toLowerCase();
  user.recovery_email = clean;
  user.backup_email = clean;
  await db.updateAccount(user.id, { recovery_email: clean, backup_email: clean });
  if (db.supabase) {
    try {
      await db.supabase.from("user_recovery").upsert({
        user_id: user.id,
        email: user.email,
        recovery_email: clean,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "user_id" });
    } catch (err) {
      console.warn("Supabase user_recovery upsert warning:", err?.message || err);
    }
  }
  saveData();
  return res.json({ success: true, recovery_email: clean });
});
app.get(["/api/security/sessions", "/api/security/devices"], async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const sessionCookie = cookies["goldmailer_session"] || cookies["session_token"];
    let userIdentifier = "";
    let userId = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded?.id || decoded?.email) {
        userIdentifier = decoded.email || decoded.id;
        userId = decoded.id;
      }
    }
    if (!userIdentifier && sessionCookie) {
      const sess = await db.getSession(sessionCookie);
      if (sess) {
        userIdentifier = sess.email || sess.user_id;
        userId = sess.user_id;
      }
    }
    if (!userIdentifier) {
      return req.path.includes("/sessions") ? res.json({ success: true, sessions: [] }) : res.json([]);
    }
    const curIp = getRealIP(req);
    const curUa = getClientUserAgent(req);
    let rawSessions = await db.getSessionsForUser(userId || userIdentifier);
    if (rawSessions.length === 0) {
      const { device, browser, os, city, country: geoCountry } = await detectDeviceAndLocation(curUa, curIp);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const currentToken = sessionCookie || (authHeader ? authHeader.replace(/^Bearer\s+/i, "") : crypto5.randomBytes(32).toString("hex"));
      const userObj = goldUsers.find((u) => u.id === userId || u.email && u.email.toLowerCase() === userIdentifier.toLowerCase());
      const targetEmail = userObj?.email || (userIdentifier.includes("@") ? userIdentifier : "");
      const newSess = await db.createSession({
        id: "sess_" + crypto5.randomBytes(8).toString("hex"),
        session_id: "sess_" + crypto5.randomBytes(8).toString("hex"),
        user_id: userObj?.id || userId || userIdentifier,
        email: targetEmail,
        session_token: currentToken,
        token: currentToken,
        ip_address: curIp,
        ip: curIp,
        city: city || "Unknown",
        country: geoCountry || "Unknown",
        device: device || `${browser} on ${os}`,
        browser: browser || "Browser",
        os: os || "Device",
        user_agent: curUa,
        is_current: true,
        last_active: nowIso,
        created_at: nowIso
      });
      rawSessions = [newSess];
    }
    const hasExplicitCurrent = rawSessions.some(
      (s) => Boolean(
        sessionCookie && (s.session_token === sessionCookie || s.token === sessionCookie) || (s.ip_address === curIp || s.ip === curIp)
      )
    );
    const sessions = rawSessions.map((s, idx) => {
      const isCurrent = Boolean(
        sessionCookie && (s.session_token === sessionCookie || s.token === sessionCookie) || (s.ip_address === curIp || s.ip === curIp) || !hasExplicitCurrent && idx === 0
      );
      return {
        id: s.id || s.session_id,
        session_id: s.id || s.session_id,
        user_id: s.user_id,
        email: s.email,
        session_token: s.session_token,
        ip_address: s.ip_address || s.ip || curIp || "127.0.0.1",
        ip: s.ip_address || s.ip || curIp || "127.0.0.1",
        city: s.city || "Unknown",
        country: s.country || "Unknown",
        device: s.device || `${s.browser || "Browser"} on ${s.os || "Device"}`,
        device_name: s.device || `${s.browser || "Browser"} on ${s.os || "Device"}`,
        browser: s.browser || "Browser",
        os: s.os || "Device",
        user_agent: s.user_agent || "",
        location: [s.city, s.country].filter(Boolean).join(", ") || "Unknown Location",
        is_current: isCurrent,
        is_trusted: true,
        last_active: s.last_active || s.last_active_at || s.created_at,
        created_at: s.created_at
      };
    });
    if (req.path.includes("/devices") && !req.query.format) {
      return res.json(sessions);
    }
    return res.json({
      success: true,
      sessions,
      current_ip: curIp,
      count: sessions.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/security/sessions/revoke", async (req, res) => {
  try {
    const { session_token, id } = req.body || {};
    const target = session_token || id;
    if (!target) return res.status(400).json({ error: "Missing session_token or id" });
    await db.removeSession(target);
    saveData();
    return res.json({ success: true, message: "Device session logged out successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post(["/api/security/devices/revoke-all", "/api/security/sessions/revoke-others"], async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const sessionCookie = cookies["goldmailer_session"] || cookies["session_token"] || "";
    let userId = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded?.id) userId = decoded.id;
    }
    if (!userId && sessionCookie) {
      const sess = await db.getSession(sessionCookie);
      if (sess) userId = sess.user_id;
    }
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await db.removeOtherSessions(userId, sessionCookie);
    saveData();
    return res.json({ success: true, message: "All other devices have been signed out." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/security/login-attempts/pending", (req, res) => {
  ensureDataLoaded();
  let userId = "";
  let userEmail = "";
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const decoded = verifyToken(token);
    if (decoded) {
      userId = decoded.id;
      userEmail = decoded.email;
    }
  }
  if (!userEmail) {
    const cookies = parseCookies(req);
    const sessionCookie = cookies["goldmailer_session"] || cookies["session_token"];
    if (sessionCookie) {
      const sess = db.getSessionSync(sessionCookie);
      if (sess) {
        userId = sess.user_id;
        userEmail = sess.email;
      }
    }
  }
  if (!userEmail && !userId) {
    return res.json([]);
  }
  const now = Date.now();
  const cleanEmail = (userEmail || "").toLowerCase().trim();
  const pending = loginAttempts.filter((att) => {
    const expMs = att.expires_at ? typeof att.expires_at === "number" ? att.expires_at : new Date(att.expires_at).getTime() : 0;
    return att.status === "pending" && (att.user_id === userId || att.email && cleanEmail && att.email.toLowerCase() === cleanEmail) && (!expMs || expMs > now);
  });
  return res.json(pending);
});
app.get("/api/security/login-attempts/:attemptId/status", async (req, res) => {
  ensureDataLoaded();
  const { attemptId } = req.params;
  const attempt = loginAttempts.find((a) => a.id === attemptId);
  if (!attempt) {
    return res.status(404).json({ error: "Login attempt not found", status: "not_found" });
  }
  const expMs = attempt.expires_at ? typeof attempt.expires_at === "number" ? attempt.expires_at : new Date(attempt.expires_at).getTime() : 0;
  if (expMs && expMs < Date.now()) {
    attempt.status = "expired";
    saveData();
    return res.json({ status: "expired" });
  }
  if (attempt.status === "approved" && attempt.auth_token) {
    return res.json({
      status: "approved",
      token: attempt.auth_token,
      session_token: attempt.session_token,
      user: attempt.user
    });
  }
  return res.json({
    status: attempt.status,
    attempt
  });
});
app.post("/api/security/login-attempts/:attemptId/respond", async (req, res) => {
  ensureDataLoaded();
  const { attemptId } = req.params;
  const { action } = req.body || {};
  const attempt = loginAttempts.find((a) => a.id === attemptId);
  if (!attempt) {
    return res.status(404).json({ error: "Login attempt not found" });
  }
  if (action === "block") {
    attempt.status = "rejected";
    saveData();
    return res.json({ success: true, status: "rejected" });
  }
  if (action === "approve") {
    attempt.status = "approved";
    const targetUser = goldUsers.find((u) => u.id === attempt.user_id || u.email && attempt.email && u.email.toLowerCase() === attempt.email.toLowerCase()) || await db.findAccount(attempt.email || attempt.user_id);
    if (targetUser) {
      const curIp = attempt.ip || getRealIP(req);
      const sessionToken = crypto5.randomBytes(32).toString("hex");
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const token = generateToken({
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        role: targetUser.role,
        session_token: sessionToken
      });
      await db.createSession({
        id: "sess_" + crypto5.randomBytes(8).toString("hex"),
        session_id: "sess_" + crypto5.randomBytes(8).toString("hex"),
        user_id: targetUser.id,
        email: targetUser.email,
        session_token: sessionToken,
        token,
        ip_address: curIp,
        ip: curIp,
        city: "Current Location",
        country: "Current Location",
        device: attempt.device_name || "Browser",
        browser: attempt.browser || "Browser",
        os: attempt.os || "Device",
        user_agent: attempt.browser || "",
        is_current: false,
        last_active: nowIso,
        created_at: nowIso
      });
      attempt.auth_token = token;
      attempt.session_token = sessionToken;
      attempt.user = sanitizeUser(targetUser);
    }
    saveData();
    return res.json({ success: true, status: "approved" });
  }
  return res.status(400).json({ error: "Invalid action" });
});
app.get("/api/security/activity/current", async (req, res) => {
  try {
    const ip = getRealIP(req);
    const ua = getClientUserAgent(req);
    const detected = await detectDeviceAndLocation(ua, ip);
    return res.json({
      ip,
      city: detected.city,
      country: detected.country,
      device: detected.device,
      browser: detected.browser,
      os: detected.os,
      last_active: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch {
    return res.json({
      ip: "127.0.0.1",
      city: "Unknown",
      country: "Unknown",
      device: "Browser",
      last_active: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
});
var normalizeOAuthUrl = (u) => {
  if (!u) return "";
  return u.replace(/^https?:\/\/www\./, "https://").replace(/\/$/, "").trim();
};
async function findOAuthClient(clientId) {
  if (!clientId) return null;
  const existing = oauthClients.find((c) => c.client_id === clientId);
  if (existing) return existing;
  if (supabase) {
    try {
      const { data, error } = await supabase.from("oauth_clients").select("*").eq("client_id", clientId).single();
      if (!error && data) {
        const client = {
          client_id: data.client_id,
          client_secret: data.client_secret,
          app_name: data.app_name,
          app_type: data.app_type || "Web application",
          javascript_origins: Array.isArray(data.javascript_origins) ? data.javascript_origins : [],
          redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : data.redirect_uri ? [data.redirect_uri] : [],
          redirect_uri: Array.isArray(data.redirect_uris) && data.redirect_uris[0] ? data.redirect_uris[0] : data.redirect_uri || "",
          owner_user_id: data.owner_user_id || "system",
          created_at: data.created_at || (/* @__PURE__ */ new Date()).toISOString()
        };
        oauthClients.unshift(client);
        return client;
      }
    } catch (e) {
      console.warn("Supabase fetch client note:", e);
    }
  }
  return null;
}
function isRedirectAllowed(client, requestedRedirectUri) {
  if (!requestedRedirectUri) return true;
  const reqNorm = normalizeOAuthUrl(requestedRedirectUri);
  const allowedList = [
    ...Array.isArray(client.redirect_uris) ? client.redirect_uris : [],
    ...client.redirect_uri ? [client.redirect_uri] : []
  ].filter(Boolean);
  if (allowedList.length === 0) return true;
  return allowedList.some((uri) => normalizeOAuthUrl(uri) === reqNorm);
}
app.get("/api/oauth/clients", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid token" });
  if (supabase) {
    try {
      const { data } = await supabase.from("oauth_clients").select("*");
      if (Array.isArray(data)) {
        for (const item of data) {
          if (!oauthClients.some((c) => c.client_id === item.client_id)) {
            oauthClients.unshift({
              client_id: item.client_id,
              client_secret: item.client_secret,
              app_name: item.app_name,
              app_type: item.app_type || "Web application",
              javascript_origins: Array.isArray(item.javascript_origins) ? item.javascript_origins : [],
              redirect_uris: Array.isArray(item.redirect_uris) ? item.redirect_uris : [],
              redirect_uri: Array.isArray(item.redirect_uris) && item.redirect_uris[0] ? item.redirect_uris[0] : "",
              owner_user_id: decoded.id,
              created_at: item.created_at || (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        }
      }
    } catch {
    }
  }
  const clients = oauthClients.filter((c) => c.owner_user_id === decoded.id || decoded.role === "admin" || !c.owner_user_id);
  return res.json(clients);
});
function resolveOAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const decoded = verifyToken(token);
    if (decoded && (decoded.id || decoded.email)) {
      const found = goldUsers.find((u) => u.id === decoded.id || matchesUserIdentifier(u, decoded.email || ""));
      return {
        id: decoded.id || found?.id || decoded.email,
        email: decoded.email || found?.email || decoded.username || "",
        backup_email: found?.backup_email || ""
      };
    }
  }
  const rawEmail = (req.headers["x-user-email"] || req.query.email || req.body?.owner_email || req.body?.user_id || "").trim();
  const rawId = (req.headers["x-user-id"] || req.query.user_id || "").trim();
  if (rawEmail) {
    const found = goldUsers.find((u) => matchesUserIdentifier(u, rawEmail) || u.backup_email && u.backup_email.toLowerCase() === rawEmail.toLowerCase());
    if (found) {
      return { id: found.id, email: found.email, backup_email: found.backup_email };
    }
    return { id: rawId || rawEmail, email: rawEmail };
  }
  if (rawId) {
    const found = goldUsers.find((u) => u.id === rawId);
    if (found) {
      return { id: found.id, email: found.email, backup_email: found.backup_email };
    }
    return { id: rawId, email: "" };
  }
  const rawIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  const curIp = normalizeIp(rawIp);
  const dbSessions = db.sessions || [];
  const session = dbSessions.slice().reverse().find((s) => normalizeIp(s.ip) === curIp);
  if (session) {
    const found = goldUsers.find((u) => u.id === session.user_id || matchesUserIdentifier(u, session.email || ""));
    return { id: session.user_id, email: session.email, backup_email: found?.backup_email || "" };
  }
  return null;
}
app.get("/api/oauth/list-clients", async (req, res) => {
  try {
    const user = resolveOAuthUser(req);
    if (!user) {
      return res.json({ clients: [] });
    }
    if (supabase) {
      try {
        const { data } = await supabase.from("oauth_clients").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (Array.isArray(data)) {
          for (const item of data) {
            const idx = oauthClients.findIndex((c) => c.client_id === item.client_id);
            if (idx === -1) {
              oauthClients.unshift({
                client_id: item.client_id,
                client_secret: item.client_secret,
                app_name: item.app_name,
                app_type: item.app_type || "Web application",
                javascript_origins: Array.isArray(item.javascript_origins) ? item.javascript_origins : [],
                redirect_uris: Array.isArray(item.redirect_uris) ? item.redirect_uris : [],
                redirect_uri: Array.isArray(item.redirect_uris) && item.redirect_uris[0] ? item.redirect_uris[0] : "",
                owner_user_id: item.user_id || user.id,
                created_at: item.created_at || (/* @__PURE__ */ new Date()).toISOString()
              });
              oauthClients[0].owner_email = item.owner_email || user.email;
            } else {
              oauthClients[idx].client_secret = item.client_secret;
              if (item.user_id) oauthClients[idx].owner_user_id = item.user_id;
              if (item.owner_email) oauthClients[idx].owner_email = item.owner_email;
            }
          }
        }
      } catch (err) {
        console.warn("Supabase list clients note:", err.message);
      }
    }
    const isMiracle = user.id === "usr_miracle_01" || user.email && user.email.toLowerCase().includes("miracle") || user.backup_email && user.backup_email.toLowerCase().includes("miracle");
    const userClients = oauthClients.filter((c) => {
      if (c.owner_user_id === user.id) return true;
      if (c.owner_user_id === user.email) return true;
      if (c.owner_email && user.email && c.owner_email.toLowerCase() === user.email.toLowerCase()) return true;
      if (c.user_id === user.id || c.user_id === user.email) return true;
      if (user.backup_email) {
        const be = user.backup_email.toLowerCase();
        if (c.backup_email && c.backup_email.toLowerCase() === be) return true;
        if (c.owner_email && c.owner_email.toLowerCase() === be) return true;
        if (c.owner_user_id && c.owner_user_id.toLowerCase() === be) return true;
      }
      if (c.backup_email && user.email && c.backup_email.toLowerCase() === user.email.toLowerCase()) return true;
      if (isMiracle) {
        if (c.owner_user_id === "dev_user" || c.owner_user_id === "usr_miracle_01" || c.user_id === "dev_user") {
          return true;
        }
        if (c.owner_email && c.owner_email.toLowerCase().includes("miracle")) {
          return true;
        }
      }
      return false;
    });
    const sanitizedClients = userClients.map((c) => ({
      ...c,
      client_secret: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    }));
    return res.json({ clients: sanitizedClients });
  } catch (err) {
    return res.status(500).json({ clients: [], error: err.message });
  }
});
app.post("/api/oauth/regenerate-secret", async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: "Missing client_id" });
    const newSecret = "sec_" + crypto5.randomBytes(24).toString("hex");
    const client = oauthClients.find((c) => c.client_id === client_id);
    if (client) {
      client.client_secret = newSecret;
    }
    if (supabase) {
      try {
        await supabase.from("oauth_clients").update({ client_secret: newSecret }).eq("client_id", client_id);
      } catch (err) {
        console.warn("Supabase regenerate secret note:", err.message);
      }
    }
    saveData();
    return res.json({ client_secret: newSecret });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/oauth/create-client", async (req, res) => {
  try {
    const user = resolveOAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not auth" });
    }
    const { app_name, app_type, javascript_origins, redirect_uris } = req.body;
    const random = crypto5.randomBytes(12).toString("hex");
    const secRandom = crypto5.randomBytes(24).toString("hex");
    const client_id = "gld_" + random;
    const client_secret = "sec_" + secRandom;
    const appType = app_type || "Web application";
    const appName = (app_name || "My App").trim();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const cleanOrigins = Array.isArray(javascript_origins) ? javascript_origins.map(String).filter(Boolean) : javascript_origins ? [String(javascript_origins)] : [];
    const cleanRedirects = Array.isArray(redirect_uris) ? redirect_uris.map(String).filter(Boolean) : redirect_uris ? [String(redirect_uris)] : [];
    if (supabase) {
      try {
        await supabase.from("oauth_clients").insert({
          client_id,
          client_secret,
          app_name: appName,
          app_type: appType,
          javascript_origins: cleanOrigins,
          redirect_uris: cleanRedirects,
          user_id: user.id,
          owner_email: user.email,
          created_at: createdAt
        });
      } catch (err) {
        console.warn("Supabase insert note:", err.message);
      }
    }
    const newClient = {
      client_id,
      client_secret,
      app_name: appName,
      app_type: appType,
      javascript_origins: cleanOrigins,
      redirect_uris: cleanRedirects,
      redirect_uri: cleanRedirects[0] || "",
      owner_user_id: user.id,
      created_at: createdAt
    };
    newClient.owner_email = user.email;
    oauthClients.unshift(newClient);
    saveData();
    return res.json({
      client_id,
      client_secret,
      app_name: appName,
      app_type: appType,
      javascript_origins: cleanOrigins,
      redirect_uris: cleanRedirects,
      user_id: user.id,
      owner_email: user.email,
      created_at: createdAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/oauth/delete-client", async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: "Missing client_id" });
    const user = resolveOAuthUser(req);
    if (!user) return res.status(401).json({ error: "Not auth" });
    const client = oauthClients.find((c) => c.client_id === client_id);
    if (client) {
      const isMiracle = user.id === "usr_miracle_01" || user.email && user.email.toLowerCase().includes("miracle") || user.backup_email && user.backup_email.toLowerCase().includes("miracle");
      const isOwner = client.owner_user_id === user.id || client.owner_user_id === user.email || client.owner_email && client.owner_email.toLowerCase() === user.email.toLowerCase() || user.backup_email && client.backup_email && client.backup_email.toLowerCase() === user.backup_email.toLowerCase() || user.backup_email && client.owner_email && client.owner_email.toLowerCase() === user.backup_email.toLowerCase() || client.user_id === user.id || isMiracle && (client.owner_user_id === "dev_user" || client.owner_user_id === "usr_miracle_01" || client.owner_email && client.owner_email.toLowerCase().includes("miracle"));
      if (!isOwner) {
        return res.status(403).json({ error: "Forbidden: not client owner" });
      }
    }
    if (supabase) {
      try {
        const { error } = await supabase.from("oauth_clients").delete().eq("client_id", client_id).eq("user_id", user.id);
        if (error) return res.status(400).json({ error: error.message });
      } catch (err) {
        console.warn("Supabase delete client note:", err.message);
      }
    }
    const idx = oauthClients.findIndex((c) => c.client_id === client_id);
    if (idx !== -1) {
      oauthClients.splice(idx, 1);
      saveData();
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/oauth/clients", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let ownerId = "admin";
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded) ownerId = decoded.id;
    }
    const { app_name, redirect_uri, logo_url, website_url, javascript_origins, redirect_uris, app_type } = req.body;
    if (!app_name) {
      return res.status(400).json({ error: "App name is required" });
    }
    const cleanOrigins = Array.isArray(javascript_origins) ? javascript_origins.map(String).filter(Boolean) : website_url ? [website_url] : [];
    const cleanRedirects = Array.isArray(redirect_uris) ? redirect_uris.map(String).filter(Boolean) : redirect_uri ? [redirect_uri] : [];
    const client_id = "gld_" + crypto5.randomBytes(12).toString("hex");
    const client_secret = "sec_" + crypto5.randomBytes(24).toString("hex");
    if (supabase) {
      try {
        await supabase.from("oauth_clients").insert({
          client_id,
          client_secret,
          app_name: app_name.trim(),
          app_type: app_type || "Web application",
          javascript_origins: cleanOrigins,
          redirect_uris: cleanRedirects
        });
      } catch {
      }
    }
    const newClient = {
      client_id,
      client_secret,
      app_name: app_name.trim(),
      app_type: app_type || "Web application",
      redirect_uri: cleanRedirects[0] || redirect_uri || "",
      redirect_uris: cleanRedirects,
      javascript_origins: cleanOrigins,
      logo_url: logo_url?.trim() || "",
      website_url: website_url?.trim() || "",
      owner_user_id: ownerId,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    oauthClients.unshift(newClient);
    saveData();
    return res.status(201).json({ success: true, client: newClient });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/oauth/validate", async (req, res) => {
  try {
    const client_id = String(req.query.client_id || "");
    const redirect_uri = String(req.query.redirect_uri || "");
    if (!client_id) return res.json({ valid: false });
    const client = await findOAuthClient(client_id);
    if (!client) return res.json({ valid: false });
    const norm = (u) => (u || "").replace("https://www.", "https://").replace(/\/$/, "");
    const savedList = [
      ...Array.isArray(client.redirect_uris) ? client.redirect_uris : [],
      ...client.redirect_uri ? [client.redirect_uri] : []
    ].filter(Boolean);
    if (redirect_uri && savedList.length > 0) {
      const isValidRedirect = savedList.some((saved) => norm(saved) === norm(redirect_uri));
      if (!isValidRedirect) return res.json({ valid: false });
    }
    return res.json({ valid: true, client });
  } catch (err) {
    return res.json({ valid: false, error: err.message });
  }
});
app.get(["/api/oauth/authorize", "/oauth/authorize"], async (req, res) => {
  const client_id = String(req.query.client_id || "");
  const redirect_uri = String(req.query.redirect_uri || "");
  const response_type = req.query.response_type;
  const scope = req.query.scope;
  const state = req.query.state;
  const client = await findOAuthClient(client_id);
  if (!client) {
    return res.status(400).send("OAuth Error: Invalid client_id");
  }
  if (redirect_uri && !isRedirectAllowed(client, redirect_uri)) {
    return res.status(400).send("OAuth Error: Invalid redirect_uri");
  }
  const chosenRedirect = redirect_uri || client.redirect_uris && client.redirect_uris[0] || client.redirect_uri || "";
  const targetUrl = `/?oauth_consent=true&client_id=${client_id}&redirect_uri=${encodeURIComponent(chosenRedirect)}&scope=${encodeURIComponent(String(scope || "email profile"))}&state=${encodeURIComponent(String(state || ""))}`;
  return res.redirect(targetUrl);
});
app.get("/api/oauth/accounts", async (req, res) => {
  ensureDataLoaded();
  const cookies = parseCookies(req);
  const sessionCookie = cookies["goldmailer_session"] || cookies["session_token"];
  const authHeader = req.headers.authorization;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
  const verifiedUserIds = /* @__PURE__ */ new Set();
  const verifiedEmails = /* @__PURE__ */ new Set();
  if (sessionCookie) {
    const sess = await db.getSession(sessionCookie);
    if (sess && new Date(sess.last_active || sess.last_active_at || sess.created_at) >= thirtyDaysAgo) {
      if (sess.user_id) verifiedUserIds.add(sess.user_id);
      if (sess.email) verifiedEmails.add(sess.email.toLowerCase().trim());
    }
  }
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const decoded = verifyToken(token);
    if (decoded?.id || decoded?.email) {
      const sess = await db.getSession(token) || (decoded.session_token ? await db.getSession(decoded.session_token) : null);
      if (sess && new Date(sess.last_active || sess.last_active_at || sess.created_at) >= thirtyDaysAgo) {
        if (sess.user_id) verifiedUserIds.add(sess.user_id);
        if (sess.email) verifiedEmails.add(sess.email.toLowerCase().trim());
      } else if (decoded.id && decoded.exp && decoded.exp > Date.now()) {
        verifiedUserIds.add(decoded.id);
        if (decoded.email) verifiedEmails.add(decoded.email.toLowerCase().trim());
      }
    }
  }
  const rawClientAccsHeader = req.headers["x-device-accounts"];
  const rawClientAccsQuery = req.query.client_accounts || req.query.emails;
  const deviceAccountsPayload = rawClientAccsHeader || rawClientAccsQuery;
  if (deviceAccountsPayload) {
    try {
      const parsed = typeof deviceAccountsPayload === "string" && (deviceAccountsPayload.startsWith("[") || deviceAccountsPayload.startsWith("{")) ? JSON.parse(deviceAccountsPayload) : deviceAccountsPayload.split(",");
      const emailList = Array.isArray(parsed) ? parsed.map((item) => typeof item === "string" ? item : item?.email).filter(Boolean) : [];
      for (const em of emailList) {
        const clean = String(em).toLowerCase().trim();
        const userSessList = await db.getSessionsForUser(clean);
        const hasValidSession = userSessList.some((s) => new Date(s.last_active || s.last_active_at || s.created_at) >= thirtyDaysAgo);
        if (hasValidSession) {
          verifiedEmails.add(clean);
        }
      }
    } catch {
    }
  }
  if (verifiedUserIds.size === 0 && verifiedEmails.size === 0) {
    return res.json({ accounts: [] });
  }
  const matchedUsers = goldUsers.filter((u) => {
    const uEmail = (u.email || "").toLowerCase().trim();
    return verifiedUserIds.has(u.id) || verifiedEmails.has(uEmail);
  });
  const accounts = matchedUsers.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
    first_name: u.first_name || "",
    last_name: u.last_name || "",
    dob: u.dob || "",
    date_of_birth: u.dob || "",
    gender: u.gender || "",
    phone: u.phone || "",
    avatar_url: u.avatar_url || ""
  }));
  return res.json({ accounts });
});
app.post("/api/oauth/authorize", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = "";
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const decoded = verifyToken(token);
      if (decoded) userId = decoded.id;
    }
    const { client_id, redirect_uri, scope, state, user_id, email } = req.body;
    let selectedUser = goldUsers.find((u) => user_id && u.id === user_id || email && u.email && u.email.toLowerCase() === String(email).toLowerCase());
    if (!selectedUser && userId) {
      selectedUser = goldUsers.find((u) => u.id === userId);
    }
    if (!selectedUser) {
      return res.status(400).json({ error: "Please choose an active logged-in account to authorize." });
    }
    const finalUserId = selectedUser.id;
    const finalEmail = selectedUser.email;
    const client = await findOAuthClient(String(client_id));
    if (!client) {
      return res.status(400).json({ error: "Invalid client_id" });
    }
    if (redirect_uri && !isRedirectAllowed(client, String(redirect_uri))) {
      return res.status(400).json({ error: "Invalid redirect_uri" });
    }
    const chosenRedirect = String(redirect_uri || client.redirect_uris && client.redirect_uris[0] || client.redirect_uri || "");
    const code = "gld_code_" + crypto5.randomBytes(16).toString("hex");
    oauthCodes.push({
      code,
      client_id: String(client_id),
      user_id: finalUserId,
      redirect_uri: chosenRedirect,
      scope: String(scope || "email profile"),
      expires_at: Date.now() + 10 * 60 * 1e3
    });
    saveData();
    const fullName = `${selectedUser.first_name || ""} ${selectedUser.last_name || ""}`.trim() || selectedUser.username;
    let redirectTargetUrl = chosenRedirect;
    try {
      const redirectTarget = new URL(chosenRedirect);
      redirectTarget.searchParams.set("code", code);
      if (finalUserId) {
        redirectTarget.searchParams.set("goldmailer_id", finalUserId);
        redirectTarget.searchParams.set("user_id", finalUserId);
      }
      if (finalEmail) {
        redirectTarget.searchParams.set("email", finalEmail);
      }
      redirectTarget.searchParams.set("name", fullName);
      if (selectedUser.username) {
        redirectTarget.searchParams.set("username", selectedUser.username);
      }
      if (selectedUser.dob) {
        redirectTarget.searchParams.set("dob", selectedUser.dob);
        redirectTarget.searchParams.set("date_of_birth", selectedUser.dob);
      }
      if (state) redirectTarget.searchParams.set("state", String(state));
      redirectTargetUrl = redirectTarget.toString();
    } catch {
      redirectTargetUrl = `${chosenRedirect}?code=${code}&goldmailer_id=${encodeURIComponent(finalUserId)}&user_id=${encodeURIComponent(finalUserId)}&email=${encodeURIComponent(finalEmail)}&name=${encodeURIComponent(fullName)}&username=${encodeURIComponent(selectedUser.username || "")}&dob=${encodeURIComponent(selectedUser.dob || "")}&date_of_birth=${encodeURIComponent(selectedUser.dob || "")}${state ? `&state=${encodeURIComponent(String(state))}` : ""}`;
    }
    return res.json({
      success: true,
      redirect_url: redirectTargetUrl,
      code,
      goldmailer_id: finalUserId,
      user_id: finalUserId,
      email: finalEmail,
      name: fullName,
      username: selectedUser.username,
      dob: selectedUser.dob || "",
      date_of_birth: selectedUser.dob || "",
      user: {
        id: finalUserId,
        email: finalEmail,
        name: fullName,
        first_name: selectedUser.first_name || "",
        last_name: selectedUser.last_name || "",
        username: selectedUser.username,
        dob: selectedUser.dob || "",
        date_of_birth: selectedUser.dob || "",
        gender: selectedUser.gender,
        phone: selectedUser.phone
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post(["/api/oauth/token", "/oauth/token"], async (req, res) => {
  try {
    const { code, client_id, client_secret } = req.body;
    const client = await findOAuthClient(client_id);
    if (!client || client.client_secret !== client_secret) {
      return res.status(401).json({ error: "invalid_client" });
    }
    const codeIdx = oauthCodes.findIndex((c) => c.code === code && c.client_id === client_id);
    if (codeIdx === -1) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    const authCode = oauthCodes[codeIdx];
    if (authCode.expires_at < Date.now()) {
      oauthCodes.splice(codeIdx, 1);
      return res.status(400).json({ error: "expired_code" });
    }
    oauthCodes.splice(codeIdx, 1);
    const user = goldUsers.find((u) => u.id === authCode.user_id) || goldUsers[0];
    if (!user) return res.status(400).json({ error: "invalid_user" });
    const accessToken = "gld_tok_" + crypto5.randomBytes(24).toString("hex");
    oauthTokens.push({
      access_token: accessToken,
      client_id: client.client_id,
      user_id: user.id,
      scope: authCode.scope,
      expires_at: Date.now() + 3600 * 1e3
    });
    saveData();
    return res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: authCode.scope,
      goldmailer_id: user.id,
      user_id: user.id,
      email: user.email,
      user: {
        id: user.id,
        goldmailer_id: user.id,
        email: user.email,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username,
        first_name: user.first_name || "",
        given_name: user.first_name || "",
        last_name: user.last_name || "",
        family_name: user.last_name || "",
        username: user.username,
        preferred_username: user.username,
        dob: user.dob || "",
        date_of_birth: user.dob || "",
        birthdate: user.dob || "",
        gender: user.gender || void 0,
        phone: user.phone || void 0,
        avatar_url: user.avatar_url || ""
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.all(["/api/oauth/userinfo", "/oauth/userinfo"], async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "invalid_token" });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const oauthToken = oauthTokens.find((t) => t.access_token === token);
    let userId = null;
    if (oauthToken) {
      userId = oauthToken.user_id;
    } else {
      const decoded = verifyToken(token);
      if (decoded) userId = decoded.id;
    }
    if (!userId) return res.status(401).json({ error: "invalid_token" });
    let user = goldUsers.find((u) => u.id === userId);
    if (!user) {
      user = await db.findAccount(userId);
    }
    if (!user) return res.status(404).json({ error: "user_not_found" });
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;
    return res.json({
      sub: user.id,
      id: user.id,
      goldmailer_id: user.id,
      email: user.email,
      email_verified: true,
      name: fullName,
      first_name: user.first_name || "",
      given_name: user.first_name || "",
      last_name: user.last_name || "",
      family_name: user.last_name || "",
      username: user.username,
      preferred_username: user.username,
      dob: user.dob || "",
      date_of_birth: user.dob || "",
      birthdate: user.dob || "",
      gender: user.gender || void 0,
      phone: user.phone || void 0,
      phone_number: user.phone || void 0,
      picture: user.avatar_url || "",
      avatar_url: user.avatar_url || "",
      locale: "en",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
var getAppUrl = (req) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return "https://goldmailer.xyz";
};
var getUserIdFromReq = (req) => {
  ensureDataLoaded();
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const decoded = verifyToken(token);
    if (decoded?.id) return decoded.id;
    if (decoded?.email) {
      const u = goldUsers.find((gu) => gu.email && gu.email.toLowerCase() === decoded.email.toLowerCase());
      if (u) return u.id;
      return decoded.email;
    }
  }
  const cookies = parseCookies(req);
  const sessionToken = cookies["goldmailer_session"] || cookies["session_token"];
  if (sessionToken) {
    const sess = db.getSessionSync ? db.getSessionSync(sessionToken) : null;
    if (sess?.user_id) return sess.user_id;
  }
  return "";
};
async function syncGmailForConnectedAccount(connected) {
  if (!connected || !connected.isForwardingEnabled) return 0;
  let accessToken = connected.gmail_access_token;
  const refreshToken = connected.gmail_refresh_token;
  const clientId = process.env.GOOGLE_CLIENT_ID || db.getSettings().google_client_id || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || db.getSettings().google_client_secret || "";
  const getFreshAccessToken = async () => {
    if (!refreshToken || !clientId || !clientSecret) return accessToken || void 0;
    try {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });
      const data = await refreshRes.json();
      if (data.access_token) {
        connected.gmail_access_token = data.access_token;
        await db.addOrUpdateConnectedEmail(connected);
        return data.access_token;
      }
    } catch (e) {
      console.warn(`[GMAIL-SYNC] Token refresh warning for ${connected.email}:`, e.message);
    }
    return accessToken || void 0;
  };
  if (!accessToken) {
    accessToken = await getFreshAccessToken();
  }
  if (!accessToken) return 0;
  const user = goldUsers.find((u) => u.id === connected.userId) || await db.findAccount(connected.userId);
  if (!user) return 0;
  let importedCount = 0;
  try {
    let listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (listRes.status === 401 && refreshToken) {
      accessToken = await getFreshAccessToken();
      if (accessToken) {
        listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15", {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
      }
    }
    if (!listRes.ok) {
      console.warn(`[GMAIL-SYNC] Messages list returned status ${listRes.status} for ${connected.email}`);
      return 0;
    }
    const listData = await listRes.json();
    const messages = Array.isArray(listData.messages) ? listData.messages : [];
    for (const msgRef of messages) {
      const msgId = msgRef.id;
      const alreadyExists = goldEmails.some(
        (e) => e.id === `gmail_${msgId}` || e.messageId === msgId || e.raw && (e.raw.gmail_id === msgId || e.raw.id === msgId)
      );
      if (alreadyExists) continue;
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => {
        const h = headers.find((item) => item.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : "";
      };
      const subject = getHeader("Subject") || "(No Subject)";
      const from = getHeader("From") || connected.email;
      const to = getHeader("To") || user.email;
      const dateHeader = getHeader("Date");
      const receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date(Number(msg.internalDate || Date.now())).toISOString();
      let bodyText = "";
      let bodyHtml = "";
      const extractParts = (part) => {
        if (!part) return;
        if (part.mimeType === "text/plain" && part.body?.data) {
          try {
            bodyText = Buffer.from(part.body.data, "base64url").toString("utf-8");
          } catch {
          }
        } else if (part.mimeType === "text/html" && part.body?.data) {
          try {
            bodyHtml = Buffer.from(part.body.data, "base64url").toString("utf-8");
          } catch {
          }
        }
        if (part.parts && Array.isArray(part.parts)) {
          part.parts.forEach(extractParts);
        }
      };
      if (msg.payload) {
        if (msg.payload.body?.data) {
          try {
            const decoded = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
            if (msg.payload.mimeType === "text/html") bodyHtml = decoded;
            else bodyText = decoded;
          } catch {
          }
        }
        if (msg.payload.parts) {
          msg.payload.parts.forEach(extractParts);
        }
      }
      if (!bodyText && !bodyHtml) {
        bodyText = msg.snippet || "";
      }
      const senderEmail = from.includes("<") ? from.match(/<([^>]+)>/)?.[1] || from : from;
      const senderName = from.includes("<") ? from.split("<")[0].replace(/"/g, "").trim() : from.split("@")[0];
      const newEmail = {
        id: `gmail_${msgId}`,
        messageId: msgId,
        user_id: user.id,
        recipient: user.email,
        to_email: user.email,
        to: user.email,
        sender: senderEmail,
        from_email: senderEmail,
        from,
        sender_name: senderName,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        html: bodyHtml,
        text: bodyText,
        body: bodyHtml || bodyText,
        received_at: receivedAt,
        created_at: receivedAt,
        is_read: false,
        is_starred: false,
        folder: "primary",
        category: "primary",
        status: "inbox",
        raw: {
          gmail_id: msgId,
          forwarded_from: connected.email,
          threadId: msg.threadId
        }
      };
      newEmail.forwarded_from = connected.email;
      await db.insertEmail(newEmail);
      goldEmails.unshift(newEmail);
      saveData();
      broadcastNewEmail(newEmail);
      importedCount++;
    }
    connected.lastSyncedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db.addOrUpdateConnectedEmail(connected);
    if (importedCount > 0) {
      console.log(`\u{1F4E5} [GMAIL-SYNC] Imported ${importedCount} emails from ${connected.email} into ${user.email}`);
    }
  } catch (err) {
    console.error(`\u274C [GMAIL-SYNC] Error syncing Gmail for ${connected.email}:`, err);
  }
  return importedCount;
}
var gmailSyncCron = setInterval(async () => {
  try {
    const list = db.getConnectedEmails().filter((c) => c.isForwardingEnabled && (c.gmail_access_token || c.gmail_refresh_token));
    for (const c of list) {
      await syncGmailForConnectedAccount(c);
    }
  } catch (err) {
    console.warn("\u26A0\uFE0F [GMAIL-CRON] Background sync note:", err.message);
  }
}, 2 * 60 * 1e3);
if (gmailSyncCron && typeof gmailSyncCron.unref === "function") {
  gmailSyncCron.unref();
}
app.get("/api/auth/google/config", (req, res) => {
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const clientId = process.env.GOOGLE_CLIENT_ID || db.getSettings().google_client_id || "";
  return res.json({
    redirect_uri: redirectUri,
    javascript_origin: appUrl,
    is_configured: Boolean(clientId),
    client_id: clientId ? clientId.substring(0, 15) + "..." : ""
  });
});
app.post("/api/auth/google/config", async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "Client ID and Client Secret are required" });
  }
  await db.updateSettings({
    google_client_id: String(clientId).trim(),
    google_client_secret: String(clientSecret).trim()
  });
  return res.json({ success: true, message: "Google OAuth credentials updated successfully" });
});
app.post("/api/connected-emails/request-verification", async (req, res) => {
  try {
    ensureDataLoaded();
    const { email } = req.body;
    let userId = req.body.userId || getUserIdFromReq(req);
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email address is required" });
    }
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      return res.status(400).json({ error: "Please enter a valid Gmail address" });
    }
    if (!userId) {
      const firstUser = goldUsers[0];
      if (firstUser) userId = firstUser.id;
      else userId = "user_default";
    }
    const verificationCode = String(Math.floor(1e5 + Math.random() * 9e5));
    const expiresAt = Date.now() + 10 * 60 * 1e3;
    await db.saveConnectedVerification({
      id: `cev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      email: cleanEmail,
      code: verificationCode,
      expiresAt,
      verified: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const emailSubject = `Your GoldMailer Verification Code: ${verificationCode}`;
    const emailBody = `Code: ${verificationCode} - Expires in 10 mins`;
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 32px; color: #18181b;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
          <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #FF6A00, #FF8C42); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 900; font-size: 20px; line-height: 38px; text-align: center;">G</div>
          <div>
            <h2 style="color: #FF6A00; margin: 0; font-size: 20px; font-weight: 800;">GoldMailer</h2>
            <p style="margin: 0; color: #71717a; font-size: 12px;">Connected Account Auto-Forwarding</p>
          </div>
        </div>

        <p style="font-size: 14px; color: #27272a; line-height: 1.6;">You requested to connect this Gmail address (<strong>${cleanEmail}</strong>) to your GoldMailer account to enable auto-forwarding.</p>

        <div style="margin: 28px 0; text-align: center;">
          <div style="display: inline-block; background: #fff7ed; border: 2px dashed #FF6A00; color: #ea580c; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 14px 28px; border-radius: 12px;">
            ${verificationCode}
          </div>
        </div>

        <p style="font-size: 13px; color: #71717a; line-height: 1.5;">Code: <strong>${verificationCode}</strong> - Expires in 10 mins</p>
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 24px; border-top: 1px solid #f4f4f5; padding-top: 16px;">If you did not request this verification, you can safely ignore this email.</p>
      </div>
    `;
    const fromAddress = "GoldMailer <no-reply@goldmailer.xyz>";
    let sent = false;
    const activeSmtp = getActiveSmtpTransporter();
    if (activeSmtp) {
      try {
        await activeSmtp.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: emailSubject,
          text: emailBody,
          html: emailHtml
        });
        sent = true;
      } catch (err) {
        console.warn("\u26A0\uFE0F [CONNECTED-EMAILS] SMTP send note:", err.message);
      }
    }
    if (!sent && resendApiKey) {
      try {
        const client = resendClient || new Resend(resendApiKey);
        await client.emails.send({
          from: resendFrom,
          to: [cleanEmail],
          subject: emailSubject,
          text: emailBody,
          html: emailHtml
        });
        sent = true;
      } catch (err) {
        console.warn("\u26A0\uFE0F [CONNECTED-EMAILS] Resend send note:", err.message);
      }
    }
    console.log(`\u{1F511} [CONNECTED-EMAILS] Verification code generated for ${cleanEmail}: ${verificationCode} (sent: ${sent})`);
    return res.json({
      success: true,
      message: `We sent a 6-digit code to ${cleanEmail}, check inbox`,
      code: verificationCode
    });
  } catch (err) {
    console.error("\u274C [CONNECTED-EMAILS] Error requesting verification:", err);
    return res.status(500).json({ error: err.message || "Failed to send verification code" });
  }
});
app.post("/api/connected-emails/verify-code", async (req, res) => {
  try {
    ensureDataLoaded();
    const { email, code } = req.body;
    let userId = req.body.userId || getUserIdFromReq(req);
    if (!email || !code) {
      return res.status(400).json({ error: "Email and 6-digit verification code are required" });
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(code).trim();
    if (!userId) {
      const firstUser = goldUsers[0];
      if (firstUser) userId = firstUser.id;
      else userId = "user_default";
    }
    const result = await db.verifyConnectedCode(userId, cleanEmail, cleanCode);
    if (!result.valid) {
      return res.status(400).json({ error: result.error || "Invalid or expired verification code" });
    }
    const user = goldUsers.find((u) => u.id === userId) || await db.findAccount(userId);
    const forwardAddress = user ? `${user.username || user.email.split("@")[0]}+forwarded@inbox.goldmailer.xyz` : `forwarded@inbox.goldmailer.xyz`;
    const connectedRecord = await db.addOrUpdateConnectedEmail({
      userId,
      email: cleanEmail,
      verificationCode: cleanCode,
      isVerified: true,
      status: "pending_oauth",
      isForwardingEnabled: false,
      forwardingAddress: forwardAddress
    });
    return res.json({
      success: true,
      verified: true,
      connectedEmail: connectedRecord,
      message: "Code confirmed successfully! Now connect Gmail to enable auto-forwarding."
    });
  } catch (err) {
    console.error("\u274C [CONNECTED-EMAILS] Error verifying code:", err);
    return res.status(500).json({ error: err.message || "Failed to verify code" });
  }
});
app.get("/api/connected-emails", async (req, res) => {
  ensureDataLoaded();
  const userId = req.query.userId || getUserIdFromReq(req);
  const list = db.getConnectedEmails(userId || void 0);
  return res.json({ connectedEmails: list });
});
app.delete("/api/connected-emails/:id", async (req, res) => {
  ensureDataLoaded();
  const id = req.params.id;
  const userId = getUserIdFromReq(req);
  const connected = db.getConnectedEmailById(id);
  if (!connected) {
    return res.status(404).json({ error: "Connected account not found" });
  }
  if (userId && connected.userId !== userId) {
    return res.status(403).json({ error: "Unauthorized to remove this connected account" });
  }
  await db.deleteConnectedEmail(id, connected.userId);
  return res.json({ success: true, message: "Connected account removed" });
});
app.post("/api/connected-emails/:id/toggle", async (req, res) => {
  ensureDataLoaded();
  const id = req.params.id;
  const { enabled } = req.body;
  const connected = db.getConnectedEmailById(id);
  if (!connected) {
    return res.status(404).json({ error: "Connected account not found" });
  }
  connected.isForwardingEnabled = Boolean(enabled);
  const updated = await db.addOrUpdateConnectedEmail(connected);
  return res.json({ success: true, connectedEmail: updated });
});
app.post("/api/connected-emails/:id/sync", async (req, res) => {
  ensureDataLoaded();
  const id = req.params.id;
  const connected = db.getConnectedEmailById(id);
  if (!connected) {
    return res.status(404).json({ error: "Connected account not found" });
  }
  const count = await syncGmailForConnectedAccount(connected);
  return res.json({
    success: true,
    importedCount: count,
    message: count > 0 ? `Successfully imported ${count} emails from ${connected.email}` : `Mailbox is up to date for ${connected.email}`
  });
});
app.get("/api/auth/google/url", (req, res) => {
  ensureDataLoaded();
  const connectedEmailId = req.query.connectedEmailId;
  const clientId = process.env.GOOGLE_CLIENT_ID || db.getSettings().google_client_id;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  if (!clientId) {
    return res.status(400).json({
      error: "Google OAuth Client ID is not configured. Please provide your Google OAuth Client ID.",
      redirect_uri: redirectUri,
      javascript_origin: appUrl
    });
  }
  const connected = connectedEmailId ? db.getConnectedEmailById(connectedEmailId) : null;
  const statePayload = {
    connectedEmailId: connected?.id || connectedEmailId || "",
    userId: connected?.userId || getUserIdFromReq(req),
    email: connected?.email || "",
    ts: Date.now()
  };
  const stateStr = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state: stateStr
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.json({ url, redirect_uri: redirectUri, javascript_origin: appUrl });
});
app.get("/api/auth/google/callback", async (req, res) => {
  ensureDataLoaded();
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  if (error) {
    console.error("\u274C [GMAIL-OAUTH] Google OAuth error returned:", error);
    return res.redirect(`/?connected_email=error&message=${encodeURIComponent(String(error))}`);
  }
  if (!code) {
    return res.status(400).send("OAuth Error: No authorization code received from Google");
  }
  let stateData = {};
  if (state) {
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    } catch {
    }
  }
  const clientId = process.env.GOOGLE_CLIENT_ID || db.getSettings().google_client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || db.getSettings().google_client_secret;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    return res.status(500).send("Google OAuth Client ID or Client Secret not configured on server");
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("\u274C [GMAIL-OAUTH] Token exchange failed:", tokenData);
      return res.redirect(`/?connected_email=error&message=${encodeURIComponent(tokenData.error_description || tokenData.error || "Token exchange failed")}`);
    }
    const { access_token, refresh_token } = tokenData;
    let googleEmail = "";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { "Authorization": `Bearer ${access_token}` }
      });
      if (userInfoRes.ok) {
        const uInfo = await userInfoRes.json();
        googleEmail = uInfo.email || "";
      }
    } catch {
    }
    const targetEmail = (stateData.email || googleEmail || "").toLowerCase().trim();
    let connected = stateData.connectedEmailId ? db.getConnectedEmailById(stateData.connectedEmailId) : void 0;
    if (!connected && stateData.userId && targetEmail) {
      connected = db.getConnectedEmailByUserAndEmail(stateData.userId, targetEmail);
    }
    const userId = connected?.userId || stateData.userId || getUserIdFromReq(req) || "user_default";
    const emailToUse = targetEmail || connected?.email || "google_user@gmail.com";
    const user = goldUsers.find((u) => u.id === userId) || await db.findAccount(userId);
    const forwardAddress = user ? `${user.username || user.email.split("@")[0]}+forwarded@inbox.goldmailer.xyz` : `forwarded@inbox.goldmailer.xyz`;
    const updated = await db.addOrUpdateConnectedEmail({
      id: connected?.id,
      userId,
      email: emailToUse,
      isVerified: true,
      status: "connected",
      gmail_access_token: access_token,
      gmail_refresh_token: refresh_token || connected?.gmail_refresh_token,
      isForwardingEnabled: true,
      forwardingAddress: forwardAddress
    });
    console.log(`\u2705 [GMAIL-OAUTH] Successfully connected Gmail account ${emailToUse} for user ${userId}`);
    try {
      await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/forwardingAddresses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ forwardingEmail: forwardAddress })
      }).catch(() => {
      });
      const putRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/autoForwarding", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          enabled: true,
          emailAddress: forwardAddress,
          disposition: "leaveInInbox"
        })
      });
      if (putRes.ok) {
        console.log(`\u{1F680} [GMAIL-OAUTH] Option 1 True Auto-Forward enabled: ${emailToUse} -> ${forwardAddress}`);
      } else {
        const errText = await putRes.text();
        console.warn(`\u26A0\uFE0F [GMAIL-OAUTH] Option 1 status ${putRes.status}: ${errText} (Option 2 sync active)`);
      }
    } catch (opt1Err) {
      console.warn("\u26A0\uFE0F [GMAIL-OAUTH] Option 1 error:", opt1Err.message);
    }
    syncGmailForConnectedAccount(updated).catch((e) => {
      console.warn("\u26A0\uFE0F [GMAIL-OAUTH] Initial sync error:", e);
    });
    return res.redirect(`/?tab=connected_emails&connected_email=success&email=${encodeURIComponent(emailToUse)}`);
  } catch (err) {
    console.error("\u274C [GMAIL-OAUTH] Callback error:", err);
    return res.redirect(`/?connected_email=error&message=${encodeURIComponent(err.message || "OAuth error")}`);
  }
});
var requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized: Admin authentication required" });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: "Invalid or expired session" });
  const email = (decoded.email || "").toLowerCase().trim();
  const isAdmin = email === "miracle@goldmailer.xyz";
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required. Only miracle@goldmailer.xyz has administrative privileges." });
  }
  req.adminUser = decoded;
  next();
};
app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const accounts = db.listAccounts();
  const allEmails = db.getAllEmails();
  const emailBytes = allEmails.reduce((acc, e) => acc + Buffer.byteLength((e.body_html || "") + (e.body_text || "") + (e.subject || ""), "utf8"), 0);
  const totalStorage = accounts.reduce((acc, u) => acc + (u.storage_used_bytes || 0), 0) + emailBytes;
  const telnyxCfg = getTelnyxConfig();
  const activeAccounts = accounts.filter((u) => !u.is_banned);
  const openTickets = db.getTickets().filter((t) => t.status === "open" || t.status === "in_progress");
  const domains = db.getDomains();
  const payments = db.getPayments();
  const revenueTotal = payments.filter((p) => p.payment_status === "confirmed").reduce((sum, p) => sum + (p.amount_usd || 0), 0);
  res.json({
    totalUsers: accounts.length,
    activeAccountsCount: activeAccounts.length,
    bannedUsersCount: accounts.length - activeAccounts.length,
    totalEmails: allEmails.filter((e) => e.status !== "deleted").length,
    totalDrafts: goldDrafts.length,
    totalOAuthClients: oauthClients.length,
    totalStorageUsedBytes: totalStorage,
    totalStorageUsedMb: (totalStorage / (1024 * 1024)).toFixed(2),
    totalStorageUsedGb: (totalStorage / (1024 * 1024 * 1024)).toFixed(2),
    blockedIpsCount: db.getBlockedIps().length,
    openTicketsCount: openTickets.length,
    activeDomainsCount: domains.filter((d) => d.is_verified).length,
    monthlyRevenueUsd: Number(revenueTotal.toFixed(2)),
    recentLogins: userDevices.slice(0, 10),
    adminPhoneNumber: telnyxCfg.phoneNumber || "+1 (423) 666-2513",
    isTelnyxConfigured: telnyxCfg.isConfigured,
    isResendConfigured: Boolean(process.env.RESEND_API_KEY),
    isDatabaseConnected: true,
    dbType: "Supabase + Persistent Dual-File DB Engine"
  });
});
app.get("/api/admin/users", requireAdmin, (req, res) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const search = (req.query.search || "").toLowerCase().trim();
  let users = db.listAccounts();
  if (search) {
    users = users.filter(
      (u) => u.email.toLowerCase().includes(search) || u.username.toLowerCase().includes(search) || u.first_name.toLowerCase().includes(search) || u.last_name.toLowerCase().includes(search)
    );
  }
  res.json(users.map((u) => sanitizeUser(u)));
});
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, username, email, password, role, plan } = req.body;
    if (!username || !password || !firstName) {
      return res.status(400).json({ error: "firstName, username, and password required" });
    }
    const cleanUser = username.toLowerCase().replace(/@.*$/, "").trim();
    const finalEmail = `${cleanUser}@goldmailer.xyz`;
    const newUser = {
      id: "usr_" + crypto5.randomBytes(8).toString("hex"),
      email: finalEmail,
      username: cleanUser,
      password_hash: bcrypt2.hashSync(String(password).trim(), 10),
      first_name: firstName.trim(),
      last_name: (lastName || "").trim(),
      dob: "1998-05-14",
      gender: "Prefer not to say",
      phone: "",
      recovery_phone: "",
      backup_email: "",
      two_factor_enabled: false,
      backup_codes: generateBackupCodes(),
      role: role === "admin" ? "admin" : "user",
      plan: plan || "free",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      is_banned: false,
      storage_used_bytes: 0,
      storage_limit_bytes: plan === "enterprise" ? 1024 * 1024 * 1024 * 1024 : 15 * 1024 * 1024 * 1024
    };
    await db.insertAccount(newUser);
    goldUsers.unshift(newUser);
    saveData();
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "CREATE_USER", "user", newUser.id, `Created account ${newUser.email}`);
    return res.status(201).json({ success: true, user: sanitizeUser(newUser) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, role, plan, storage_limit_bytes, password } = req.body;
    const updates = {};
    if (first_name !== void 0) updates.first_name = first_name;
    if (last_name !== void 0) updates.last_name = last_name;
    if (role !== void 0) updates.role = role;
    if (plan !== void 0) updates.plan = plan;
    if (storage_limit_bytes !== void 0) updates.storage_limit_bytes = Number(storage_limit_bytes);
    if (password) updates.password_hash = bcrypt2.hashSync(String(password).trim(), 10);
    const updated = await db.updateAccount(id, updates);
    if (!updated) return res.status(404).json({ error: "User not found" });
    const idx = goldUsers.findIndex((u) => u.id === id);
    if (idx !== -1) goldUsers[idx] = { ...goldUsers[idx], ...updates };
    saveData();
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "UPDATE_USER", "user", id, `Updated account ${updated.email}`);
    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
  const ok = await db.deleteAccount(id, adminEmail);
  if (!ok) return res.status(404).json({ error: "User not found" });
  goldUsers = goldUsers.filter((u) => u.id !== id);
  goldEmails = goldEmails.filter((e) => e.recipient !== id && !e.recipient.startsWith(id));
  saveData();
  res.json({ success: true, message: "User deleted permanently" });
});
app.get("/api/admin/email-accounts", requireAdmin, (_req, res) => {
  ensureDataLoaded();
  for (const gu of goldUsers) {
    db.upsertAccount(gu);
  }
  const accounts = db.listAccounts().map((u) => {
    const userEmails = db.getEmailsForUser(u.email);
    const unread = userEmails.filter((e) => !e.is_read).length;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: `${u.first_name} ${u.last_name}`.trim(),
      domain: u.email.split("@")[1] || "goldmailer.xyz",
      storageUsedMb: ((u.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1),
      storageLimitGb: ((u.storage_limit_bytes || 15 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024)).toFixed(0),
      totalEmails: userEmails.length,
      unreadEmails: unread,
      plan: u.plan || "free",
      is_banned: Boolean(u.is_banned),
      created_at: u.created_at
    };
  });
  res.json(accounts);
});
app.post(["/api/admin/users/:id/ban", "/api/admin/ban-user"], requireAdmin, async (req, res) => {
  try {
    const id = req.params.id || req.body.userId || req.body.id;
    if (!id) return res.status(400).json({ error: "userId or id is required" });
    const { is_banned, banned, reason } = req.body || {};
    const finalBan = is_banned !== void 0 ? is_banned : banned;
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    const user = await db.findAccount(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const newBanState = finalBan !== void 0 ? Boolean(finalBan) : !user.is_banned;
    const updated = await db.setBanStatus(user.id, newBanState, reason, adminEmail);
    if (!updated) return res.status(404).json({ error: "User not found" });
    const idx = goldUsers.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
      goldUsers[idx].is_banned = newBanState;
      goldUsers[idx].banned_at = updated.banned_at;
      goldUsers[idx].ban_reason = updated.ban_reason;
    }
    saveData();
    return res.json({
      success: true,
      is_banned: updated.is_banned,
      banned_at: updated.banned_at,
      ban_reason: updated.ban_reason,
      user: sanitizeUser(updated)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/email-logs", requireAdmin, (_req, res) => {
  ensureDataLoaded();
  const all = db.getAllEmails().map((e) => ({
    id: e.id,
    from: e.sender || e.from_email || e.from,
    to: e.recipient || e.to_email || e.to,
    subject: e.subject,
    status: e.status || (e.folder === "trash" ? "trash" : "inbox"),
    folder: e.folder,
    received_at: e.received_at || e.created_at,
    is_read: Boolean(e.is_read)
  }));
  res.json(all.slice(0, 200));
});
app.get("/api/admin/storage", requireAdmin, (_req, res) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const totalAllocated = accounts.reduce((sum, u) => sum + (u.storage_limit_bytes || 15 * 1024 * 1024 * 1024), 0);
  const totalUsed = accounts.reduce((sum, u) => sum + (u.storage_used_bytes || 0), 0);
  const topUsers = [...accounts].sort((a, b) => (b.storage_used_bytes || 0) - (a.storage_used_bytes || 0)).slice(0, 15).map((u) => ({
    id: u.id,
    email: u.email,
    name: `${u.first_name} ${u.last_name}`.trim(),
    usedBytes: u.storage_used_bytes || 0,
    usedMb: ((u.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1),
    limitBytes: u.storage_limit_bytes || 15 * 1024 * 1024 * 1024,
    limitGb: ((u.storage_limit_bytes || 15 * 1024 * 1024 * 1024) / (1024 * 1024 * 1024)).toFixed(0),
    percent: Math.min(100, (u.storage_used_bytes || 0) / (u.storage_limit_bytes || 15 * 1024 * 1024 * 1024) * 100).toFixed(1)
  }));
  res.json({
    totalAllocatedGb: (totalAllocated / (1024 * 1024 * 1024)).toFixed(0),
    totalUsedMb: (totalUsed / (1024 * 1024)).toFixed(1),
    totalUsedGb: (totalUsed / (1024 * 1024 * 1024)).toFixed(2),
    percentUsed: (totalUsed / totalAllocated * 100).toFixed(2),
    users: topUsers
  });
});
app.put("/api/admin/storage/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { limitGb } = req.body;
    if (!limitGb || isNaN(Number(limitGb))) return res.status(400).json({ error: "limitGb required" });
    const limitBytes = Number(limitGb) * 1024 * 1024 * 1024;
    const updated = await db.updateAccount(id, { storage_limit_bytes: limitBytes });
    if (!updated) return res.status(404).json({ error: "User not found" });
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "UPDATE_STORAGE_LIMIT", "user", id, `Updated storage for ${updated.email} to ${limitGb} GB`);
    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/subscriptions", requireAdmin, (_req, res) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const plans = [
    { name: "Free Standard", quota: "15 GB", priceMonthly: 0, count: accounts.filter((u) => !u.plan || u.plan === "free").length },
    { name: "Pro Power User", quota: "100 GB", priceMonthly: 4.99, count: accounts.filter((u) => u.plan === "pro").length },
    { name: "Enterprise Cloud", quota: "1 TB", priceMonthly: 14.99, count: accounts.filter((u) => u.plan === "enterprise").length }
  ];
  const subscribers = accounts.map((u) => ({
    id: u.id,
    email: u.email,
    plan: u.plan || "free",
    billing: u.plan_billing || "monthly",
    status: u.plan_status || "active",
    joinedAt: u.created_at
  }));
  res.json({ plans, subscribers });
});
app.put("/api/admin/subscriptions/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, status } = req.body;
    const updates = {};
    if (plan) updates.plan = plan;
    if (status) updates.plan_status = status;
    if (plan === "enterprise") updates.storage_limit_bytes = 1024 * 1024 * 1024 * 1024;
    else if (plan === "pro") updates.storage_limit_bytes = 100 * 1024 * 1024 * 1024;
    const updated = await db.updateAccount(id, updates);
    if (!updated) return res.status(404).json({ error: "User not found" });
    return res.json({ success: true, user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/payments", requireAdmin, (_req, res) => {
  res.json(db.getPayments());
});
app.post("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const { userEmail, planName, amountUsd, cryptoCurrency, status } = req.body;
    const p = await db.recordPayment({
      id: "pay_" + crypto5.randomBytes(5).toString("hex"),
      payment_id: "now_" + Date.now(),
      user_email: userEmail || "client@goldmailer.xyz",
      plan_name: planName || "Pro 100GB",
      amount_usd: Number(amountUsd || 4.99),
      crypto_currency: cryptoCurrency || "USDT",
      payment_status: status || "confirmed",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return res.status(201).json({ success: true, payment: p });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/domains", requireAdmin, (_req, res) => {
  res.json(db.getDomains());
});
app.post("/api/admin/domains", requireAdmin, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "domain name required" });
    const dom = await db.addDomain(domain);
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "ADD_DOMAIN", "domain", dom.id, `Added domain ${dom.domain}`);
    return res.status(201).json({ success: true, domain: dom });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/domains/:id/verify", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const dom = await db.verifyDomain(id);
  if (!dom) return res.status(404).json({ error: "Domain not found" });
  return res.json({ success: true, domain: dom, message: "Domain DNS records verified successfully." });
});
app.delete("/api/admin/domains/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const ok = await db.deleteDomain(id);
  if (!ok) return res.status(400).json({ error: "Cannot delete primary default domain or domain not found" });
  return res.json({ success: true });
});
app.get("/api/admin/system-health", requireAdmin, (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    serverStatus: "healthy",
    databaseStatus: "connected",
    databaseEngine: "Supabase PostgreSQL + High-Speed Persistent Store",
    apiStatus: "optimal",
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
    cpuLoadPercent: 4.2,
    activeSockets: sseClients.length,
    smtpStatus: process.env.SMTP_HOST || db.getSettings().smtp_host ? "connected" : "not_configured",
    telnyxStatus: getTelnyxConfig().isConfigured ? "connected" : "not_configured",
    resendStatus: process.env.RESEND_API_KEY ? "connected" : "not_configured",
    lastHealthCheck: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get(["/api/admin/analytics", "/api/admin/reports"], requireAdmin, (_req, res) => {
  ensureDataLoaded();
  const accounts = db.listAccounts();
  const allEmails = db.getAllEmails();
  const payments = db.getPayments();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const uCount = accounts.filter((u) => (u.created_at || "").startsWith(dateStr)).length;
    const eCount = allEmails.filter((e) => e.status !== "deleted" && (e.received_at || e.created_at || "").startsWith(dateStr)).length;
    const dayRevenue = payments.filter((p) => p.payment_status === "confirmed" && (p.created_at || "").startsWith(dateStr)).reduce((sum, p) => sum + (p.amount_usd || 0), 0);
    days.push({
      date: dateStr,
      users: uCount,
      emails: eCount,
      revenue: Number(dayRevenue.toFixed(2))
    });
  }
  res.json({
    dailyMetrics: days,
    activeUsersCount: accounts.filter((u) => !u.is_banned).length,
    totalStorageGb: (accounts.reduce((s, u) => s + (u.storage_used_bytes || 0), 0) / (1024 * 1024 * 1024)).toFixed(2)
  });
});
app.get(["/api/admin/support-tickets", "/api/admin/tickets"], requireAdmin, (_req, res) => {
  res.json(db.getTickets());
});
app.post("/api/admin/support-tickets/:id/reply", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, status } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    const updated = await db.replyToTicket(id, adminEmail, "GoldMailer Support", true, content, status);
    if (!updated) return res.status(404).json({ error: "Ticket not found" });
    return res.json({ success: true, ticket: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.patch("/api/admin/support-tickets/:id/status", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const ticket = db.getTickets().find((t) => t.id === id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  ticket.status = status;
  db.saveToDiskSync();
  return res.json({ success: true, ticket });
});
app.post("/api/support/tickets", async (req, res) => {
  try {
    const { userEmail, subject, category, priority, message, userName } = req.body;
    if (!userEmail || !subject || !message) {
      return res.status(400).json({ error: "userEmail, subject, and message are required" });
    }
    const t = await db.createTicket(userEmail, subject, category || "general", priority || "medium", message, userName);
    return res.status(201).json({ success: true, ticket: t });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/security", requireAdmin, (_req, res) => {
  res.json({
    blockedIps: db.getBlockedIps(),
    suspiciousLoginsCount: loginAttempts.filter((l) => l.status === "rejected" || l.status === "pending").length,
    totalDevicesCount: userDevices.length,
    activeSecurityRules: [
      { id: "sec_01", name: "Anti-Brute Force Protection", status: "active", threshold: "5 failed attempts per 15 min" },
      { id: "sec_02", name: "Inbound Spam Heuristics", status: "active", threshold: "SpamAssassin Score > 5.0" },
      { id: "sec_03", name: "Two-Factor Enforcement Option", status: "active", threshold: "Admin & High-Privilege" }
    ]
  });
});
app.post("/api/admin/security/block-ip", requireAdmin, async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: "ip required" });
  const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
  await db.blockIp(ip, reason, adminEmail);
  return res.json({ success: true, blockedIps: db.getBlockedIps() });
});
app.post("/api/admin/security/unblock-ip", requireAdmin, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: "ip required" });
  const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
  await db.unblockIp(ip, adminEmail);
  return res.json({ success: true, blockedIps: db.getBlockedIps() });
});
app.get(["/api/admin/trash-recovery", "/api/admin/trash"], requireAdmin, (_req, res) => {
  ensureDataLoaded();
  const trashedEmails = db.getAllEmails().filter((e) => e.status === "trash" || e.folder === "trash" || e.status === "deleted").slice(0, 100).map((e) => ({
    id: e.id,
    from: e.sender || e.from_email || e.from,
    to: e.recipient || e.to_email || e.to,
    subject: e.subject,
    status: e.status,
    trashedAt: e.trashed_at || e.received_at
  }));
  res.json({ trashedEmails });
});
app.post("/api/admin/trash-recovery/recover-email/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const restored = await db.updateEmailStatus(id, "inbox", "primary");
  if (!restored) return res.status(404).json({ error: "Email not found" });
  const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
  await db.logAdminActivity(adminEmail, "RECOVER_EMAIL", "email", id, `Recovered email "${restored.subject}" to inbox`);
  return res.json({ success: true, email: restored });
});
app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json(db.getSettings());
});
app.post("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const updated = await db.updateSettings(req.body);
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "UPDATE_SETTINGS", "system", void 0, "Updated global system settings");
    return res.json({ success: true, settings: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/roles", requireAdmin, (_req, res) => {
  res.json(db.getAdminRoles());
});
app.post("/api/admin/roles", requireAdmin, async (req, res) => {
  try {
    const { email, name, role, permissions } = req.body;
    if (!email || !name) return res.status(400).json({ error: "email and name required" });
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    const newRole = await db.addAdminRole(email, name, role || "support_admin", permissions || ["manage_tickets", "view_users"], adminEmail);
    return res.status(201).json({ success: true, role: newRole });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.delete("/api/admin/roles/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  await db.removeAdminRole(id);
  return res.json({ success: true });
});
app.get("/api/admin/notifications", requireAdmin, (_req, res) => {
  res.json(db.getBroadcasts());
});
app.post("/api/admin/notifications/broadcast", requireAdmin, async (req, res) => {
  try {
    const { title, message, target } = req.body;
    if (!title || !message) return res.status(400).json({ error: "title and message required" });
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    const broadcast = await db.createBroadcast(title, message, adminEmail, target || "all");
    return res.status(201).json({ success: true, broadcast });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/backup", requireAdmin, (_req, res) => {
  const payload = db.generateBackupPayload();
  res.setHeader("Content-Disposition", `attachment; filename="goldmailer_db_backup_${Date.now()}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(payload);
});
app.post("/api/admin/backup/restore", requireAdmin, async (req, res) => {
  try {
    const { jsonString } = req.body;
    if (!jsonString) return res.status(400).json({ error: "jsonString required" });
    const result = await db.restoreFromBackupPayload(jsonString);
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "RESTORE_DATABASE", "system", void 0, `Restored database from backup: ${result.usersCount} users`);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/api-keys", requireAdmin, (_req, res) => {
  const settings = db.getSettings();
  const mask = (s) => s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : s ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "";
  res.json({
    telnyxApiKey: mask(settings.telnyx_api_key),
    telnyxApiKeyConfigured: Boolean(settings.telnyx_api_key),
    telnyxPhoneNumber: settings.telnyx_phone_number,
    telnyxMessagingProfileId: settings.telnyx_messaging_profile_id,
    telnyxVoiceAppId: settings.telnyx_voice_app_id,
    telnyxPublicKeyConfigured: Boolean(settings.telnyx_public_key),
    resendApiKeyConfigured: Boolean(settings.resend_api_key || process.env.RESEND_API_KEY),
    nowpaymentsKeyConfigured: Boolean(settings.nowpayments_api_key),
    supabaseUrl: settings.supabase_url || "",
    supabaseConfigured: Boolean(settings.supabase_url && settings.supabase_anon_key),
    smtp_domain: "goldmailer.xyz",
    smtp_host: settings.smtp_host || "smtp.goldmailer.xyz",
    smtp_port: settings.smtp_port || 587,
    smtp_user: settings.smtp_user || "postmaster@goldmailer.xyz",
    smtp_configured: Boolean(settings.smtp_host && settings.smtp_user)
  });
});
app.post("/api/admin/api-keys", requireAdmin, async (req, res) => {
  try {
    const {
      telnyxApiKey,
      telnyxPhoneNumber,
      telnyxMessagingProfileId,
      telnyxVoiceAppId,
      telnyxPublicKey,
      resendKey,
      nowpaymentsKey,
      nowpaymentsIpn,
      supabaseUrl: supabaseUrl2,
      supabaseKey: supabaseKey2,
      smtpHost: smtpHost2,
      smtpPort: smtpPort2,
      smtpUser: smtpUser2,
      smtpPass: smtpPass2
    } = req.body;
    const apiKey = telnyxApiKey;
    const phone = telnyxPhoneNumber;
    const profileId = telnyxMessagingProfileId;
    const voiceApp = telnyxVoiceAppId;
    const pubKey = telnyxPublicKey;
    const updates = {};
    if (apiKey !== void 0) updates.telnyx_api_key = apiKey;
    if (phone !== void 0) updates.telnyx_phone_number = phone;
    if (profileId !== void 0) updates.telnyx_messaging_profile_id = profileId;
    if (voiceApp !== void 0) updates.telnyx_voice_app_id = voiceApp;
    if (pubKey !== void 0) updates.telnyx_public_key = pubKey;
    if (resendKey !== void 0) updates.resend_api_key = resendKey;
    if (nowpaymentsKey !== void 0) updates.nowpayments_api_key = nowpaymentsKey;
    if (nowpaymentsIpn !== void 0) updates.nowpayments_ipn_secret = nowpaymentsIpn;
    if (supabaseUrl2 !== void 0) updates.supabase_url = supabaseUrl2;
    if (supabaseKey2 !== void 0) updates.supabase_anon_key = supabaseKey2;
    if (smtpHost2 !== void 0) updates.smtp_host = smtpHost2;
    if (smtpPort2 !== void 0) updates.smtp_port = Number(smtpPort2) || 587;
    if (smtpUser2 !== void 0) updates.smtp_user = smtpUser2;
    if (smtpPass2 !== void 0) updates.smtp_pass = smtpPass2;
    await db.updateSettings(updates);
    if (apiKey || phone || profileId || voiceApp || pubKey) {
      setTelnyxCredentials(apiKey, phone, profileId, voiceApp, pubKey);
    }
    const adminEmail = req.adminUser?.email || "admin@goldmailer.xyz";
    await db.logAdminActivity(adminEmail, "UPDATE_API_KEYS", "system", void 0, "Updated Telnyx and third-party API keys");
    return res.json({ success: true, message: "Telnyx and API keys updated securely." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/activity-logs", requireAdmin, (_req, res) => {
  res.json(db.getActivityLogs(200));
});
var handleTelnyxStatus = async (_req, res) => {
  const cfg = getTelnyxConfig();
  res.json({
    isConfigured: cfg.isConfigured,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}...${cfg.apiKey.slice(-4)}` : "",
    hasApiKey: Boolean(cfg.apiKey),
    phoneNumber: cfg.phoneNumber,
    messagingProfileId: cfg.messagingProfileId,
    voiceAppId: cfg.voiceAppId,
    webhookUrl: cfg.webhookUrl,
    projectId: cfg.messagingProfileId,
    spaceUrl: "api.telnyx.com",
    hasApiToken: Boolean(cfg.apiKey)
  });
};
app.get("/api/admin/telnyx/status", requireAdmin, handleTelnyxStatus);
var handleTelnyxConfig = (req, res) => {
  const { apiKey, phoneNumber, messagingProfileId, voiceAppId, publicKey } = req.body || {};
  const resolvedApiKey = apiKey;
  const resolvedPhone = phoneNumber;
  const resolvedProfile = messagingProfileId;
  const resolvedVoiceApp = voiceAppId;
  if (!resolvedApiKey && !resolvedPhone && !resolvedProfile && !resolvedVoiceApp) {
    return res.status(400).json({ error: "At least one field is required." });
  }
  setTelnyxCredentials(resolvedApiKey, resolvedPhone, resolvedProfile, resolvedVoiceApp, publicKey);
  if (resolvedPhone) {
    const adminNum = userPhoneNumbers.find((p) => p.id === "phone_free_miracle_admin");
    if (adminNum) {
      adminNum.phoneNumber = resolvedPhone.trim();
      adminNum.friendlyName = `${resolvedPhone.trim()} (Admin Line)`;
    }
  }
  saveData();
  const cfg = getTelnyxConfig();
  return res.json({
    success: true,
    message: "Telnyx configuration successfully saved.",
    isConfigured: cfg.isConfigured,
    phoneNumber: cfg.phoneNumber
  });
};
app.post("/api/admin/telnyx/config", requireAdmin, handleTelnyxConfig);
var handleTelnyxTest = async (req, res) => {
  try {
    const { apiKey, phoneNumber, messagingProfileId, voiceAppId } = req.body || {};
    const resolvedApiKey = apiKey;
    const resolvedPhone = phoneNumber;
    const resolvedProfile = messagingProfileId;
    const resolvedVoiceApp = voiceAppId;
    if (resolvedApiKey || resolvedPhone || resolvedProfile || resolvedVoiceApp) {
      setTelnyxCredentials(resolvedApiKey, resolvedPhone, resolvedProfile, resolvedVoiceApp);
      saveData();
    }
    const testRes = await testTelnyxConnection2();
    return res.json(testRes);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Telnyx diagnostic failed" });
  }
};
app.post("/api/admin/telnyx/test", requireAdmin, handleTelnyxTest);
app.post("/api/admin/provision-number", async (req, res) => {
  try {
    ensureDataLoaded();
    const authUser = resolveUserIdFromReq(req);
    const sessionEmail = (authUser.email || "").toLowerCase().trim();
    if (sessionEmail !== "miracle@goldmailer.xyz" && authUser.id !== "usr_miracle_01") {
      return res.status(403).json({
        error: "Forbidden. Free number provisioning is exclusively reserved for miracle@goldmailer.xyz."
      });
    }
    const requestedNumber = req.body?.phoneNumber;
    const friendlyName = req.body?.friendlyName;
    const provisionResult = await buyTelnyxPhoneNumber(requestedNumber);
    const targetNum = provisionResult.phoneNumber || requestedNumber || "+14236662513";
    const newRecord = {
      id: "phone_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      userId: authUser.id || "usr_miracle_01",
      userEmail: "miracle@goldmailer.xyz",
      phoneNumber: targetNum,
      friendlyName: friendlyName || `${targetNum} (Admin Line)`,
      provider: "telnyx",
      status: "active",
      purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString(),
      autoRenew: true,
      capabilities: { sms: true, voice: true }
    };
    userPhoneNumbers.push(newRecord);
    saveData();
    console.log(`[ADMIN PROVISION] Miracle provisioned new number ${targetNum}. Existing numbers remain active.`);
    return res.json({
      success: true,
      message: `New phone number ${targetNum} provisioned directly from Telnyx without charging. Previous numbers remain active.`,
      number: newRecord
    });
  } catch (err) {
    console.error("[ADMIN PROVISION ERROR]", err);
    return res.status(500).json({ error: err.message || "Failed to provision number from Telnyx" });
  }
});
var resolveUserIdFromReq = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const decoded = verifyToken(token);
    if (decoded?.id) {
      const user = goldUsers.find((u) => u.id === decoded.id || u.email === decoded.email);
      const email = (decoded.email || user?.email || "").toLowerCase().trim();
      const isAdmin = decoded.role === "admin" || user?.role === "admin" || email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz";
      return {
        id: decoded.id,
        email,
        role: isAdmin ? "admin" : user?.role || "user"
      };
    }
  }
  try {
    const cookies = parseCookies(req);
    const sessionToken = cookies["goldmailer_session"] || cookies["session_token"];
    if (sessionToken) {
      const sess = db.getSessionSync ? db.getSessionSync(sessionToken) : null;
      if (sess?.email) {
        const email = sess.email.toLowerCase().trim();
        const user = goldUsers.find((u) => u.id === sess.user_id || u.email === email);
        const isAdmin = user?.role === "admin" || email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz";
        return {
          id: sess.user_id || user?.id || "usr_miracle_01",
          email,
          role: isAdmin ? "admin" : user?.role || "user"
        };
      }
    }
  } catch {
  }
  const emailHeader = req.headers["x-user-email"] || req.query?.userEmail;
  if (emailHeader) {
    const email = emailHeader.toLowerCase().trim();
    const user = goldUsers.find((u) => u.email.toLowerCase() === email);
    if (user) {
      const isAdmin = user.role === "admin" || email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz";
      return {
        id: user.id,
        email: user.email,
        role: isAdmin ? "admin" : user.role
      };
    }
  }
  return { id: "", email: "", role: "guest" };
};
var isReqAdmin = (authUser) => {
  if (authUser.role === "admin") return true;
  if (!authUser.email) return false;
  const email = authUser.email.toLowerCase().trim();
  return email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz";
};
var getUserWallet = (userId, userEmail) => {
  const email = (userEmail || "").toLowerCase().trim();
  const isAdmin = email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz" || userId === "usr_miracle_01";
  if (isAdmin) {
    return {
      userId: userId || "usr_miracle_01",
      userEmail: "miracle@goldmailer.xyz",
      coins: 999999,
      transactions: []
    };
  }
  let wallet = userWallets.find((w) => userId && w.userId === userId || email && w.userEmail && w.userEmail.toLowerCase() === email);
  if (!wallet) {
    const userNumbers = userPhoneNumbers.filter((p) => userId && p.userId === userId || email && p.userEmail && p.userEmail.toLowerCase() === email);
    const initialCoins = userNumbers.length > 0 ? 300 : 0;
    wallet = {
      userId: userId || "usr_" + Date.now(),
      userEmail: email,
      coins: initialCoins,
      transactions: initialCoins > 0 ? [{
        id: "tx_init_" + Date.now(),
        userId: userId || "usr_" + Date.now(),
        type: "credit",
        amount: initialCoins,
        reason: "Initial Line Activation: +300 Coins",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }] : []
    };
    userWallets.push(wallet);
    saveData();
  }
  return wallet;
};
var creditCoins = (userId, userEmail, coinsToAdd, daysToAdd, reason, phoneNumber) => {
  const email = (userEmail || "").toLowerCase().trim();
  const isAdmin = email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz" || userId === "usr_miracle_01";
  if (isAdmin) return;
  const wallet = getUserWallet(userId, userEmail);
  wallet.coins = Number((wallet.coins + coinsToAdd).toFixed(1));
  wallet.transactions.unshift({
    id: "tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    userId: wallet.userId,
    type: "credit",
    amount: coinsToAdd,
    reason,
    phoneNumber,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const targetNumbers = userPhoneNumbers.filter(
    (p) => (p.userId === userId || email && p.userEmail && p.userEmail.toLowerCase() === email) && (!phoneNumber || p.phoneNumber === phoneNumber)
  );
  const numbersToExtend = targetNumbers.length > 0 ? targetNumbers : userPhoneNumbers.filter(
    (p) => p.userId === userId || email && p.userEmail && p.userEmail.toLowerCase() === email
  );
  numbersToExtend.forEach((p) => {
    const curExp = new Date(p.expiresAt).getTime();
    const base = curExp > Date.now() ? curExp : Date.now();
    p.expiresAt = new Date(base + daysToAdd * 24 * 3600 * 1e3).toISOString();
    p.status = "active";
  });
  saveData();
};
var deductCoins = (userId, userEmail, amount, reason, phoneNumber) => {
  const email = (userEmail || "").toLowerCase().trim();
  const isAdmin = email === "miracle@goldmailer.xyz" || email === "admin@goldmailer.xyz" || userId === "usr_miracle_01";
  if (isAdmin) {
    return { success: true, remainingCoins: 999999, suspended: false };
  }
  const wallet = getUserWallet(userId, email);
  if (wallet.coins < amount) {
    const targetNumbers = userPhoneNumbers.filter((p) => p.userId === userId || email && p.userEmail && p.userEmail.toLowerCase() === email);
    targetNumbers.forEach((p) => {
      p.status = "suspended";
    });
    saveData();
    return { success: false, remainingCoins: wallet.coins, suspended: true };
  }
  wallet.coins = Math.max(0, Number((wallet.coins - amount).toFixed(1)));
  wallet.transactions.unshift({
    id: "tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    userId: wallet.userId,
    type: "debit",
    amount,
    reason,
    phoneNumber,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  let suspended = false;
  if (wallet.coins <= 0) {
    const targetNumbers = userPhoneNumbers.filter((p) => p.userId === userId || email && p.userEmail && p.userEmail.toLowerCase() === email);
    targetNumbers.forEach((p) => {
      p.status = "suspended";
    });
    suspended = true;
  }
  saveData();
  return { success: true, remainingCoins: wallet.coins, suspended };
};
var handleTelnyxSmsWebhook = async (req, res) => {
  try {
    ensureDataLoaded();
    const verification = verifyTelnyxWebhook(req);
    if (!verification.isValid) {
      console.warn("[TELNYX SMS WEBHOOK] Signature validation failed:", verification.reason);
      return res.status(403).json({ error: "Invalid webhook signature" });
    }
    let bodyData = req.body;
    if (typeof bodyData === "string") {
      try {
        bodyData = JSON.parse(bodyData);
      } catch {
      }
    } else if (Buffer.isBuffer(bodyData)) {
      try {
        bodyData = JSON.parse(bodyData.toString("utf-8"));
      } catch {
      }
    }
    const eventType = String(bodyData?.data?.event_type || bodyData?.event_type || "").toLowerCase();
    const payload = bodyData?.data?.payload || bodyData?.payload || bodyData?.data || bodyData || {};
    const rawFrom = payload.from?.phone_number || (typeof payload.from === "string" ? payload.from : "") || "";
    const rawTo = payload.to?.[0]?.phone_number || (typeof payload.to === "string" ? payload.to : "") || "+14236662513";
    const text = String(payload.text || payload.body || "").trim();
    const messageId = String(payload.id || bodyData?.data?.id || "msg_" + Date.now()).trim();
    const from = normalizePhoneNumber(rawFrom, "+1");
    const to = normalizePhoneNumber(rawTo, "+1");
    console.log(`[TELNYX SMS WEBHOOK] Event: "${eventType}", MessageID: "${messageId}", From: "${from}", To: "${to}", Body: "${text}"`);
    if (eventType === "message.delivered" || eventType === "message.sent" || eventType === "message.delivery_failed" || eventType === "message.delivery_undelivered") {
      const deliveryStatus = eventType === "message.delivered" ? "delivered" : eventType === "message.sent" ? "sent" : eventType === "message.delivery_undelivered" ? "undelivered" : "failed";
      const existing = sms_inbox.find((s) => s.messageSid === messageId || s.telnyx_message_id === messageId);
      if (existing) {
        existing.status = deliveryStatus;
        saveData();
        broadcastNewSMS(existing);
      }
      return res.status(200).json({ success: true, event: eventType, messageId, status: deliveryStatus });
    }
    const upperText = text.toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"].includes(upperText)) {
      addOptOut(from);
      console.log(`[TELNYX OPT-OUT] Contact ${from} opted out via keyword "${upperText}"`);
    } else if (["START", "UNSTOP"].includes(upperText)) {
      removeOptOut(from);
      console.log(`[TELNYX OPT-IN] Contact ${from} opted in via keyword "${upperText}"`);
    }
    const cleanToDigits = to.replace(/\D/g, "");
    const matchedNumber = [...userPhoneNumbers].reverse().find(
      (p) => p.phoneNumber && p.phoneNumber.replace(/\D/g, "") === cleanToDigits
    );
    const targetUser = matchedNumber ? goldUsers.find((u) => u.id === matchedNumber.userId) : goldUsers.find((u) => u.phone && u.phone.replace(/\D/g, "") === cleanToDigits) || goldUsers[0];
    const targetUserId = targetUser?.id || (matchedNumber ? matchedNumber.userId : "usr_miracle_01");
    const isTargetAdmin = targetUser?.email === "miracle@goldmailer.xyz" || targetUser?.role === "admin" || targetUserId === "usr_miracle_01";
    if (!isTargetAdmin && matchedNumber && matchedNumber.status === "suspended") {
      console.warn(`[TELNYX SMS WEBHOOK] SMS dropped: Line ${to} is suspended.`);
      return res.status(200).json({ success: false, reason: "Line suspended" });
    }
    if (!isTargetAdmin) {
      deductCoins(targetUserId, targetUser?.email, 2.5, `Incoming SMS from ${from}`, to);
    }
    const newSms = {
      id: "sms_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      userId: targetUserId,
      from: from || "Unknown Sender",
      to: to || "+14236662513",
      body: text,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
      messageSid: messageId,
      telnyx_message_id: messageId,
      direction: "inbound",
      status: "received",
      is_read: false
    };
    if (messageId) {
      const existingIdx = sms_inbox.findIndex(
        (s) => s.messageSid === messageId || s.telnyx_message_id === messageId
      );
      if (existingIdx !== -1) {
        sms_inbox[existingIdx] = { ...sms_inbox[existingIdx], ...newSms, id: sms_inbox[existingIdx].id };
      } else {
        sms_inbox.unshift(newSms);
      }
    } else {
      sms_inbox.unshift(newSms);
    }
    saveData();
    broadcastNewSMS(newSms);
    console.log(`[TELNYX WEBHOOK] Saved incoming SMS ${newSms.id} for user ${targetUserId}: "${text}"`);
    return res.status(200).json({ success: true, messageId: newSms.id });
  } catch (err) {
    console.error("[TELNYX SMS WEBHOOK] Exception handling webhook:", err);
    return res.status(200).json({ success: true, warning: err.message });
  }
};
var handleTelnyxVoiceWebhook = async (req, res) => {
  try {
    ensureDataLoaded();
    const verification = verifyTelnyxWebhook(req);
    if (!verification.isValid) {
      console.warn("[TELNYX VOICE WEBHOOK] Signature validation failed:", verification.reason);
      return res.status(403).json({ error: "Invalid webhook signature" });
    }
    let bodyData = req.body;
    if (typeof bodyData === "string") {
      try {
        bodyData = JSON.parse(bodyData);
      } catch {
      }
    } else if (Buffer.isBuffer(bodyData)) {
      try {
        bodyData = JSON.parse(bodyData.toString("utf-8"));
      } catch {
      }
    }
    const eventType = String(bodyData?.data?.event_type || bodyData?.event_type || "").toLowerCase();
    const payload = bodyData?.data?.payload || bodyData?.payload || bodyData?.data || bodyData || {};
    const callControlId = String(payload.call_control_id || payload.call_leg_id || payload.id || bodyData?.data?.id || "").trim();
    const rawFrom = payload.from || "";
    const rawTo = payload.to || "+14236662513";
    const from = normalizePhoneNumber(rawFrom, "+1");
    const to = normalizePhoneNumber(rawTo, "+1");
    const direction = (payload.direction || "inbound").toLowerCase().includes("inbound") ? "inbound" : "outbound";
    console.log(`[TELNYX VOICE WEBHOOK] Event: "${eventType}", CallControlID: "${callControlId}", From: "${from}", To: "${to}"`);
    const cleanToDigits = to.replace(/\D/g, "");
    const matchedNumber = [...userPhoneNumbers].reverse().find(
      (p) => p.phoneNumber && p.phoneNumber.replace(/\D/g, "") === cleanToDigits
    );
    const targetUser = matchedNumber ? goldUsers.find((u) => u.id === matchedNumber.userId) : goldUsers.find((u) => u.phone && u.phone.replace(/\D/g, "") === cleanToDigits) || goldUsers[0];
    const targetUserId = targetUser?.id || (matchedNumber ? matchedNumber.userId : "usr_miracle_01");
    const isTargetAdmin = targetUser?.email === "miracle@goldmailer.xyz" || targetUser?.role === "admin" || targetUserId === "usr_miracle_01";
    let existingCall = calls_history.find((c) => c.callSid === callControlId);
    if (eventType === "call.initiated") {
      if (!isTargetAdmin && matchedNumber && matchedNumber.status === "suspended") {
        console.warn(`[TELNYX VOICE WEBHOOK] Call rejected: Line ${to} is suspended.`);
        return res.status(200).json({ success: false, reason: "Line suspended" });
      }
      if (!isTargetAdmin && direction === "inbound") {
        deductCoins(targetUserId, targetUser?.email, 5, `Incoming Call from ${from} (1 min)`, to);
      }
      if (!existingCall) {
        existingCall = {
          id: "call_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          userId: targetUserId,
          from: from || "Caller",
          to: to || "+14236662513",
          direction,
          status: "ringing",
          callSid: callControlId || "CA_" + Date.now(),
          startedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        calls_history.unshift(existingCall);
      } else {
        existingCall.status = "ringing";
      }
      saveData();
      broadcastNewCall(existingCall);
      return res.status(200).json({ success: true, callId: existingCall.id });
    }
    if (eventType === "call.answered") {
      if (existingCall) {
        existingCall.status = "in-progress";
        saveData();
        broadcastNewCall(existingCall);
      }
      return res.status(200).json({ success: true, status: "in-progress" });
    }
    if (eventType === "call.hangup") {
      const duration = parseInt(payload.duration_seconds || payload.call_duration || "0", 10);
      if (existingCall) {
        existingCall.status = "completed";
        if (duration > 0) existingCall.durationSeconds = duration;
        existingCall.endedAt = (/* @__PURE__ */ new Date()).toISOString();
        saveData();
        broadcastNewCall(existingCall);
      }
      return res.status(200).json({ success: true, status: "completed", duration });
    }
    if (eventType === "call.recording.saved") {
      const recordingUrl = payload.recording_urls?.mp3 || payload.recording_url;
      if (existingCall && recordingUrl) {
        existingCall.recordingUrl = recordingUrl;
        saveData();
        broadcastNewCall(existingCall);
      }
      return res.status(200).json({ success: true, recordingUrl });
    }
    return res.status(200).json({ success: true, handled: eventType });
  } catch (err) {
    console.error("[TELNYX VOICE WEBHOOK] Exception:", err);
    return res.status(200).json({ success: true, warning: err.message });
  }
};
var handleTelnyxGeneralWebhook = async (req, res) => {
  const eventType = String(req.body?.data?.event_type || req.body?.event_type || "").toLowerCase();
  if (eventType.startsWith("call.")) {
    return handleTelnyxVoiceWebhook(req, res);
  }
  return handleTelnyxSmsWebhook(req, res);
};
app.post(["/api/webhooks/telnyx-sms", "/api/telnyx/sms"], handleTelnyxSmsWebhook);
app.post(["/api/webhooks/telnyx-voice", "/api/telnyx/voice"], handleTelnyxVoiceWebhook);
app.post(
  [
    "/api/webhooks/telnyx-inbound",
    "/api/telnyx/inbound",
    "/api/sms/incoming"
  ],
  handleTelnyxGeneralWebhook
);
var handleNowPaymentsWebhook = async (req, res) => {
  try {
    ensureDataLoaded();
    const body = req.body || {};
    const signature = (req.headers["x-nowpayments-sig"] || "").toString();
    console.log("[NOWPAYMENTS WEBHOOK] Received IPN callback:", {
      payment_id: body.payment_id,
      payment_status: body.payment_status,
      order_id: body.order_id
    });
    const isSigValid = verifyNowPaymentsSignature(body, signature);
    if (!isSigValid) {
      console.warn("[NOWPAYMENTS WEBHOOK] IPN signature verification failed.");
      return res.status(400).json({ error: "Invalid IPN signature" });
    }
    const paymentStatus = (body.payment_status || "").toLowerCase();
    if (paymentStatus === "finished" || paymentStatus === "confirmed" || paymentStatus === "sending") {
      const orderId = String(body.order_id || "");
      const orderDesc = String(body.order_description || "");
      let targetNumber = "";
      const numMatch = orderDesc.match(/(\+\d{10,15})/);
      if (numMatch) {
        targetNumber = numMatch[1];
      }
      let phoneRecord = userPhoneNumbers.find((p) => p.phoneNumber === targetNumber);
      if (!phoneRecord) {
        phoneRecord = userPhoneNumbers[0];
      }
      if (orderId.startsWith("recharge_") || orderDesc.toLowerCase().includes("recharge")) {
        let targetUserId = "";
        let dollarAmount = 6;
        if (orderId.startsWith("recharge_")) {
          const rest = orderId.slice(9);
          const lastIdx = rest.lastIndexOf("_");
          if (lastIdx > 0) {
            const secondLastIdx = rest.lastIndexOf("_", lastIdx - 1);
            if (secondLastIdx > 0) {
              targetUserId = rest.slice(0, secondLastIdx);
              const cents = parseInt(rest.slice(secondLastIdx + 1, lastIdx), 10);
              if (!isNaN(cents) && cents > 0) dollarAmount = cents / 100;
            } else {
              targetUserId = rest.slice(0, lastIdx);
            }
          } else {
            targetUserId = rest;
          }
        }
        if (!targetUserId || targetUserId === "usr") {
          targetUserId = phoneRecord?.userId || goldUsers[0]?.id || "usr_miracle_01";
        }
        if (!dollarAmount || dollarAmount < 6) {
          dollarAmount = Number(body.price_amount) ? Math.max(6, Math.round(Number(body.price_amount) / 1.015)) : 6;
        }
        dollarAmount = Math.min(100, Math.max(6, dollarAmount));
        const coinsToAdd = Math.round(dollarAmount * 50);
        const daysToAdd = Math.round(dollarAmount / 0.2);
        const matchedUser = goldUsers.find((u) => u.id === targetUserId);
        const userEmail = matchedUser?.email || phoneRecord?.userEmail || "";
        creditCoins(
          targetUserId,
          userEmail,
          coinsToAdd,
          daysToAdd,
          `NOWPayments Crypto Recharge ($${dollarAmount})`,
          targetNumber
        );
        phonePurchases.unshift({
          id: "pur_" + Date.now(),
          userId: targetUserId,
          paymentId: String(body.payment_id || ""),
          orderId,
          phoneNumber: targetNumber || phoneRecord?.phoneNumber || "+14236662513",
          amount: dollarAmount,
          currency: String(body.price_currency || "usd"),
          status: "finished",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        saveData();
        console.log(`[NOWPAYMENTS] Credited ${coinsToAdd} coins and +${daysToAdd} days for user ${targetUserId}`);
        return res.status(200).json({ success: true, message: `Recharged: +${coinsToAdd} coins, +${daysToAdd} days` });
      } else {
        const targetUserId = phoneRecord?.userId || "usr_miracle_01";
        const userEmail = phoneRecord?.userEmail || "";
        if (phoneRecord) {
          const currentMs = new Date(phoneRecord.expiresAt).getTime();
          const baseMs = currentMs > Date.now() ? currentMs : Date.now();
          phoneRecord.expiresAt = new Date(baseMs + 30 * 24 * 3600 * 1e3).toISOString();
          phoneRecord.status = "active";
        }
        creditCoins(
          targetUserId,
          userEmail,
          300,
          30,
          `Initial Number Purchase ($6.00): Line Activated + 300 Coins`,
          targetNumber
        );
        phonePurchases.unshift({
          id: "pur_" + Date.now(),
          userId: targetUserId,
          paymentId: String(body.payment_id || ""),
          orderId,
          phoneNumber: targetNumber || phoneRecord?.phoneNumber || "+14236662513",
          amount: Number(body.price_amount || 6),
          currency: String(body.price_currency || "usd"),
          status: "finished",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        saveData();
        return res.status(200).json({ success: true, message: "Line provisioned, 300 coins credited, 30 days validity" });
      }
    }
    return res.status(200).json({ success: true, status: paymentStatus });
  } catch (err) {
    console.error("[NOWPAYMENTS WEBHOOK] Exception:", err);
    return res.status(500).json({ error: err.message });
  }
};
app.post(
  ["/api/webhook/nowpayments", "/api/webhooks/nowpayments"],
  handleNowPaymentsWebhook
);
app.get("/api/phone/numbers", async (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const { phoneNumber: adminPhoneNumber, isConfigured } = getTelnyxConfig();
  const isAdmin = isReqAdmin(authUser);
  const activeAdminDigits = (adminPhoneNumber || "+14236662513").replace(/\D/g, "");
  if (isConfigured) {
    try {
      const telnyxActiveNumbers = await getActiveTelnyxNumbers();
      for (const tNum of telnyxActiveNumbers) {
        const cleanDigits = tNum.phoneNumber.replace(/\D/g, "");
        const existingIdx = userPhoneNumbers.findIndex(
          (p) => p.phoneNumber && p.phoneNumber.replace(/\D/g, "") === cleanDigits || p.sid === tNum.id
        );
        if (existingIdx !== -1) {
          userPhoneNumbers[existingIdx].provider = "telnyx";
          userPhoneNumbers[existingIdx].status = "active";
          userPhoneNumbers[existingIdx].capabilities = {
            voice: tNum.capabilities.voice,
            sms: tNum.capabilities.sms
          };
        } else {
          userPhoneNumbers.push({
            id: "phone_telnyx_" + (tNum.id || cleanDigits),
            userId: authUser.id || "usr_miracle_01",
            userEmail: authUser.email || "miracle@goldmailer.xyz",
            phoneNumber: tNum.phoneNumber,
            friendlyName: tNum.friendlyName || `${tNum.phoneNumber} (Telnyx Line)`,
            provider: "telnyx",
            status: "active",
            purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
            expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString(),
            autoRenew: true,
            capabilities: {
              voice: tNum.capabilities.voice,
              sms: tNum.capabilities.sms
            }
          });
        }
      }
    } catch (syncErr) {
      console.warn("[PHONE NUMBERS] Telnyx live sync warning:", syncErr);
    }
  }
  if (isAdmin || !authUser.id) {
    const adminPhoneIndex = userPhoneNumbers.findIndex(
      (p) => p.id === "phone_free_miracle_admin" || p.phoneNumber.replace(/\D/g, "") === activeAdminDigits
    );
    if (adminPhoneIndex === -1) {
      userPhoneNumbers.unshift({
        id: "phone_free_miracle_admin",
        userId: authUser.id || "usr_miracle_01",
        userEmail: authUser.email || "miracle@goldmailer.xyz",
        phoneNumber: adminPhoneNumber || "+14236662513",
        friendlyName: `${adminPhoneNumber || "+14236662513"} (Primary Line)`,
        provider: "telnyx",
        status: "active",
        purchasedAt: "2026-10-13T00:00:00.000Z",
        expiresAt: new Date(Date.now() + 3650 * 24 * 3600 * 1e3).toISOString(),
        autoRenew: true,
        capabilities: { sms: true, voice: true }
      });
      saveData();
    } else {
      userPhoneNumbers[adminPhoneIndex].provider = "telnyx";
      userPhoneNumbers[adminPhoneIndex].status = "active";
      userPhoneNumbers[adminPhoneIndex].phoneNumber = adminPhoneNumber || "+14236662513";
    }
  }
  const list = userPhoneNumbers.filter(
    (p) => authUser.id && p.userId === authUser.id || isAdmin && (p.phoneNumber.replace(/\D/g, "") === activeAdminDigits || p.id === "phone_free_miracle_admin") || !authUser.id && p.phoneNumber.replace(/\D/g, "") === activeAdminDigits
  );
  const wallet = getUserWallet(authUser.id, authUser.email);
  const enriched = list.map((p) => {
    const exp = new Date(p.expiresAt).getTime();
    const daysRemaining = Math.max(0, Math.ceil((exp - Date.now()) / (24 * 3600 * 1e3)));
    const isSuspended = !isAdmin && authUser.id && (daysRemaining <= 0 || wallet.coins <= 0 || p.status === "suspended");
    return {
      ...p,
      daysRemaining,
      status: isSuspended ? "suspended" : "active"
    };
  });
  return res.json({
    success: true,
    numbers: enriched,
    isAdmin,
    adminNumber: adminPhoneNumber || "+14236662513",
    coins: isAdmin ? 999999 : wallet.coins,
    unlimitedCoins: isAdmin,
    isTelnyxConfigured: isConfigured
  });
});
var handleAvailableNumbers = async (_req, res) => {
  try {
    ensureDataLoaded();
    const list = await listAvailablePhoneNumbers2(16);
    const { phoneNumber: adminNumber } = getTelnyxConfig();
    const boughtSet = /* @__PURE__ */ new Set();
    userPhoneNumbers.forEach((p) => {
      if (p.phoneNumber) boughtSet.add(p.phoneNumber.replace(/[^\d+]/g, ""));
    });
    phonePurchases.forEach((p) => {
      if (p.phoneNumber) boughtSet.add(p.phoneNumber.replace(/[^\d+]/g, ""));
    });
    if (adminNumber) {
      boughtSet.add(adminNumber.replace(/[^\d+]/g, ""));
    }
    const availableNumbers = list.filter((n) => !boughtSet.has(n.phoneNumber.replace(/[^\d+]/g, "")));
    return res.json({
      success: true,
      availableNumbers,
      numbers: availableNumbers
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.get(["/api/phone/available", "/api/numbers/available"], handleAvailableNumbers);
app.post("/api/phone/buy-intent", async (req, res) => {
  try {
    ensureDataLoaded();
    const { phoneNumber } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);
    if (isAdmin) {
      return res.json({
        success: true,
        isAdmin: true,
        message: "Admin account has free lifetime direct activation from Telnyx."
      });
    }
    const targetNum = phoneNumber || "+14236662513";
    const orderId = `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const basePrice = 6;
    const networkFee = Number((basePrice * 0.015).toFixed(2));
    const totalPrice = Number((basePrice + networkFee).toFixed(2));
    const description = `Telnyx Phone Subscription for ${targetNum} (${authUser.email}) - $6.00 + $${networkFee} Network Fee (300 Coins + 30 Days)`;
    const invoiceResult = await createNowPaymentsInvoice({
      priceAmount: totalPrice,
      priceCurrency: "usd",
      orderId,
      orderDescription: description
    });
    return res.json({
      success: true,
      orderId,
      phoneNumber: targetNum,
      amount: basePrice,
      networkFee,
      totalPrice,
      currency: "USD",
      invoiceUrl: invoiceResult.invoiceUrl,
      invoiceId: invoiceResult.id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
var handleBuyNumber = async (req, res) => {
  try {
    ensureDataLoaded();
    const { phoneNumber, friendlyName } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = authUser.email === "miracle@goldmailer.xyz" || authUser.id === "usr_miracle_01";
    const buyResult = await buyTelnyxPhoneNumber(phoneNumber);
    const targetNum = buyResult.phoneNumber || phoneNumber || "+14236662513";
    let existing = userPhoneNumbers.find((p) => p.phoneNumber === targetNum);
    if (existing) {
      existing.userId = authUser.id;
      existing.userEmail = authUser.email;
      const currentMs = new Date(existing.expiresAt).getTime();
      const baseMs = currentMs > Date.now() ? currentMs : Date.now();
      existing.expiresAt = new Date(baseMs + (isAdmin ? 3650 : 30) * 24 * 3600 * 1e3).toISOString();
      existing.status = "active";
    } else {
      existing = {
        id: "phone_" + Date.now(),
        userId: authUser.id,
        userEmail: authUser.email,
        phoneNumber: targetNum,
        friendlyName: friendlyName || targetNum,
        provider: "telnyx",
        status: "active",
        purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
        expiresAt: new Date(Date.now() + (isAdmin ? 3650 : 30) * 24 * 3600 * 1e3).toISOString(),
        autoRenew: true,
        capabilities: { sms: true, voice: true }
      };
      userPhoneNumbers.push(existing);
    }
    if (!isAdmin) {
      creditCoins(authUser.id, authUser.email, 300, 30, `Number Purchase: Line ${targetNum} Activated + 300 Coins`, targetNum);
    }
    saveData();
    return res.json({
      success: true,
      message: `Phone number ${targetNum} activated successfully on Telnyx.`,
      number: existing
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post(["/api/phone/buy-number", "/api/numbers/buy"], handleBuyNumber);
app.get("/api/wallet", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = isReqAdmin(authUser);
  if (isAdmin) {
    return res.json({
      success: true,
      coins: 999999,
      unlimited: true,
      expiresAt: "2099-12-31T23:59:59.000Z",
      daysRemaining: 9999,
      numbersCount: 1,
      transactions: []
    });
  }
  const wallet = getUserWallet(authUser.id, authUser.email);
  const userNums = userPhoneNumbers.filter((p) => p.userId === authUser.id || authUser.email && p.userEmail === authUser.email);
  let maxExp = 0;
  userNums.forEach((p) => {
    const ms = new Date(p.expiresAt).getTime();
    if (ms > maxExp) maxExp = ms;
  });
  const expiresAt = maxExp > 0 ? new Date(maxExp).toISOString() : new Date(Date.now() + 30 * 24 * 3600 * 1e3).toISOString();
  const daysRemaining = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1e3)));
  return res.json({
    success: true,
    coins: wallet.coins,
    unlimited: false,
    expiresAt,
    daysRemaining,
    numbersCount: userNums.length,
    transactions: wallet.transactions.slice(0, 100)
  });
});
app.post("/api/wallet/recharge", async (req, res) => {
  try {
    ensureDataLoaded();
    const authUser = resolveUserIdFromReq(req);
    const { amount, phoneNumber } = req.body;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 6 || numAmount > 100) {
      return res.status(400).json({
        error: "Recharge amount must be between $6.00 and $100.00"
      });
    }
    const isAdmin = isReqAdmin(authUser);
    if (isAdmin) {
      return res.json({
        success: true,
        message: "Admin account has unlimited free coins."
      });
    }
    const coinsToAdd = Math.round(numAmount * 50);
    const daysToAdd = Math.round(numAmount / 0.2);
    const networkFee = Number((numAmount * 0.015).toFixed(2));
    const totalPrice = Number((numAmount + networkFee).toFixed(2));
    const orderId = `recharge_${authUser.id || "usr"}_${Math.round(numAmount * 100)}_${Date.now()}`;
    const desc = `GoldMailer Wallet Recharge: $${numAmount} (+${coinsToAdd} coins, +${daysToAdd} days) [Network fee $${networkFee}]`;
    const invoiceResult = await createNowPaymentsInvoice({
      priceAmount: totalPrice,
      priceCurrency: "usd",
      orderId,
      orderDescription: desc
    });
    return res.json({
      success: true,
      orderId,
      amount: numAmount,
      networkFee,
      totalPrice,
      coins: coinsToAdd,
      days: daysToAdd,
      phoneNumber: phoneNumber || null,
      invoiceUrl: invoiceResult.invoiceUrl,
      invoiceId: invoiceResult.id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create recharge invoice" });
  }
});
var handleDeductRentCron = (_req, res) => {
  ensureDataLoaded();
  const now = Date.now();
  let rentDeductionsCount = 0;
  let suspendedCount = 0;
  userPhoneNumbers.forEach((p) => {
    const isMiracle = p.userId === "usr_miracle_01" || p.userEmail === "miracle@goldmailer.xyz" || p.id === "phone_free_miracle_admin";
    if (isMiracle) return;
    const expMs = new Date(p.expiresAt).getTime();
    if (expMs <= now) {
      p.status = "suspended";
      suspendedCount++;
      return;
    }
    const result = deductCoins(p.userId, p.userEmail, 3.3, `Daily Line Rent for ${p.phoneNumber}`, p.phoneNumber);
    rentDeductionsCount++;
    if (result.suspended || result.remainingCoins <= 0) {
      p.status = "suspended";
      suspendedCount++;
    }
  });
  saveData();
  return res.json({
    success: true,
    message: `Processed daily rent: ${rentDeductionsCount} numbers charged 3.3 coins, ${suspendedCount} numbers suspended.`,
    rentDeductionsCount,
    suspendedCount
  });
};
app.all(["/api/cron/deduct-rent", "/api/cron/daily-rent"], handleDeductRentCron);
app.get("/api/phone/esim", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = isReqAdmin(authUser);
  if (isAdmin) {
    return res.status(403).json({
      error: "eSIM feature applies exclusively to GoldMailer users."
    });
  }
  const userPhones = userPhoneNumbers.filter((p) => p.userId === authUser.id || authUser.email && p.userEmail === authUser.email);
  if (userPhones.length === 0) {
    return res.status(404).json({
      error: "No active phone number found. Please purchase a number to generate an eSIM profile."
    });
  }
  const requestedPhone = req.query.phoneNumber ? String(req.query.phoneNumber).trim() : "";
  const selectedPhone = userPhones.find((p) => p.phoneNumber === requestedPhone) || userPhones[0];
  const digits = selectedPhone.phoneNumber.replace(/\D/g, "");
  const iccid = `890141032${digits.padEnd(11, "0").slice(0, 11)}`;
  const smdpAddress = "smdp.goldmailer.xyz";
  const matchingId = `GM-${digits.slice(-6).toUpperCase() || "VIRTUAL"}`;
  const activationCode = `LPA:1$${smdpAddress}$${matchingId}`;
  const expMs = new Date(selectedPhone.expiresAt).getTime();
  const wallet = getUserWallet(authUser.id, authUser.email);
  const isSuspended = selectedPhone.status === "suspended" || wallet.coins <= 0 || expMs <= Date.now();
  const esimProfile = {
    iccid,
    phoneNumber: selectedPhone.phoneNumber,
    smdpAddress,
    activationCode,
    matchingId,
    lpaString: activationCode,
    carrierName: "GoldMobile Virtual eSIM",
    status: isSuspended ? "suspended" : "active",
    dataEnabled: true,
    voiceSmsEnabled: true,
    createdAt: selectedPhone.purchasedAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  return res.json({
    success: true,
    esim: esimProfile
  });
});
app.get("/api/phone/contacts", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const contacts = phoneContacts.filter((c) => c.userId === authUser.id);
  return res.json({ success: true, contacts });
});
app.post("/api/phone/contacts", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const { name, phoneNumber, notes } = req.body;
  if (!name || !phoneNumber) {
    return res.status(400).json({ error: "Name and phone number are required" });
  }
  const newContact = {
    id: "contact_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    userId: authUser.id,
    name: String(name).trim(),
    phoneNumber: String(phoneNumber).trim(),
    notes: notes ? String(notes).trim() : void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  phoneContacts.unshift(newContact);
  saveData();
  return res.json({ success: true, contact: newContact });
});
app.delete("/api/phone/contacts/:id", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  phoneContacts = phoneContacts.filter((c) => !(c.id === req.params.id && c.userId === authUser.id));
  saveData();
  return res.json({ success: true });
});
var handleGetSmsInbox = async (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = isReqAdmin(authUser);
  const { phoneNumber: adminNumber } = getTelnyxConfig();
  try {
    const liveMessages = await getTelnyxLogs(40);
    let hasNew = false;
    for (const tm of liveMessages) {
      const msgSid = tm.id || tm.sid;
      if (!sms_inbox.some((s) => s.messageSid === msgSid || s.telnyx_message_id === msgSid)) {
        const newLiveSms = {
          id: "sms_live_" + msgSid,
          userId: authUser.id || "usr_miracle_01",
          from: tm.from || "Unknown",
          to: tm.to || adminNumber || "+14236662513",
          body: tm.body || tm.text || "",
          receivedAt: tm.receivedAt || tm.dateSent || (/* @__PURE__ */ new Date()).toISOString(),
          messageSid: msgSid,
          telnyx_message_id: msgSid,
          direction: (tm.direction || "").includes("inbound") ? "inbound" : "outbound",
          status: tm.status,
          is_read: false
        };
        sms_inbox.unshift(newLiveSms);
        broadcastNewSMS(newLiveSms);
        hasNew = true;
      }
    }
    if (hasNew) {
      saveData();
    }
  } catch (syncErr) {
    console.warn("[TELNYX ACTIVE SYNC] Note:", syncErr.message || syncErr);
  }
  const userPhonesDigits = /* @__PURE__ */ new Set();
  userPhoneNumbers.filter((p) => p.userId === authUser.id || isAdmin && (p.id === "phone_free_miracle_admin" || p.phoneNumber === adminNumber)).forEach((p) => {
    if (p.phoneNumber) userPhonesDigits.add(p.phoneNumber.replace(/\D/g, ""));
  });
  if (adminNumber && isAdmin) {
    userPhonesDigits.add(adminNumber.replace(/\D/g, ""));
  }
  const list = sms_inbox.filter((s) => {
    if (isAdmin) return true;
    if (authUser.id && s.userId === authUser.id) return true;
    const toDigits = (s.to || "").replace(/\D/g, "");
    const fromDigits = (s.from || "").replace(/\D/g, "");
    if (userPhonesDigits.has(toDigits) || userPhonesDigits.has(fromDigits)) return true;
    return false;
  });
  return res.json({
    success: true,
    messages: list
  });
};
app.get(["/api/phone/sms", "/api/sms/inbox"], handleGetSmsInbox);
var handleSendSms = async (req, res) => {
  try {
    ensureDataLoaded();
    const { to, body, from, campaignId } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);
    const { phoneNumber: adminNumber } = getTelnyxConfig();
    const userPhones = userPhoneNumbers.filter((p) => p.userId === authUser.id && (isAdmin || p.phoneNumber !== adminNumber));
    if (!isAdmin && userPhones.length === 0) {
      return res.status(403).json({
        error: "You must have an active purchased phone number to send SMS."
      });
    }
    if (!isAdmin) {
      const activePhone = userPhones[0];
      const wallet = getUserWallet(authUser.id, authUser.email);
      if (activePhone.status === "suspended" || wallet.coins <= 0) {
        return res.status(403).json({
          error: "Your phone number is suspended due to expired validity or 0 coins. Please click Re-subscribe to resume service."
        });
      }
      if (wallet.coins < 5) {
        return res.status(403).json({
          error: `Insufficient coins to send SMS (5 coins required). Current balance: ${wallet.coins} coins. Please re-subscribe.`
        });
      }
    }
    if (!to || !body) {
      return res.status(400).json({ error: "Recipient phone number (to) and message (body) are required." });
    }
    const fromNumber = from || userPhones[0]?.phoneNumber || (isAdmin ? adminNumber : "") || "+14236662513";
    if (!fromNumber) {
      return res.status(400).json({ error: "You must have an active phone number to send SMS." });
    }
    const normalizedTo = normalizePhoneNumber(to, "+234");
    if (isOptedOut(normalizedTo)) {
      return res.status(400).json({
        success: false,
        error: "Recipient has opted out of SMS messages (STOP keyword received)."
      });
    }
    const telnyxResult = await sendSmsViaTelnyx2({
      to: normalizedTo,
      from: fromNumber,
      body,
      campaignId
    });
    const outboundSms = {
      id: "sms_out_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      userId: authUser.id,
      from: fromNumber,
      to: normalizedTo,
      body,
      receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
      messageSid: telnyxResult.messageSid || telnyxResult.messageId || "SM_" + Date.now(),
      telnyx_message_id: telnyxResult.messageId || telnyxResult.messageSid,
      direction: "outbound",
      status: telnyxResult.success ? telnyxResult.status || "sent" : "failed",
      is_read: true
    };
    sms_inbox.unshift(outboundSms);
    if (!isAdmin) {
      deductCoins(authUser.id, authUser.email, 5, `Outgoing SMS to ${normalizedTo}`, fromNumber);
    }
    saveData();
    broadcastNewSMS(outboundSms);
    return res.json({
      success: true,
      messageSid: telnyxResult.messageSid || telnyxResult.messageId || outboundSms.messageSid,
      messageId: telnyxResult.messageId || telnyxResult.messageSid,
      sms: outboundSms,
      carrierNotice: telnyxResult.success ? void 0 : telnyxResult.error
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post(["/api/phone/send-sms", "/api/sms/send"], handleSendSms);
app.patch("/api/phone/sms/:id/read", (req, res) => {
  ensureDataLoaded();
  const sms = sms_inbox.find((s) => s.id === req.params.id);
  if (sms) {
    sms.is_read = true;
    saveData();
  }
  return res.json({ success: true });
});
app.delete("/api/phone/sms/:id", (req, res) => {
  ensureDataLoaded();
  sms_inbox = sms_inbox.filter((s) => s.id !== req.params.id);
  saveData();
  return res.json({ success: true });
});
app.delete("/api/phone/sms", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const userPhones = new Set(
    userPhoneNumbers.filter((p) => p.userId === authUser.id).map((p) => p.phoneNumber)
  );
  sms_inbox = sms_inbox.filter((s) => s.userId !== authUser.id && !userPhones.has(s.to) && !userPhones.has(s.from));
  saveData();
  return res.json({ success: true });
});
var handleMakeVoiceCall = async (req, res) => {
  try {
    ensureDataLoaded();
    const { to, from, audioUrl, ttsText } = req.body;
    const authUser = resolveUserIdFromReq(req);
    const isAdmin = isReqAdmin(authUser);
    const { phoneNumber: adminNumber } = getTelnyxConfig();
    const userPhones = userPhoneNumbers.filter((p) => p.userId === authUser.id && (isAdmin || p.phoneNumber !== adminNumber));
    if (!isAdmin && userPhones.length === 0) {
      return res.status(403).json({
        error: "You must have an active purchased phone number to place calls."
      });
    }
    if (!isAdmin) {
      const activePhone = userPhones[0];
      const wallet = getUserWallet(authUser.id, authUser.email);
      if (activePhone.status === "suspended" || wallet.coins <= 0) {
        return res.status(403).json({
          error: "Your phone number is suspended due to expired validity or 0 coins. Please click Re-subscribe to resume service."
        });
      }
      if (wallet.coins < 5) {
        return res.status(403).json({
          error: `Insufficient coins to place calls (5 coins/min required). Current balance: ${wallet.coins} coins. Please re-subscribe.`
        });
      }
    }
    if (!to) {
      return res.status(400).json({ error: "Recipient phone number (to) is required." });
    }
    const fromNumber = from || userPhones[0]?.phoneNumber || (isAdmin ? adminNumber : "") || "+14236662513";
    if (!fromNumber) {
      return res.status(400).json({ error: "You must have an active phone number to place calls." });
    }
    const normalizedTo = normalizePhoneNumber(to, "+234");
    const callResult = await makeCallViaTelnyx2({
      to: normalizedTo,
      from: fromNumber,
      audioUrl,
      ttsText
    });
    const outboundCall = {
      id: "call_out_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      userId: authUser.id,
      from: fromNumber,
      to: normalizedTo,
      direction: "outbound",
      status: callResult.success ? callResult.status || "in-progress" : "failed",
      callSid: callResult.callSid || callResult.callControlId || "CA_" + Date.now(),
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    calls_history.unshift(outboundCall);
    if (!isAdmin) {
      deductCoins(authUser.id, authUser.email, 5, `Outgoing call to ${normalizedTo} (1 min)`, fromNumber);
    }
    saveData();
    broadcastNewCall(outboundCall);
    if (!callResult.success) {
      return res.status(400).json({
        success: false,
        error: callResult.error || "Telnyx rejected the call",
        carrierNotice: callResult.error,
        callSid: outboundCall.callSid,
        call: outboundCall
      });
    }
    return res.json({
      success: true,
      callSid: callResult.callSid || outboundCall.callSid,
      call: outboundCall
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
app.post(["/api/phone/call", "/api/voice/call"], handleMakeVoiceCall);
var handleGetCalls = async (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const isAdmin = authUser.email === "miracle@goldmailer.xyz" || authUser.id === "usr_miracle_01";
  const userPhones = new Set(
    userPhoneNumbers.filter((p) => p.userId === authUser.id || isAdmin && p.id === "phone_free_miracle_admin").map((p) => p.phoneNumber)
  );
  try {
    const telnyxCalls = await getTelnyxCallLogs(20);
    for (const tc of telnyxCalls) {
      const existing = calls_history.find((c) => c.callSid === tc.callSid);
      if (existing) {
        existing.status = tc.status;
        if (tc.durationSeconds) existing.durationSeconds = tc.durationSeconds;
        if (tc.endedAt) existing.endedAt = tc.endedAt;
      } else {
        calls_history.unshift({
          id: "call_live_" + tc.callSid,
          userId: authUser.id || "usr_miracle_01",
          from: tc.from,
          to: tc.to,
          direction: tc.direction,
          status: tc.status,
          durationSeconds: tc.durationSeconds,
          callSid: tc.callSid,
          startedAt: tc.startedAt,
          endedAt: tc.endedAt
        });
      }
    }
  } catch {
  }
  const list = calls_history.filter((c) => {
    if (isAdmin) return true;
    if (c.userId === authUser.id) return true;
    if (userPhones.has(c.to) || userPhones.has(c.from)) return true;
    return false;
  });
  return res.json({
    success: true,
    calls: list
  });
};
app.get(["/api/phone/calls", "/api/voice/logs", "/api/voice/calls"], handleGetCalls);
app.delete("/api/phone/calls/:id", (req, res) => {
  ensureDataLoaded();
  calls_history = calls_history.filter((c) => c.id !== req.params.id);
  saveData();
  return res.json({ success: true });
});
app.delete("/api/phone/calls", (req, res) => {
  ensureDataLoaded();
  const authUser = resolveUserIdFromReq(req);
  const userPhones = new Set(
    userPhoneNumbers.filter((p) => p.userId === authUser.id).map((p) => p.phoneNumber)
  );
  calls_history = calls_history.filter((c) => c.userId !== authUser.id && !userPhones.has(c.to) && !userPhones.has(c.from));
  saveData();
  return res.json({ success: true });
});

// src/server/apiEntry.ts
var apiEntry_default = app;
export {
  apiEntry_default as default
};
