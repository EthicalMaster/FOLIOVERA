/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Persistent SQLite Storage Adapter (Phase 1.5)
 * Retained for local development and isolated persistence testing.
 * Supports owner-scoped isolation (forOwner), clean empty profile initialization,
 * safe export/import migration, and strict separation from sample demonstration data.
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  resolveLifecycleState,
  isClaimApproved,
  type VerifiedCareerProfile,
  type EvidenceSource,
  type CareerClaim,
  type VerificationStatus,
  type AuditLogEntry,
  type SystemHealth,
  type GitHubRepositoryRecord,
  type SyncHistoryRecord,
  type ProfileExportBundle,
  type ProfileImportResult
} from '../../shared/types/career-profile.ts';
import type { StorageAdapter, OwnerIdentityMeta } from './storage.interface.ts';
import { SAMPLE_CAREER_PROFILE, createEmptyOwnerProfile } from './sample-data.ts';
import { SchemaValidator } from './schema-validator.ts';

export interface PersistentStorageOptions {
  dbPath?: string;
  storageMode?: 'development_persistent' | 'production_persistent';
  seedSampleIfEmpty?: boolean;
  owner?: OwnerIdentityMeta;
  sharedDb?: DatabaseSync;
}

export class PersistentSqliteStorageAdapter implements StorageAdapter {
  private db: DatabaseSync;
  private dbPath: string;
  private storageMode: 'development_persistent' | 'production_persistent';
  private startTime: number;
  private owner?: OwnerIdentityMeta;
  private profileId: string;
  private isOwnerScoped: boolean;

  constructor(optionsOrPath: PersistentStorageOptions | string = {}) {
    const options: PersistentStorageOptions =
      typeof optionsOrPath === 'string' ? { dbPath: optionsOrPath } : optionsOrPath;
    const defaultPath =
      process.env.SQLITE_DB_PATH ||
      process.env.STORAGE_DB_PATH ||
      path.resolve(process.cwd(), 'data', 'living-resume.sqlite');

    this.dbPath = options.dbPath || defaultPath;
    this.storageMode =
      options.storageMode ||
      (process.env.NODE_ENV === 'production' ? 'production_persistent' : 'development_persistent');
    this.startTime = Date.now();
    this.owner = options.owner;
    this.isOwnerScoped = Boolean(options.owner?.uid);
    this.profileId = options.owner?.uid
      ? `profile-${options.owner.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : 'profile-primary';

    if (options.sharedDb) {
      this.db = options.sharedDb;
    } else {
      const dir = path.dirname(this.dbPath);
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (fsErr) {
        throw new Error(
          `[Foliovera Storage Error] Cannot write to SQLite database directory "${dir}". ` +
            `Ensure the filesystem path is writable or configure Firestore for production. ` +
            `Underlying error: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`
        );
      }

      this.db = new DatabaseSync(this.dbPath);
      this.initializeSchema();

      // Only seed sample profile in legacy unscoped mode when explicitly requested (default true for legacy tests)
      if (!this.isOwnerScoped && options.seedSampleIfEmpty !== false) {
        this.seedIfEmpty(SAMPLE_CAREER_PROFILE);
      }
    }
  }

  public forOwner(owner: OwnerIdentityMeta): StorageAdapter {
    if (!owner || !owner.uid || !owner.uid.trim()) {
      throw new Error('Valid authenticated owner UID is required for owner-scoped storage');
    }
    return new PersistentSqliteStorageAdapter({
      dbPath: this.dbPath,
      storageMode: this.storageMode,
      seedSampleIfEmpty: false,
      owner: {
        uid: owner.uid.trim(),
        email: owner.email,
        displayName: owner.displayName
      },
      sharedDb: this.db
    });
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public close(): void {
    this.db.close();
  }

  private getOwnerKey(): string {
    return this.owner?.uid || 'sample-default';
  }

  private initializeSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_profiles (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        candidate_name TEXT NOT NULL,
        email TEXT,
        location TEXT,
        headline TEXT NOT NULL,
        summary TEXT NOT NULL,
        skills_json TEXT NOT NULL,
        experiences_json TEXT NOT NULL,
        projects_json TEXT NOT NULL,
        education_json TEXT NOT NULL,
        resume_versions_json TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        is_sample_data INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        last_updated TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        full_name TEXT NOT NULL,
        github_repo_id INTEGER NOT NULL,
        owner_login TEXT NOT NULL,
        record_json TEXT NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_vault (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        fingerprint TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        uri TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_claims (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        fingerprint TEXT NOT NULL,
        category TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        provider TEXT NOT NULL,
        username TEXT NOT NULL,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        owner_uid TEXT NOT NULL DEFAULT 'sample-default',
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT NOT NULL
      );
    `);

