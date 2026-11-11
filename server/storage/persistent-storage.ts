/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Persistent SQLite Storage Adapter
 * Implements Step 2: Persistent Career Storage using Node.js built-in SQLite (node:sqlite)
 * with normalized relational tables, schema validation, deduplication fingerprints,
 * historical review logs, and zero silent fallback to volatile memory.
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  VerifiedCareerProfile,
  EvidenceSource,
  CareerClaim,
  VerificationStatus,
  AuditLogEntry,
  SystemHealth,
  GitHubRepositoryRecord,
  SyncHistoryRecord,
  resolveLifecycleState,
  isClaimApproved
} from '../../shared/types/career-profile';
import { StorageAdapter } from './storage.interface';
import { SAMPLE_CAREER_PROFILE } from './sample-data';
import { SchemaValidator } from './schema-validator';

export interface PersistentStorageOptions {
  dbPath?: string;
  storageMode?: 'development_persistent' | 'production_persistent';
  seedSampleIfEmpty?: boolean;
}

export class PersistentSqliteStorageAdapter implements StorageAdapter {
  private db: DatabaseSync;
  private dbPath: string;
  private storageMode: 'development_persistent' | 'production_persistent';
  private startTime: number;
  private profileId = 'profile-primary';

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

    // Ensure directory exists; never silently fall back to in-memory
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initializeSchema();