    // Ensure owner_uid columns exist if upgrading an older Phase 1 SQLite database file
    const tablesToEnsureOwnerUid = [
      'career_profiles',
      'repositories',
      'evidence_vault',
      'career_claims',
      'sync_history',
      'audit_logs'
    ];
    for (const table of tablesToEnsureOwnerUid) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some(c => c.name === 'owner_uid')) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN owner_uid TEXT NOT NULL DEFAULT 'sample-default'`);
      }
    }

    const migrationCheck = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 2')
      .get();
    if (!migrationCheck) {
      this.db
        .prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)')
        .run(2, new Date().toISOString(), 'Phase 1.5 owner-scoped career storage schema');
    }
  }

  private seedIfEmpty(sample: VerifiedCareerProfile): void {
    const existing = this.db
      .prepare('SELECT id FROM career_profiles WHERE owner_uid = ? LIMIT 1')
      .get(this.getOwnerKey()) as { id: string } | undefined;

    if (existing) {
      this.profileId = existing.id;
      return;
    }

    this.profileId = sample.id;
    this.persistFullProfileSync(sample);
  }

  private scopedRecordId(rawId: string): string {
    if (!this.isOwnerScoped) return rawId;
    const prefix = `${this.getOwnerKey()}::`;
    return rawId.startsWith(prefix) ? rawId : `${prefix}${rawId}`;
  }

  private persistFullProfileSync(profile: VerifiedCareerProfile): void {
    SchemaValidator.validateProfile(profile);
    const ownerKey = this.getOwnerKey();

    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      this.db
        .prepare(`
          INSERT INTO career_profiles (
            id, owner_uid, candidate_name, email, location, headline, summary,
            skills_json, experiences_json, projects_json, education_json,
            resume_versions_json, settings_json, is_sample_data, version, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            owner_uid = excluded.owner_uid,
            candidate_name = excluded.candidate_name,
            email = excluded.email,
            location = excluded.location,
            headline = excluded.headline,
            summary = excluded.summary,
            skills_json = excluded.skills_json,
            experiences_json = excluded.experiences_json,
            projects_json = excluded.projects_json,
            education_json = excluded.education_json,
            resume_versions_json = excluded.resume_versions_json,
            settings_json = excluded.settings_json,
            is_sample_data = excluded.is_sample_data,
            version = excluded.version,
            last_updated = excluded.last_updated
        `)
        .run(
          profile.id,
          ownerKey,
          profile.candidateName,
          profile.email || '',
          profile.location || '',
          profile.headline,
          profile.summary,
          JSON.stringify(profile.skills ?? []),
          JSON.stringify(profile.experiences ?? []),
          JSON.stringify(profile.projects ?? []),
          JSON.stringify(profile.education ?? []),
          JSON.stringify(profile.resumeVersions ?? []),
          JSON.stringify(profile.settings ?? {}),
          profile.isSampleData ? 1 : 0,
          profile.version,
          profile.lastUpdated
        );

      for (const ev of profile.evidenceVault) {
        const fp =
          ev.fingerprint ||
          SchemaValidator.computeFingerprint('evidence', ev.type, ev.uri, ev.provenance.commitSha || ev.id);
        const enriched: EvidenceSource = { ...ev, fingerprint: fp };
        const dbId = this.scopedRecordId(enriched.id);
        this.db
          .prepare(`
            INSERT INTO evidence_vault (id, owner_uid, fingerprint, type, title, uri, record_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              fingerprint = excluded.fingerprint,
              type = excluded.type,
              title = excluded.title,
              uri = excluded.uri,
              record_json = excluded.record_json
          `)
          .run(
            dbId,
            ownerKey,
            this.scopedRecordId(fp),
            enriched.type,
            enriched.title,
            enriched.uri,
            JSON.stringify(enriched),
            enriched.provenance.fetchedAt || new Date().toISOString()
          );
      }

      for (const claim of profile.claims) {
        const fp =
          claim.fingerprint ||
          SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');
        const lifecycle = resolveLifecycleState(claim);
        const enriched: CareerClaim = {
          ...claim,
          fingerprint: fp,
          lifecycleState: lifecycle
        };
        const dbId = this.scopedRecordId(enriched.id);
        this.db
          .prepare(`
            INSERT OR IGNORE INTO career_claims (id, owner_uid, fingerprint, category, verification_status, lifecycle_state, record_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            dbId,
            ownerKey,
            this.scopedRecordId(fp),
            enriched.category,
            enriched.verificationStatus,
            lifecycle,
            JSON.stringify(enriched),
            new Date().toISOString()
          );
      }

      if (Array.isArray(profile.repositories)) {
        for (const repo of profile.repositories) {
          const dbId = this.scopedRecordId(repo.id);
          this.db
            .prepare(`
              INSERT INTO repositories (id, owner_uid, full_name, github_repo_id, owner_login, record_json, last_synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                record_json = excluded.record_json,
                last_synced_at = excluded.last_synced_at
            `)
            .run(
              dbId,
              ownerKey,
              repo.fullName,
              repo.githubRepoId,
              repo.ownerLogin,
              JSON.stringify(repo),
              repo.lastSyncedAt
            );
        }
      }

      for (const log of profile.auditTrail) {
        const dbId = this.scopedRecordId(log.id);
        this.db
          .prepare(`
            INSERT OR IGNORE INTO audit_logs (id, owner_uid, timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(dbId, ownerKey, log.timestamp, log.actor, log.action, log.targetId, log.details);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public async initializeEmptyProfile(ownerOverride?: OwnerIdentityMeta): Promise<VerifiedCareerProfile> {
    const targetOwner = ownerOverride || this.owner || { uid: 'owner-default' };
    const empty = createEmptyOwnerProfile(targetOwner.uid, targetOwner.email, targetOwner.displayName);
    this.profileId = empty.id;
    this.persistFullProfileSync(empty);
    return (await this.getProfile()) || empty;
  }

  public async getProfile(): Promise<VerifiedCareerProfile | null> {
    const ownerKey = this.getOwnerKey();
    let row = this.db
      .prepare('SELECT * FROM career_profiles WHERE owner_uid = ? OR id = ? LIMIT 1')
      .get(ownerKey, this.profileId) as Record<string, any> | undefined;

    if (!row && this.isOwnerScoped && this.owner) {
      // Automatically initialize a clean empty profile for an authenticated owner (NEVER sample data)
      const empty = createEmptyOwnerProfile(this.owner.uid, this.owner.email, this.owner.displayName);
      this.profileId = empty.id;
      this.persistFullProfileSync(empty);
      row = this.db
        .prepare('SELECT * FROM career_profiles WHERE id = ? LIMIT 1')
        .get(this.profileId) as Record<string, any> | undefined;
    }

    if (!row) return null;

    const evidenceRows = this.db
      .prepare('SELECT record_json FROM evidence_vault WHERE owner_uid = ? ORDER BY created_at DESC')
      .all(ownerKey) as { record_json: string }[];
    const claimRows = this.db
      .prepare('SELECT record_json FROM career_claims WHERE owner_uid = ? ORDER BY updated_at DESC')
      .all(ownerKey) as { record_json: string }[];
    const repoRows = this.db
      .prepare('SELECT record_json FROM repositories WHERE owner_uid = ? ORDER BY last_synced_at DESC')
      .all(ownerKey) as { record_json: string }[];
    const syncRows = this.db
      .prepare('SELECT record_json FROM sync_history WHERE owner_uid = ? ORDER BY started_at DESC LIMIT 25')
      .all(ownerKey) as { record_json: string }[];
    const auditRows = this.db
      .prepare('SELECT * FROM audit_logs WHERE owner_uid = ? ORDER BY timestamp DESC LIMIT 100')
      .all(ownerKey) as {
      id: string;
      timestamp: string;
      actor: AuditLogEntry['actor'];
      action: AuditLogEntry['action'];
      target_id: string;
      details: string;
    }[];

    return {
      id: row.id,
      ownerUid: this.owner?.uid || row.owner_uid,
      candidateName: row.candidate_name,
      email: row.email || undefined,
      location: row.location || undefined,
      headline: row.headline,
      summary: row.summary,
      skills: JSON.parse(row.skills_json || '[]'),
      experiences: JSON.parse(row.experiences_json || '[]'),
      projects: JSON.parse(row.projects_json || '[]'),
      education: JSON.parse(row.education_json || '[]'),
      resumeVersions: JSON.parse(row.resume_versions_json || '[]'),
      settings: JSON.parse(row.settings_json || '{}'),
      repositories: repoRows.map(r => JSON.parse(r.record_json)),
      syncHistory: syncRows.map(s => JSON.parse(s.record_json)),
      evidenceVault: evidenceRows.map(e => JSON.parse(e.record_json)),
      claims: claimRows.map(c => JSON.parse(c.record_json)),
      auditTrail: auditRows.map(a => ({
        id: a.id.replace(`${ownerKey}::`, ''),
        timestamp: a.timestamp,
        actor: a.actor,
        action: a.action,
        targetId: a.target_id,
        details: a.details
      })),
      isSampleData: this.isOwnerScoped ? false : Boolean(row.is_sample_data),
      version: Number(row.version),
      lastUpdated: row.last_updated
    };
  }

  public async saveProfile(updated: VerifiedCareerProfile): Promise<void> {
    if (this.isOwnerScoped && (updated.isSampleData || updated.id === SAMPLE_CAREER_PROFILE.id)) {
      throw new Error('Sample demonstration profiles cannot be saved into an authenticated owner profile.');
    }

    const nextProfile: VerifiedCareerProfile = {
      ...updated,
      id: this.isOwnerScoped ? this.profileId : updated.id,
      ownerUid: this.owner?.uid || updated.ownerUid,
      isSampleData: this.isOwnerScoped ? false : Boolean(updated.isSampleData),
      lastUpdated: new Date().toISOString(),
      version: (updated.version || 1) + 1
    };
    this.profileId = nextProfile.id;
    this.persistFullProfileSync(nextProfile);
  }

  public async getClaim(claimId: string): Promise<CareerClaim | null> {
    const ownerKey = this.getOwnerKey();
    const row = this.db
      .prepare('SELECT record_json FROM career_claims WHERE (id = ? OR id = ?) AND owner_uid = ?')
      .get(this.scopedRecordId(claimId), claimId, ownerKey) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) : null;
  }

  public async upsertClaim(claim: CareerClaim): Promise<{ claim: CareerClaim; created: boolean }> {
    const ownerKey = this.getOwnerKey();
    const evidenceRows = this.db
      .prepare('SELECT record_json FROM evidence_vault WHERE owner_uid = ?')
      .all(ownerKey) as { record_json: string }[];
    const knownEvidenceIds = new Set(evidenceRows.map(r => (JSON.parse(r.record_json) as EvidenceSource).id));

    SchemaValidator.validateClaim(claim, knownEvidenceIds);

    const fp =
      claim.fingerprint ||
      SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');
    const scopedFp = this.scopedRecordId(fp);
    const scopedId = this.scopedRecordId(claim.id);

    const existingRow = this.db
      .prepare(
        'SELECT id, record_json FROM career_claims WHERE owner_uid = ? AND (fingerprint = ? OR fingerprint = ? OR id = ? OR id = ?) LIMIT 1'
      )
      .get(ownerKey, scopedFp, fp, scopedId, claim.id) as { id: string; record_json: string } | undefined;

    if (existingRow) {
      const existingClaim: CareerClaim = JSON.parse(existingRow.record_json);
      const mergedEvidenceIds = Array.from(new Set([...existingClaim.evidenceIds, ...claim.evidenceIds]));
      const updatedClaim: CareerClaim = {
        ...existingClaim,
        evidenceIds: mergedEvidenceIds,
        fingerprint: fp,
        supportingExplanation: claim.supportingExplanation || existingClaim.supportingExplanation
      };
      this.db
        .prepare('UPDATE career_claims SET record_json = ?, updated_at = ? WHERE id = ? AND owner_uid = ?')
        .run(JSON.stringify(updatedClaim), new Date().toISOString(), existingRow.id, ownerKey);

      return { claim: updatedClaim, created: false };
    }

    const lifecycle = resolveLifecycleState(claim);
    const initialHistory = claim.reviewHistory ?? [
      {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actor: 'github_extractor',
        newStatus: claim.verificationStatus,
        lifecycleState: lifecycle,
        note: claim.supportingExplanation || 'Discovered during repository evidence extraction'
      }
    ];

    const newClaim: CareerClaim = {
      ...claim,
      fingerprint: fp,
      lifecycleState: lifecycle,
      extractedAt: claim.extractedAt || new Date().toISOString(),
      reviewHistory: initialHistory
    };

    this.db
      .prepare(`
        INSERT INTO career_claims (id, owner_uid, fingerprint, category, verification_status, lifecycle_state, record_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        scopedId,
        ownerKey,
        scopedFp,
        newClaim.category,
        newClaim.verificationStatus,
        lifecycle,
        JSON.stringify(newClaim),
        new Date().toISOString()
      );

    this.touchProfileTimestamp();
    return { claim: newClaim, created: true };
  }

  public async updateClaim(
    claimId: string,
    updates: Partial<Pick<CareerClaim, 'statement' | 'category' | 'clarificationResponse' | 'ownershipStatus' | 'notes'>>
  ): Promise<CareerClaim> {
    const ownerKey = this.getOwnerKey();
    const existing = await this.getClaim(claimId);
    if (!existing) {
      throw new Error(`Claim not found with ID: ${claimId}`);
    }

    const history = existing.reviewHistory ? [...existing.reviewHistory] : [];
    if (updates.clarificationResponse && updates.clarificationResponse !== existing.clarificationResponse) {
      history.unshift({
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actor: 'user',
        previousStatus: existing.verificationStatus,
        newStatus: existing.verificationStatus,
        lifecycleState: resolveLifecycleState(existing),
        note: `Candidate clarification provided: "${updates.clarificationResponse}"`
      });
    }

    const updated: CareerClaim = {
      ...existing,
      statement:
        typeof updates.statement === 'string' && updates.statement.trim()
          ? updates.statement.trim()
          : existing.statement,
      category: updates.category || existing.category,
      clarificationResponse:
        updates.clarificationResponse !== undefined ? updates.clarificationResponse : existing.clarificationResponse,
      ownershipStatus:
        updates.ownershipStatus ||
        (updates.clarificationResponse ? 'contributor' : existing.ownershipStatus),
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      reviewHistory: history
    };

    this.db
      .prepare(
        'UPDATE career_claims SET category = ?, record_json = ?, updated_at = ? WHERE (id = ? OR id = ?) AND owner_uid = ?'
      )
      .run(
        updated.category,
        JSON.stringify(updated),
        new Date().toISOString(),
        this.scopedRecordId(claimId),
        claimId,
        ownerKey
      );

    if (updates.clarificationResponse) {
      await this.appendAuditLog({
        actor: 'user',
        action: 'claim_clarified',
        targetId: claimId,
        details: `Candidate submitted contribution clarification for claim ${claimId}.`
      });
    }

    this.touchProfileTimestamp();
    return updated;
  }

  public async deleteClaim(claimId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    const ownerKey = this.getOwnerKey();
    const existing = await this.getClaim(claimId);
    if (!existing) return false;

    this.db
      .prepare('DELETE FROM career_claims WHERE (id = ? OR id = ?) AND owner_uid = ?')
      .run(this.scopedRecordId(claimId), claimId, ownerKey);
    await this.appendAuditLog({
      actor,
      action: 'claim_deleted',
      targetId: claimId,
      details: `Deleted claim "${existing.statement.slice(0, 60)}..."`
    });
    this.touchProfileTimestamp();
    return true;
  }

  public async updateClaimVerification(
    claimId: string,
    status: VerificationStatus,
    actor: 'user' | 'system',
    note?: string,
    clarificationResponse?: string
  ): Promise<CareerClaim> {
    const ownerKey = this.getOwnerKey();
    const claim = await this.getClaim(claimId);
    if (!claim) {
      throw new Error(`Claim not found with ID: ${claimId}`);
    }

    const prevStatus = claim.verificationStatus;
    claim.verificationStatus = status;
    claim.lifecycleState = resolveLifecycleState({ verificationStatus: status });

    if (clarificationResponse && clarificationResponse.trim()) {
      claim.clarificationResponse = clarificationResponse.trim();
      if (claim.ownershipStatus === 'uncertain_ownership') {
        claim.ownershipStatus = 'contributor';
      }
    }

    if (status === 'user_confirmed' || status === 'verified_source') {
      claim.userConfirmedAt = new Date().toISOString();
      claim.verifiedBy = actor === 'user' ? 'human_user' : claim.verifiedBy;
    }

    if (note) {
      claim.notes = (claim.notes ? `${claim.notes} | ` : '') + note;
    }

    const historyEntry = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor,
      previousStatus: prevStatus,
      newStatus: status,
      lifecycleState: claim.lifecycleState,
      note: note || `Status updated to ${status}`
    };
    claim.reviewHistory = [historyEntry, ...(claim.reviewHistory ?? [])];

    this.db
      .prepare(`
        UPDATE career_claims
        SET verification_status = ?, lifecycle_state = ?, record_json = ?, updated_at = ?
        WHERE (id = ? OR id = ?) AND owner_uid = ?
      `)
      .run(
        status,
        claim.lifecycleState,
        JSON.stringify(claim),
        new Date().toISOString(),
        this.scopedRecordId(claimId),
        claimId,
        ownerKey
      );

    const profile = await this.getProfile();
    if (profile) {
      let modified = false;
      for (const exp of profile.experiences) {
        for (const h of exp.highlights) {
          if (h.claimId === claimId) {
            h.verificationStatus = status;
            modified = true;
          }
        }
      }
      if (modified) {
        this.db
          .prepare('UPDATE career_profiles SET experiences_json = ?, last_updated = ? WHERE id = ?')
          .run(JSON.stringify(profile.experiences), new Date().toISOString(), this.profileId);
      }
    }

    await this.appendAuditLog({
      actor,
      action: status === 'rejected' ? 'claim_rejected' : 'claim_verified',
      targetId: claimId,
      details: `Claim status changed from "${prevStatus}" to "${status}" (${claim.lifecycleState}) by ${actor}.${note ? ` Note: ${note}` : ''}`
    });

    this.touchProfileTimestamp();
    return claim;
  }

  public async getEvidence(evidenceId: string): Promise<EvidenceSource | null> {
    const ownerKey = this.getOwnerKey();
    const row = this.db
      .prepare('SELECT record_json FROM evidence_vault WHERE (id = ? OR id = ?) AND owner_uid = ?')
      .get(this.scopedRecordId(evidenceId), evidenceId, ownerKey) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) : null;
  }

  public async listEvidence(): Promise<EvidenceSource[]> {
    const ownerKey = this.getOwnerKey();
    const rows = this.db
      .prepare('SELECT record_json FROM evidence_vault WHERE owner_uid = ? ORDER BY created_at DESC')
      .all(ownerKey) as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async addEvidence(evidence: EvidenceSource): Promise<void> {
    SchemaValidator.validateEvidence(evidence);
    const exists = await this.getEvidence(evidence.id);
    if (exists) {
      throw new Error(`Evidence with ID ${evidence.id} already exists`);
    }

    const ownerKey = this.getOwnerKey();
    const fp =
      evidence.fingerprint ||
      SchemaValidator.computeFingerprint(
        'evidence',
        evidence.type,
        evidence.uri,
        evidence.provenance.commitSha || evidence.id
      );

    const enriched: EvidenceSource = { ...evidence, fingerprint: fp };
    this.db
      .prepare(`
        INSERT INTO evidence_vault (id, owner_uid, fingerprint, type, title, uri, record_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        this.scopedRecordId(enriched.id),
        ownerKey,
        this.scopedRecordId(fp),
        enriched.type,
        enriched.title,
        enriched.uri,
        JSON.stringify(enriched),
        enriched.provenance.fetchedAt || new Date().toISOString()
      );

    await this.appendAuditLog({
      actor: 'system',
      action: 'evidence_imported',
      targetId: enriched.id,
      details: `Imported evidence item "${enriched.title}" (${enriched.type})`
    });

    this.touchProfileTimestamp();
  }

  public async upsertEvidence(evidence: EvidenceSource): Promise<{ evidence: EvidenceSource; created: boolean }> {
    SchemaValidator.validateEvidence(evidence);
    const ownerKey = this.getOwnerKey();
    const fp =
      evidence.fingerprint ||
      SchemaValidator.computeFingerprint(
        'evidence',
        evidence.type,
        evidence.uri,
        evidence.provenance.commitSha || ''
      );
    const scopedFp = this.scopedRecordId(fp);
    const scopedId = this.scopedRecordId(evidence.id);

    const existingRow = this.db
      .prepare(
        'SELECT id, record_json FROM evidence_vault WHERE owner_uid = ? AND (fingerprint = ? OR fingerprint = ? OR id = ? OR id = ?) LIMIT 1'
      )
      .get(ownerKey, scopedFp, fp, scopedId, evidence.id) as { id: string; record_json: string } | undefined;

    if (existingRow) {
      const existing: EvidenceSource = JSON.parse(existingRow.record_json);
      const updated: EvidenceSource = {
        ...existing,
        ...evidence,
        id: existing.id,
        fingerprint: fp
      };
      this.db
        .prepare('UPDATE evidence_vault SET title = ?, uri = ?, record_json = ? WHERE id = ? AND owner_uid = ?')
        .run(updated.title, updated.uri, JSON.stringify(updated), existingRow.id, ownerKey);
      return { evidence: updated, created: false };
    }

    const enriched: EvidenceSource = { ...evidence, fingerprint: fp };
    this.db
      .prepare(`
        INSERT INTO evidence_vault (id, owner_uid, fingerprint, type, title, uri, record_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        scopedId,
        ownerKey,
        scopedFp,
        enriched.type,
        enriched.title,
        enriched.uri,
        JSON.stringify(enriched),
        enriched.provenance.fetchedAt || new Date().toISOString()
      );

    await this.appendAuditLog({
      actor: 'github_sync',
      action: 'evidence_imported',
      targetId: enriched.id,
      details: `Ingested evidence "${enriched.title}" (${enriched.type})`
    });

    this.touchProfileTimestamp();
    return { evidence: enriched, created: true };
  }

  public async deleteEvidence(evidenceId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    const ownerKey = this.getOwnerKey();
    const existing = await this.getEvidence(evidenceId);
    if (!existing) return false;

    this.db
      .prepare('DELETE FROM evidence_vault WHERE (id = ? OR id = ?) AND owner_uid = ?')
      .run(this.scopedRecordId(evidenceId), evidenceId, ownerKey);
    await this.appendAuditLog({
      actor,
      action: 'evidence_deleted',
      targetId: evidenceId,
      details: `Deleted evidence source "${existing.title}"`
    });
    this.touchProfileTimestamp();
    return true;
  }

  public async listRepositories(): Promise<GitHubRepositoryRecord[]> {
    const ownerKey = this.getOwnerKey();
    const rows = this.db
      .prepare('SELECT record_json FROM repositories WHERE owner_uid = ? ORDER BY last_synced_at DESC')
      .all(ownerKey) as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async upsertRepository(
    repo: GitHubRepositoryRecord
  ): Promise<{ repo: GitHubRepositoryRecord; updated: boolean }> {
    const ownerKey = this.getOwnerKey();
    const existingRow = this.db
      .prepare('SELECT id, record_json FROM repositories WHERE full_name = ? AND owner_uid = ? LIMIT 1')
      .get(repo.fullName, ownerKey) as { id: string; record_json: string } | undefined;

    let meaningfulChange = true;
    if (existingRow) {
      const prev: GitHubRepositoryRecord = JSON.parse(existingRow.record_json);
      meaningfulChange =
        prev.pushedAt !== repo.pushedAt ||
        prev.latestCommitSha !== repo.latestCommitSha ||
        prev.description !== repo.description ||
        prev.stargazersCount !== repo.stargazersCount;
    }

    const dbId = existingRow?.id || this.scopedRecordId(repo.id);
    this.db
      .prepare(`
        INSERT INTO repositories (id, owner_uid, full_name, github_repo_id, owner_login, record_json, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          record_json = excluded.record_json,
          last_synced_at = excluded.last_synced_at
      `)
      .run(
        dbId,
        ownerKey,
        repo.fullName,
        repo.githubRepoId,
        repo.ownerLogin,
        JSON.stringify(repo),
        repo.lastSyncedAt
      );

    this.touchProfileTimestamp();
    return { repo, updated: meaningfulChange };
  }

  public async listSyncHistory(): Promise<SyncHistoryRecord[]> {
    const ownerKey = this.getOwnerKey();
    const rows = this.db
      .prepare('SELECT record_json FROM sync_history WHERE owner_uid = ? ORDER BY started_at DESC LIMIT 25')
      .all(ownerKey) as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async addSyncHistory(record: SyncHistoryRecord): Promise<void> {
    const ownerKey = this.getOwnerKey();
    this.db
      .prepare(`
        INSERT INTO sync_history (id, owner_uid, provider, username, started_at, status, record_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          record_json = excluded.record_json
      `)
      .run(
        this.scopedRecordId(record.id),
        ownerKey,
        record.provider,
        record.username,
        record.startedAt,
        record.status,
        JSON.stringify(record)
      );
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    const ownerKey = this.getOwnerKey();
    const rows = this.db
      .prepare('SELECT * FROM audit_logs WHERE owner_uid = ? ORDER BY timestamp DESC LIMIT 100')
      .all(ownerKey) as {
      id: string;
      timestamp: string;
      actor: AuditLogEntry['actor'];
      action: AuditLogEntry['action'];
      target_id: string;
      details: string;
    }[];

    return rows.map(a => ({
      id: a.id.replace(`${ownerKey}::`, ''),
      timestamp: a.timestamp,
      actor: a.actor,
      action: a.action,
      targetId: a.target_id,
      details: a.details
    }));
  }

  public async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const ownerKey = this.getOwnerKey();
    const newEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.db
      .prepare(
        'INSERT INTO audit_logs (id, owner_uid, timestamp, actor, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        this.scopedRecordId(newEntry.id),
        ownerKey,
        newEntry.timestamp,
        newEntry.actor,
        newEntry.action,
        newEntry.targetId,
        newEntry.details
      );

    return newEntry;
  }

  public async exportProfileBundle(ownerUid?: string): Promise<ProfileExportBundle> {
    const target =
      ownerUid && ownerUid !== this.owner?.uid ? this.forOwner({ uid: ownerUid }) : this;
    const profile = await target.getProfile();
    if (!profile) {
      throw new Error('No career profile found for export');
    }
    return {
      schemaVersion: '1.5.0',
      exportedAt: new Date().toISOString(),
      ownerUid: ownerUid || this.getOwnerKey(),
      isSampleData: Boolean(profile.isSampleData),
      profile
    };
  }

  public async importProfileBundle(
    ownerUid: string,
    incomingProfile: VerifiedCareerProfile,
    options: { mode?: 'merge' | 'initialize_if_empty' } = {}
  ): Promise<ProfileImportResult> {
    const mode = options.mode || 'merge';
    if (
      incomingProfile.isSampleData === true ||
      incomingProfile.id === SAMPLE_CAREER_PROFILE.id ||
      incomingProfile.email === SAMPLE_CAREER_PROFILE.email
    ) {
      throw new Error('Refusing to import sample demonstration profile (Alex Morgan) into authenticated owner storage.');
    }

    const sampleEvidenceIds = new Set(SAMPLE_CAREER_PROFILE.evidenceVault.map(e => e.id));
    const sampleClaimIds = new Set(SAMPLE_CAREER_PROFILE.claims.map(c => c.id));

    const cleanEvidence = (incomingProfile.evidenceVault ?? []).filter(
      e => !sampleEvidenceIds.has(e.id) && e.provenance?.authorLogin !== 'alex-morgan-sample'
    );
    const cleanClaims = (incomingProfile.claims ?? []).filter(c => !sampleClaimIds.has(c.id));
    const sampleRecordsRejected =
      (incomingProfile.evidenceVault?.length ?? 0) -
      cleanEvidence.length +
      ((incomingProfile.claims?.length ?? 0) - cleanClaims.length);

    const sanitized: VerifiedCareerProfile = {
      ...incomingProfile,
      id: `profile-${ownerUid}`,
      ownerUid,
      isSampleData: false,
      evidenceVault: cleanEvidence,
      claims: cleanClaims,
      lastUpdated: new Date().toISOString(),
      version: (incomingProfile.version || 1) + 1
    };

    SchemaValidator.validateProfile(sanitized);

    const scoped = this.forOwner({
      uid: ownerUid,
      email: sanitized.email,
      displayName: sanitized.candidateName
    }) as PersistentSqliteStorageAdapter;

    const existing = await scoped.getProfile();
    if (existing && existing.claims.length > 0 && mode === 'initialize_if_empty') {
      throw new Error('Target owner profile already contains records; use merge mode instead of initialize_if_empty.');
    }

    scoped.persistFullProfileSync(sanitized);

    return {
      importedProfileId: sanitized.id,
      ownerUid,
      claimsImported: cleanClaims.length,
      evidenceImported: cleanEvidence.length,
      repositoriesImported: (sanitized.repositories ?? []).length,
      sampleRecordsRejected,
      mode
    };
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const ownerKey = this.getOwnerKey();
    const claims = (
      this.db
        .prepare('SELECT record_json FROM career_claims WHERE owner_uid = ?')
        .all(ownerKey) as { record_json: string }[]
    ).map(r => JSON.parse(r.record_json) as CareerClaim);

    const evidenceCount = (
      this.db
        .prepare('SELECT COUNT(*) as cnt FROM evidence_vault WHERE owner_uid = ?')
        .get(ownerKey) as { cnt: number }
    ).cnt;
    const reposCount = (
      this.db
        .prepare('SELECT COUNT(*) as cnt FROM repositories WHERE owner_uid = ?')
        .get(ownerKey) as { cnt: number }
    ).cnt;
    const syncsCount = (
      this.db
        .prepare('SELECT COUNT(*) as cnt FROM sync_history WHERE owner_uid = ?')
        .get(ownerKey) as { cnt: number }
    ).cnt;

    const verifiedClaimsCount = claims.filter(c => isClaimApproved(c)).length;

    return {
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '1.5.0-phase1.5',
      storageDriver: this.storageMode === 'production_persistent' ? 'sqlite_persistent' : 'sqlite_local',
      storageMode: this.storageMode,
      databasePath: path.basename(this.dbPath),
      profileLoaded: true,
      evidenceCount,
      claimsCount: claims.length,
      verifiedClaimsCount,
      repositoriesCount: reposCount,
      syncRunsCount: syncsCount,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      githubApiReady: true,
      securityScannerActive: true,
      authConfigured: true
    };
  }

  private touchProfileTimestamp(): void {
    this.db
      .prepare('UPDATE career_profiles SET last_updated = ?, version = version + 1 WHERE id = ?')
      .run(new Date().toISOString(), this.profileId);
  }
}