    if (options.seedSampleIfEmpty !== false) {
      this.seedIfEmpty(SAMPLE_CAREER_PROFILE);
    }
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public close(): void {
    this.db.close();
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
        full_name TEXT NOT NULL UNIQUE,
        github_repo_id INTEGER NOT NULL,
        owner_login TEXT NOT NULL,
        record_json TEXT NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evidence_vault (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        uri TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS career_claims (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        username TEXT NOT NULL,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT NOT NULL
      );
    `);

    const migrationCheck = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 1')
      .get();
    if (!migrationCheck) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)')
        .run(1, new Date().toISOString(), 'Phase 1 initial normalized career intelligence schema');
    }
  }

  private seedIfEmpty(sample: VerifiedCareerProfile): void {
    const existing = this.db
      .prepare('SELECT id FROM career_profiles LIMIT 1')
      .get() as { id: string } | undefined;

    if (existing) {
      this.profileId = existing.id;
      return;
    }

    this.profileId = sample.id;
    this.persistFullProfileSync(sample);
  }

  private persistFullProfileSync(profile: VerifiedCareerProfile): void {
    SchemaValidator.validateProfile(profile);

    this.db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      this.db
        .prepare(`
          INSERT INTO career_profiles (
            id, candidate_name, email, location, headline, summary,
            skills_json, experiences_json, projects_json, education_json,
            resume_versions_json, settings_json, is_sample_data, version, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
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

      // Sync evidence_vault table
      for (const ev of profile.evidenceVault) {
        const fp =
          ev.fingerprint ||
          SchemaValidator.computeFingerprint('evidence', ev.type, ev.uri, ev.provenance.commitSha || ev.id);
        const enriched: EvidenceSource = { ...ev, fingerprint: fp };
        this.db
          .prepare(`
            INSERT INTO evidence_vault (id, fingerprint, type, title, uri, record_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              fingerprint = excluded.fingerprint,
              type = excluded.type,
              title = excluded.title,
              uri = excluded.uri,
              record_json = excluded.record_json
          `)
          .run(
            enriched.id,
            fp,
            enriched.type,
            enriched.title,
            enriched.uri,
            JSON.stringify(enriched),
            enriched.provenance.fetchedAt || new Date().toISOString()
          );
      }

      // Sync career_claims table (INSERT OR IGNORE so saveProfile never clobbers a newer claim verification status)
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
        this.db
          .prepare(`
            INSERT OR IGNORE INTO career_claims (id, fingerprint, category, verification_status, lifecycle_state, record_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            enriched.id,
            fp,
            enriched.category,
            enriched.verificationStatus,
            lifecycle,
            JSON.stringify(enriched),
            new Date().toISOString()
          );
      }

      // Sync repositories if provided
      if (Array.isArray(profile.repositories)) {
        for (const repo of profile.repositories) {
          this.db
            .prepare(`
              INSERT INTO repositories (id, full_name, github_repo_id, owner_login, record_json, last_synced_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(full_name) DO UPDATE SET
                record_json = excluded.record_json,
                last_synced_at = excluded.last_synced_at
            `)
            .run(
              repo.id,
              repo.fullName,
              repo.githubRepoId,
              repo.ownerLogin,
              JSON.stringify(repo),
              repo.lastSyncedAt
            );
        }
      }

      // Sync audit_logs
      for (const log of profile.auditTrail) {
        this.db
          .prepare(`
            INSERT OR IGNORE INTO audit_logs (id, timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(log.id, log.timestamp, log.actor, log.action, log.targetId, log.details);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public async getProfile(): Promise<VerifiedCareerProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM career_profiles WHERE id = ? LIMIT 1')
      .get(this.profileId) as Record<string, any> | undefined;

    if (!row) return null;

    const evidenceRows = this.db
      .prepare('SELECT record_json FROM evidence_vault ORDER BY created_at DESC')
      .all() as { record_json: string }[];
    const claimRows = this.db
      .prepare('SELECT record_json FROM career_claims ORDER BY updated_at DESC')
      .all() as { record_json: string }[];
    const repoRows = this.db
      .prepare('SELECT record_json FROM repositories ORDER BY last_synced_at DESC')
      .all() as { record_json: string }[];
    const syncRows = this.db
      .prepare('SELECT record_json FROM sync_history ORDER BY started_at DESC LIMIT 25')
      .all() as { record_json: string }[];
    const auditRows = this.db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100')
      .all() as {
      id: string;
      timestamp: string;
      actor: AuditLogEntry['actor'];
      action: AuditLogEntry['action'];
      target_id: string;
      details: string;
    }[];

    return {
      id: row.id,
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
        id: a.id,
        timestamp: a.timestamp,
        actor: a.actor,
        action: a.action,
        targetId: a.target_id,
        details: a.details
      })),
      isSampleData: Boolean(row.is_sample_data),
      version: Number(row.version),
      lastUpdated: row.last_updated
    };
  }

  public async saveProfile(updated: VerifiedCareerProfile): Promise<void> {
    const nextProfile: VerifiedCareerProfile = {
      ...updated,
      lastUpdated: new Date().toISOString(),
      version: (updated.version || 1) + 1
    };
    this.profileId = nextProfile.id;
    this.persistFullProfileSync(nextProfile);
  }

  public async getClaim(claimId: string): Promise<CareerClaim | null> {
    const row = this.db
      .prepare('SELECT record_json FROM career_claims WHERE id = ?')
      .get(claimId) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) : null;
  }

  public async upsertClaim(claim: CareerClaim): Promise<{ claim: CareerClaim; created: boolean }> {
    const evidenceRows = this.db
      .prepare('SELECT id FROM evidence_vault')
      .all() as { id: string }[];
    const knownEvidenceIds = new Set(evidenceRows.map(r => r.id));

    SchemaValidator.validateClaim(claim, knownEvidenceIds);

    const fp =
      claim.fingerprint ||
      SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');

    // Check if an identical claim already exists by fingerprint or ID
    const existingRow = this.db
      .prepare('SELECT id, record_json FROM career_claims WHERE fingerprint = ? OR id = ? LIMIT 1')
      .get(fp, claim.id) as { id: string; record_json: string } | undefined;

    if (existingRow) {
      const existingClaim: CareerClaim = JSON.parse(existingRow.record_json);
      // Merge evidenceIds without losing prior review status!
      const mergedEvidenceIds = Array.from(new Set([...existingClaim.evidenceIds, ...claim.evidenceIds]));
      const updatedClaim: CareerClaim = {
        ...existingClaim,
        evidenceIds: mergedEvidenceIds,
        fingerprint: fp,
        supportingExplanation: claim.supportingExplanation || existingClaim.supportingExplanation
      };
      this.db
        .prepare('UPDATE career_claims SET record_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(updatedClaim), new Date().toISOString(), existingClaim.id);

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
        INSERT INTO career_claims (id, fingerprint, category, verification_status, lifecycle_state, record_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        newClaim.id,
        fp,
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
      statement: typeof updates.statement === 'string' && updates.statement.trim() ? updates.statement.trim() : existing.statement,
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
      .prepare('UPDATE career_claims SET category = ?, record_json = ?, updated_at = ? WHERE id = ?')
      .run(updated.category, JSON.stringify(updated), new Date().toISOString(), claimId);

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
    const existing = await this.getClaim(claimId);
    if (!existing) return false;

    this.db.prepare('DELETE FROM career_claims WHERE id = ?').run(claimId);
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
        WHERE id = ?
      `)
      .run(status, claim.lifecycleState, JSON.stringify(claim), new Date().toISOString(), claimId);

    // Sync any matching highlight in experiences
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
    const row = this.db
      .prepare('SELECT record_json FROM evidence_vault WHERE id = ?')
      .get(evidenceId) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) : null;
  }

  public async listEvidence(): Promise<EvidenceSource[]> {
    const rows = this.db
      .prepare('SELECT record_json FROM evidence_vault ORDER BY created_at DESC')
      .all() as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async addEvidence(evidence: EvidenceSource): Promise<void> {
    SchemaValidator.validateEvidence(evidence);
    const exists = await this.getEvidence(evidence.id);
    if (exists) {
      throw new Error(`Evidence with ID ${evidence.id} already exists`);
    }

    const fp =
      evidence.fingerprint ||
      SchemaValidator.computeFingerprint('evidence', evidence.type, evidence.uri, evidence.provenance.commitSha || evidence.id);

    const enriched: EvidenceSource = { ...evidence, fingerprint: fp };
    this.db
      .prepare(`
        INSERT INTO evidence_vault (id, fingerprint, type, title, uri, record_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        enriched.id,
        fp,
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
    const fp =
      evidence.fingerprint ||
      SchemaValidator.computeFingerprint('evidence', evidence.type, evidence.uri, evidence.provenance.commitSha || '');

    const existingRow = this.db
      .prepare('SELECT id, record_json FROM evidence_vault WHERE fingerprint = ? OR id = ? LIMIT 1')
      .get(fp, evidence.id) as { id: string; record_json: string } | undefined;

    if (existingRow) {
      const existing: EvidenceSource = JSON.parse(existingRow.record_json);
      const updated: EvidenceSource = {
        ...existing,
        ...evidence,
        id: existing.id,
        fingerprint: fp
      };
      this.db
        .prepare('UPDATE evidence_vault SET title = ?, uri = ?, record_json = ? WHERE id = ?')
        .run(updated.title, updated.uri, JSON.stringify(updated), existing.id);
      return { evidence: updated, created: false };
    }

    const enriched: EvidenceSource = { ...evidence, fingerprint: fp };
    this.db
      .prepare(`
        INSERT INTO evidence_vault (id, fingerprint, type, title, uri, record_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        enriched.id,
        fp,
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
    const existing = await this.getEvidence(evidenceId);
    if (!existing) return false;

    this.db.prepare('DELETE FROM evidence_vault WHERE id = ?').run(evidenceId);
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
    const rows = this.db
      .prepare('SELECT record_json FROM repositories ORDER BY last_synced_at DESC')
      .all() as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async upsertRepository(
    repo: GitHubRepositoryRecord
  ): Promise<{ repo: GitHubRepositoryRecord; updated: boolean }> {
    const existingRow = this.db
      .prepare('SELECT record_json FROM repositories WHERE full_name = ? LIMIT 1')
      .get(repo.fullName) as { record_json: string } | undefined;

    let meaningfulChange = true;
    if (existingRow) {
      const prev: GitHubRepositoryRecord = JSON.parse(existingRow.record_json);
      meaningfulChange =
        prev.pushedAt !== repo.pushedAt ||
        prev.latestCommitSha !== repo.latestCommitSha ||
        prev.description !== repo.description ||
        prev.stargazersCount !== repo.stargazersCount;
    }

    this.db
      .prepare(`
        INSERT INTO repositories (id, full_name, github_repo_id, owner_login, record_json, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(full_name) DO UPDATE SET
          record_json = excluded.record_json,
          last_synced_at = excluded.last_synced_at
      `)
      .run(
        repo.id,
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
    const rows = this.db
      .prepare('SELECT record_json FROM sync_history ORDER BY started_at DESC LIMIT 25')
      .all() as { record_json: string }[];
    return rows.map(r => JSON.parse(r.record_json));
  }

  public async addSyncHistory(record: SyncHistoryRecord): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO sync_history (id, provider, username, started_at, status, record_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          record_json = excluded.record_json
      `)
      .run(
        record.id,
        record.provider,
        record.username,
        record.startedAt,
        record.status,
        JSON.stringify(record)
      );
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100')
      .all() as {
      id: string;
      timestamp: string;
      actor: AuditLogEntry['actor'];
      action: AuditLogEntry['action'];
      target_id: string;
      details: string;
    }[];

    return rows.map(a => ({
      id: a.id,
      timestamp: a.timestamp,
      actor: a.actor,
      action: a.action,
      targetId: a.target_id,
      details: a.details
    }));
  }

  public async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const newEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.db
      .prepare('INSERT INTO audit_logs (id, timestamp, actor, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newEntry.id, newEntry.timestamp, newEntry.actor, newEntry.action, newEntry.targetId, newEntry.details);

    return newEntry;
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const claims = (
      this.db.prepare('SELECT record_json FROM career_claims').all() as { record_json: string }[]
    ).map(r => JSON.parse(r.record_json) as CareerClaim);

    const evidenceCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM evidence_vault').get() as { cnt: number }
    ).cnt;
    const reposCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM repositories').get() as { cnt: number }
    ).cnt;
    const syncsCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM sync_history').get() as { cnt: number }
    ).cnt;

    const verifiedClaimsCount = claims.filter(c => isClaimApproved(c)).length;

    return {
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '1.0.0-phase1',
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
      securityScannerActive: true
    };
  }

  private touchProfileTimestamp(): void {
    this.db
      .prepare('UPDATE career_profiles SET last_updated = ?, version = version + 1 WHERE id = ?')
      .run(new Date().toISOString(), this.profileId);
  }
}
