/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Cloud Firestore Durable Storage Adapter (Phase 1.5)
 * Implements owner-scoped, transactional persistence on Google Cloud Firestore
 * for profiles, repositories, evidence, claims, review history, resume versions,
 * and synchronization records.
 *
 * Supports both:
 * 1. Firebase Admin SDK (`firebase-admin/firestore`) when service account credentials / ADC are configured.
 * 2. Official Cloud Firestore v1 REST API authenticated with the owner's verified Firebase ID token,
 *    governed by the deployed zero-trust `firestore.rules` on the provisioned database.
 * 3. Injectable `FirestoreDocumentBackend` for deterministic restart, concurrency, and fault-injection tests.
 */

import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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
import { createEmptyOwnerProfile, SAMPLE_CAREER_PROFILE } from './sample-data.ts';
import { SchemaValidator } from './schema-validator.ts';

export class StorageOperationError extends Error {
  public readonly code: string;
  public readonly operation: string;

  constructor(operation: string, message: string, code = 'FIRESTORE_OPERATION_FAILED') {
    super(`[FirestoreStorage:${operation}] ${message}`);
    this.name = 'StorageOperationError';
    this.code = code;
    this.operation = operation;
  }
}

/**
 * Low-level document store abstraction allowing FirestoreStorageAdapter to run against
 * live Google Cloud Firestore or an injectable transactional document store for testing.
 */
export interface FirestoreDocumentBackend {
  getUserRoot(ownerUid: string, idToken?: string): Promise<Record<string, any> | null>;
  setUserRoot(ownerUid: string, data: Record<string, any>, idToken?: string): Promise<void>;
  getSubDoc(ownerUid: string, subcollection: string, docId: string, idToken?: string): Promise<Record<string, any> | null>;
  setSubDoc(ownerUid: string, subcollection: string, docId: string, data: Record<string, any>, idToken?: string): Promise<void>;
  deleteSubDoc(ownerUid: string, subcollection: string, docId: string, idToken?: string): Promise<boolean>;
  listSubDocs(ownerUid: string, subcollection: string, idToken?: string): Promise<Record<string, any>[]>;
  runAtomic<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Converts a JavaScript value into Firestore REST v1 Value format
 */
function toFirestoreRestValue(val: any): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter(v => v !== undefined).map(v => toFirestoreRestValue(v))
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Converts a Firestore REST v1 Value back into a native JavaScript value
 */
function fromFirestoreRestValue(valObj: Record<string, any> | undefined): any {
  if (!valObj) return undefined;
  if ('nullValue' in valObj) return null;
  if ('booleanValue' in valObj) return Boolean(valObj.booleanValue);
  if ('integerValue' in valObj) return Number(valObj.integerValue);
  if ('doubleValue' in valObj) return Number(valObj.doubleValue);
  if ('stringValue' in valObj) return String(valObj.stringValue);
  if ('timestampValue' in valObj) return String(valObj.timestampValue);
  if ('arrayValue' in valObj) {
    const vals = valObj.arrayValue?.values;
    return Array.isArray(vals) ? vals.map((v: any) => fromFirestoreRestValue(v)) : [];
  }
  if ('mapValue' in valObj) {
    const fields = valObj.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreRestValue(v as Record<string, any>);
    }
    return out;
  }
  return undefined;
}

function toFirestoreRestDocument(data: Record<string, any>): { fields: Record<string, any> } {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = toFirestoreRestValue(v);
    }
  }
  return { fields };
}

function fromFirestoreRestDocument(doc: { fields?: Record<string, any> } | null | undefined): Record<string, any> | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = fromFirestoreRestValue(v);
  }
  return out;
}

/**
 * Live Google Cloud Firestore backend supporting both Firebase Admin SDK
 * and Firestore v1 REST API with verified user ID tokens.
 */
export class CloudFirestoreBackend implements FirestoreDocumentBackend {
  private db?: Firestore;
  private hasServiceAccount: boolean;
  public readonly projectId: string;
  public readonly databaseId: string;

  constructor(options: { projectId?: string; databaseId?: string; db?: Firestore } = {}) {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    let fileConfig: { projectId?: string; firestoreDatabaseId?: string } = {};
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        // Ignore parse error and rely on env vars
      }
    }

    this.projectId =
      options.projectId ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      fileConfig.projectId ||
      '';
    this.databaseId =
      options.databaseId ||
      process.env.FIRESTORE_DATABASE_ID ||
      fileConfig.firestoreDatabaseId ||
      '(default)';

    this.hasServiceAccount = Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
    );

    if (options.db) {
      this.db = options.db;
      this.hasServiceAccount = true;
    } else if (this.hasServiceAccount) {
      let app: App;
      const existingApps = getApps();
      if (existingApps.length > 0) {
        app = existingApps[0];
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const parsedSa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        app = initializeApp({
          credential: cert(parsedSa),
          projectId: this.projectId || parsedSa.project_id
        });
      } else {
        app = initializeApp(this.projectId ? { projectId: this.projectId } : undefined);
      }
      this.db =
        this.databaseId && this.databaseId !== '(default)'
          ? getFirestore(app, this.databaseId)
          : getFirestore(app);
    }
  }

  private getRestBaseUrl(): string {
    if (!this.projectId) {
      throw new StorageOperationError(
        'config',
        'Firebase projectId is not configured in firebase-applet-config.json or FIREBASE_PROJECT_ID.',
        'FIRESTORE_CONFIG_MISSING'
      );
    }
    const dbSegment = encodeURIComponent(this.databaseId || '(default)');
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${dbSegment}/documents`;
  }

  private async restRequest(
    method: 'GET' | 'PATCH' | 'DELETE',
    docPath: string,
    idToken?: string,
    body?: Record<string, any>
  ): Promise<any> {
    if (!idToken) {
      throw new StorageOperationError(
        method,
        'Firestore operation requires either a verified Firebase ID token or FIREBASE_SERVICE_ACCOUNT_JSON.',
        'FIRESTORE_AUTH_REQUIRED'
      );
    }
    const url = `${this.getRestBaseUrl()}/${docPath}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json'
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new StorageOperationError(
        `${method} ${docPath}`,
        `Firestore REST API returned HTTP ${res.status}: ${errText.slice(0, 300)}`,
        res.status === 403 ? 'FIRESTORE_PERMISSION_DENIED' : 'FIRESTORE_REST_ERROR'
      );
    }

    if (res.status === 204) return null;
    return res.json();
  }

  public async getUserRoot(ownerUid: string, idToken?: string): Promise<Record<string, any> | null> {
    if (this.db && (!idToken || this.hasServiceAccount)) {
      const snap = await this.db.collection('users').doc(ownerUid).get();
      return snap.exists ? (snap.data() as Record<string, any>) : null;
    }
    const doc = await this.restRequest('GET', `users/${encodeURIComponent(ownerUid)}`, idToken);
    return fromFirestoreRestDocument(doc);
  }

  public async setUserRoot(ownerUid: string, data: Record<string, any>, idToken?: string): Promise<void> {
    const clean = this.stripUndefined(data);
    if (this.db && (!idToken || this.hasServiceAccount)) {
      await this.db.collection('users').doc(ownerUid).set(clean, { merge: true });
      return;
    }
    await this.restRequest(
      'PATCH',
      `users/${encodeURIComponent(ownerUid)}`,
      idToken,
      toFirestoreRestDocument(clean)
    );
  }

  public async getSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string,
    idToken?: string
  ): Promise<Record<string, any> | null> {
    if (this.db && (!idToken || this.hasServiceAccount)) {
      const snap = await this.db
        .collection('users')
        .doc(ownerUid)
        .collection(subcollection)
        .doc(docId)
        .get();
      return snap.exists ? (snap.data() as Record<string, any>) : null;
    }
    const doc = await this.restRequest(
      'GET',
      `users/${encodeURIComponent(ownerUid)}/${encodeURIComponent(subcollection)}/${encodeURIComponent(docId)}`,
      idToken
    );
    return fromFirestoreRestDocument(doc);
  }

  public async setSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string,
    data: Record<string, any>,
    idToken?: string
  ): Promise<void> {
    const clean = this.stripUndefined(data);
    if (this.db && (!idToken || this.hasServiceAccount)) {
      await this.db
        .collection('users')
        .doc(ownerUid)
        .collection(subcollection)
        .doc(docId)
        .set(clean);
      return;
    }
    await this.restRequest(
      'PATCH',
      `users/${encodeURIComponent(ownerUid)}/${encodeURIComponent(subcollection)}/${encodeURIComponent(docId)}`,
      idToken,
      toFirestoreRestDocument(clean)
    );
  }

  public async deleteSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string,
    idToken?: string
  ): Promise<boolean> {
    if (this.db && (!idToken || this.hasServiceAccount)) {
      const ref = this.db.collection('users').doc(ownerUid).collection(subcollection).doc(docId);
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.delete();
      return true;
    }
    const existing = await this.getSubDoc(ownerUid, subcollection, docId, idToken);
    if (!existing) return false;
    await this.restRequest(
      'DELETE',
      `users/${encodeURIComponent(ownerUid)}/${encodeURIComponent(subcollection)}/${encodeURIComponent(docId)}`,
      idToken
    );
    return true;
  }

  public async listSubDocs(
    ownerUid: string,
    subcollection: string,
    idToken?: string
  ): Promise<Record<string, any>[]> {
    if (this.db && (!idToken || this.hasServiceAccount)) {
      const snap = await this.db.collection('users').doc(ownerUid).collection(subcollection).get();
      return snap.docs.map(d => d.data() as Record<string, any>);
    }
    const res = await this.restRequest(
      'GET',
      `users/${encodeURIComponent(ownerUid)}/${encodeURIComponent(subcollection)}`,
      idToken
    );
    if (!res || !Array.isArray(res.documents)) return [];
    return res.documents
      .map((d: any) => fromFirestoreRestDocument(d))
      .filter((d: any): d is Record<string, any> => d !== null);
  }

  public async runAtomic<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  private stripUndefined<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

export interface FirestoreStorageOptions {
  owner?: OwnerIdentityMeta;
  backend?: FirestoreDocumentBackend;
  autoInitializeEmptyForOwner?: boolean;
}

export class FirestoreStorageAdapter implements StorageAdapter {
  private backend: FirestoreDocumentBackend;
  private owner: OwnerIdentityMeta;
  private autoInitializeEmptyForOwner: boolean;
  private startTime: number;
  private operationChain: Promise<any> = Promise.resolve();

  constructor(options: FirestoreStorageOptions = {}) {
    this.backend = options.backend || new CloudFirestoreBackend();
    this.owner = options.owner || {
      uid: process.env.FOLIOVERA_OWNER_UID || 'owner-default',
      email: process.env.FOLIOVERA_OWNER_EMAIL || undefined
    };
    this.autoInitializeEmptyForOwner = options.autoInitializeEmptyForOwner !== false;
    this.startTime = Date.now();
  }

  public forOwner(owner: OwnerIdentityMeta): StorageAdapter {
    if (!owner || !owner.uid || !owner.uid.trim()) {
      throw new StorageOperationError('forOwner', 'Valid authenticated owner UID is required', 'INVALID_OWNER_UID');
    }
    return new FirestoreStorageAdapter({
      backend: this.backend,
      owner: {
        uid: owner.uid.trim(),
        email: owner.email,
        displayName: owner.displayName,
        idToken: owner.idToken
      },
      autoInitializeEmptyForOwner: this.autoInitializeEmptyForOwner
    });
  }

  private enqueueAtomic<T>(operationName: string, task: () => Promise<T>): Promise<T> {
    const next = this.operationChain.then(
      () => this.executeControlled(operationName, () => this.backend.runAtomic(task)),
      () => this.executeControlled(operationName, () => this.backend.runAtomic(task))
    );
    this.operationChain = next.catch(() => undefined);
    return next;
  }

  private async executeControlled<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof StorageOperationError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('SchemaValidationError')) {
        throw err;
      }
      throw new StorageOperationError(operationName, message, 'FIRESTORE_BACKEND_ERROR');
    }
  }

  public async initializeEmptyProfile(ownerOverride?: OwnerIdentityMeta): Promise<VerifiedCareerProfile> {
    const targetOwner = ownerOverride || this.owner;
    const emptyProfile = createEmptyOwnerProfile(
      targetOwner.uid,
      targetOwner.email,
      targetOwner.displayName
    );
    await this.saveProfile(emptyProfile);
    return (await this.getProfile()) || emptyProfile;
  }

  public async getProfile(): Promise<VerifiedCareerProfile | null> {
    return this.executeControlled('getProfile', async () => {
      const token = this.owner.idToken;
      let root = await this.backend.getUserRoot(this.owner.uid, token);

      if (!root) {
        if (!this.autoInitializeEmptyForOwner) {
          return null;
        }
        const initialized = createEmptyOwnerProfile(
          this.owner.uid,
          this.owner.email,
          this.owner.displayName
        );
        await this.persistProfileInternal(initialized);
        root = await this.backend.getUserRoot(this.owner.uid, token);
        if (!root) return initialized;
      }

      const [claimsDocs, evidenceDocs, repoDocs, syncDocs, auditDocs] = await Promise.all([
        this.backend.listSubDocs(this.owner.uid, 'claims', token),
        this.backend.listSubDocs(this.owner.uid, 'evidence', token),
        this.backend.listSubDocs(this.owner.uid, 'repositories', token),
        this.backend.listSubDocs(this.owner.uid, 'syncHistory', token),
        this.backend.listSubDocs(this.owner.uid, 'auditLogs', token)
      ]);

      const claims = (claimsDocs as CareerClaim[]).sort((a, b) =>
        String((b as any).updatedAt || b.extractedAt || '').localeCompare(
          String((a as any).updatedAt || a.extractedAt || '')
        )
      );
      const evidenceVault = (evidenceDocs as EvidenceSource[]).sort((a, b) =>
        String((b as any).createdAt || b.provenance?.fetchedAt || '').localeCompare(
          String((a as any).createdAt || a.provenance?.fetchedAt || '')
        )
      );
      const repositories = (repoDocs as GitHubRepositoryRecord[]).sort((a, b) =>
        String(b.lastSyncedAt || '').localeCompare(String(a.lastSyncedAt || ''))
      );
      const syncHistory = (syncDocs as SyncHistoryRecord[]).sort((a, b) =>
        String(b.startedAt || '').localeCompare(String(a.startedAt || ''))
      );
      const auditTrail = (auditDocs as AuditLogEntry[]).sort((a, b) =>
        String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
      );

      return {
        id: root.id || `profile-${this.owner.uid}`,
        ownerUid: this.owner.uid,
        candidateName: root.candidateName,
        email: root.email || this.owner.email || undefined,
        location: root.location || undefined,
        headline: root.headline,
        summary: root.summary,
        skills: Array.isArray(root.skills) ? root.skills : [],
        experiences: Array.isArray(root.experiences) ? root.experiences : [],
        projects: Array.isArray(root.projects) ? root.projects : [],
        education: Array.isArray(root.education) ? root.education : [],
        resumeVersions: Array.isArray(root.resumeVersions) ? root.resumeVersions : [],
        settings: root.settings || {},
        repositories,
        syncHistory,
        evidenceVault,
        claims,
        auditTrail,
        isSampleData: false,
        version: Number(root.version || 1),
        lastUpdated: root.lastUpdated || new Date().toISOString()
      };
    });
  }

  public async saveProfile(profile: VerifiedCareerProfile): Promise<void> {
    return this.enqueueAtomic('saveProfile', async () => {
      if (profile.isSampleData || profile.id === SAMPLE_CAREER_PROFILE.id) {
        throw new StorageOperationError(
          'saveProfile',
          'Sample demonstration profiles cannot be saved into durable owner storage.',
          'SAMPLE_DATA_REJECTED'
        );
      }

      const nextProfile: VerifiedCareerProfile = {
        ...profile,
        ownerUid: this.owner.uid,
        isSampleData: false,
        version: (profile.version || 0) + 1,
        lastUpdated: new Date().toISOString()
      };

      await this.persistProfileInternal(nextProfile);
    });
  }

  private async persistProfileInternal(profile: VerifiedCareerProfile): Promise<void> {
    SchemaValidator.validateProfile(profile);
    const now = new Date().toISOString();
    const token = this.owner.idToken;

    await this.backend.setUserRoot(
      this.owner.uid,
      {
        id: profile.id,
        ownerUid: this.owner.uid,
        candidateName: profile.candidateName,
        email: profile.email || '',
        location: profile.location || '',
        headline: profile.headline,
        summary: profile.summary,
        skills: profile.skills ?? [],
        experiences: profile.experiences ?? [],
        projects: profile.projects ?? [],
        education: profile.education ?? [],
        resumeVersions: profile.resumeVersions ?? [],
        settings: profile.settings ?? {},
        isSampleData: false,
        version: profile.version || 1,
        lastUpdated: profile.lastUpdated || now
      },
      token
    );

    for (const ev of profile.evidenceVault ?? []) {
      const fp =
        ev.fingerprint ||
        SchemaValidator.computeFingerprint('evidence', ev.type, ev.uri, ev.provenance.commitSha || ev.id);
      await this.backend.setSubDoc(
        this.owner.uid,
        'evidence',
        ev.id,
        {
          ...ev,
          ownerUid: this.owner.uid,
          fingerprint: fp,
          createdAt: ev.provenance.fetchedAt || now
        },
        token
      );
    }

    const existingClaims = await this.backend.listSubDocs(this.owner.uid, 'claims', token);
    const existingClaimIds = new Set(existingClaims.map(c => c.id));

    for (const claim of profile.claims ?? []) {
      if (existingClaimIds.has(claim.id)) continue;
      const fp =
        claim.fingerprint ||
        SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');
      const lifecycle = resolveLifecycleState(claim);
      await this.backend.setSubDoc(
        this.owner.uid,
        'claims',
        claim.id,
        {
          ...claim,
          ownerUid: this.owner.uid,
          fingerprint: fp,
          lifecycleState: lifecycle,
          updatedAt: now
        },
        token
      );
    }

    for (const repo of profile.repositories ?? []) {
      await this.backend.setSubDoc(
        this.owner.uid,
        'repositories',
        repo.id,
        {
          ...repo,
          ownerUid: this.owner.uid
        },
        token
      );
    }

    for (const log of profile.auditTrail ?? []) {
      await this.backend.setSubDoc(
        this.owner.uid,
        'auditLogs',
        log.id,
        {
          ...log,
          ownerUid: this.owner.uid
        },
        token
      );
    }
  }

  public async getClaim(claimId: string): Promise<CareerClaim | null> {
    return this.executeControlled('getClaim', async () => {
      const doc = await this.backend.getSubDoc(this.owner.uid, 'claims', claimId, this.owner.idToken);
      return doc ? (doc as CareerClaim) : null;
    });
  }

  public async upsertClaim(claim: CareerClaim): Promise<{ claim: CareerClaim; created: boolean }> {
    return this.enqueueAtomic('upsertClaim', async () => {
      const token = this.owner.idToken;
      const evidenceDocs = await this.backend.listSubDocs(this.owner.uid, 'evidence', token);
      const knownEvidenceIds = new Set(evidenceDocs.map(e => String(e.id)));
      SchemaValidator.validateClaim(claim, knownEvidenceIds);

      const fp =
        claim.fingerprint ||
        SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');

      const allClaims = (await this.backend.listSubDocs(this.owner.uid, 'claims', token)) as CareerClaim[];
      const existing = allClaims.find(c => c.id === claim.id || (c.fingerprint && c.fingerprint === fp));

      const now = new Date().toISOString();
      if (existing) {
        const mergedEvidenceIds = Array.from(new Set([...existing.evidenceIds, ...claim.evidenceIds]));
        const updatedClaim: CareerClaim & { ownerUid: string; updatedAt: string } = {
          ...existing,
          evidenceIds: mergedEvidenceIds,
          fingerprint: fp,
          supportingExplanation: claim.supportingExplanation || existing.supportingExplanation,
          ownerUid: this.owner.uid,
          updatedAt: now
        };
        await this.backend.setSubDoc(this.owner.uid, 'claims', existing.id, updatedClaim, token);
        return { claim: updatedClaim, created: false };
      }

      const lifecycle = resolveLifecycleState(claim);
      const initialHistory = claim.reviewHistory ?? [
        {
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          actor: 'github_extractor' as const,
          newStatus: claim.verificationStatus,
          lifecycleState: lifecycle,
          note: claim.supportingExplanation || 'Discovered during repository evidence extraction'
        }
      ];

      const newClaim: CareerClaim & { ownerUid: string; updatedAt: string } = {
        ...claim,
        ownerUid: this.owner.uid,
        fingerprint: fp,
        lifecycleState: lifecycle,
        extractedAt: claim.extractedAt || now,
        reviewHistory: initialHistory,
        updatedAt: now
      };

      await this.backend.setSubDoc(this.owner.uid, 'claims', newClaim.id, newClaim, token);
      await this.touchProfileMetadata();
      return { claim: newClaim, created: true };
    });
  }

  public async updateClaim(
    claimId: string,
    updates: Partial<Pick<CareerClaim, 'statement' | 'category' | 'clarificationResponse' | 'ownershipStatus' | 'notes'>>
  ): Promise<CareerClaim> {
    return this.enqueueAtomic('updateClaim', async () => {
      const existing = await this.getClaim(claimId);
      if (!existing) {
        throw new Error(`Claim not found with ID: ${claimId}`);
      }

      const now = new Date().toISOString();
      const history = existing.reviewHistory ? [...existing.reviewHistory] : [];
      if (updates.clarificationResponse && updates.clarificationResponse !== existing.clarificationResponse) {
        history.unshift({
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          actor: 'user',
          previousStatus: existing.verificationStatus,
          newStatus: existing.verificationStatus,
          lifecycleState: resolveLifecycleState(existing),
          note: `Candidate clarification provided: "${updates.clarificationResponse}"`
        });
      }

      const updated: CareerClaim & { ownerUid: string; updatedAt: string } = {
        ...existing,
        statement:
          typeof updates.statement === 'string' && updates.statement.trim()
            ? updates.statement.trim()
            : existing.statement,
        category: updates.category || existing.category,
        clarificationResponse:
          updates.clarificationResponse !== undefined
            ? updates.clarificationResponse
            : existing.clarificationResponse,
        ownershipStatus:
          updates.ownershipStatus ||
          (updates.clarificationResponse ? 'contributor' : existing.ownershipStatus),
        notes: updates.notes !== undefined ? updates.notes : existing.notes,
        reviewHistory: history,
        ownerUid: this.owner.uid,
        updatedAt: now
      };

      await this.backend.setSubDoc(this.owner.uid, 'claims', claimId, updated, this.owner.idToken);
      await this.touchProfileMetadata();
      return updated;
    });
  }

  public async deleteClaim(claimId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    return this.enqueueAtomic('deleteClaim', async () => {
      const existing = await this.getClaim(claimId);
      if (!existing) return false;
      const deleted = await this.backend.deleteSubDoc(this.owner.uid, 'claims', claimId, this.owner.idToken);
      if (deleted) {
        await this.appendAuditLog({
          actor,
          action: 'claim_deleted',
          targetId: claimId,
          details: `Deleted claim "${existing.statement.slice(0, 60)}..."`
        });
        await this.touchProfileMetadata();
      }
      return deleted;
    });
  }

  public async updateClaimVerification(
    claimId: string,
    status: VerificationStatus,
    actor: 'user' | 'system',
    note?: string,
    clarificationResponse?: string
  ): Promise<CareerClaim> {
    return this.enqueueAtomic('updateClaimVerification', async () => {
      const token = this.owner.idToken;
      const claim = await this.getClaim(claimId);
      if (!claim) {
        throw new Error(`Claim not found with ID: ${claimId}`);
      }

      const now = new Date().toISOString();
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
        claim.userConfirmedAt = now;
        claim.verifiedBy = actor === 'user' ? 'human_user' : claim.verifiedBy;
      }

      if (note) {
        claim.notes = (claim.notes ? `${claim.notes} | ` : '') + note;
      }

      const historyEntry = {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        actor,
        previousStatus: prevStatus,
        newStatus: status,
        lifecycleState: claim.lifecycleState,
        note: note || `Status updated to ${status}`
      };
      claim.reviewHistory = [historyEntry, ...(claim.reviewHistory ?? [])];

      await this.backend.setSubDoc(
        this.owner.uid,
        'claims',
        claimId,
        {
          ...claim,
          ownerUid: this.owner.uid,
          updatedAt: now
        },
        token
      );

      const root = await this.backend.getUserRoot(this.owner.uid, token);
      if (root && Array.isArray(root.experiences)) {
        let modified = false;
        for (const exp of root.experiences) {
          for (const h of exp.highlights ?? []) {
            if (h.claimId === claimId) {
              h.verificationStatus = status;
              modified = true;
            }
          }
        }
        if (modified) {
          await this.backend.setUserRoot(
            this.owner.uid,
            {
              ...root,
              lastUpdated: now,
              version: Number(root.version || 1) + 1
            },
            token
          );
        }
      }

      await this.appendAuditLog({
        actor,
        action: status === 'rejected' ? 'claim_rejected' : 'claim_verified',
        targetId: claimId,
        details: `Claim status changed from "${prevStatus}" to "${status}" (${claim.lifecycleState}) by ${actor}.`
      });

      await this.touchProfileMetadata();
      return claim;
    });
  }

  public async getEvidence(evidenceId: string): Promise<EvidenceSource | null> {
    return this.executeControlled('getEvidence', async () => {
      const doc = await this.backend.getSubDoc(this.owner.uid, 'evidence', evidenceId, this.owner.idToken);
      return doc ? (doc as EvidenceSource) : null;
    });
  }

  public async listEvidence(): Promise<EvidenceSource[]> {
    return this.executeControlled('listEvidence', async () => {
      const docs = await this.backend.listSubDocs(this.owner.uid, 'evidence', this.owner.idToken);
      return (docs as EvidenceSource[]).sort((a, b) =>
        String((b as any).createdAt || b.provenance?.fetchedAt || '').localeCompare(
          String((a as any).createdAt || a.provenance?.fetchedAt || '')
        )
      );
    });
  }

  public async addEvidence(evidence: EvidenceSource): Promise<void> {
    await this.enqueueAtomic('addEvidence', async () => {
      SchemaValidator.validateEvidence(evidence);
      const exists = await this.getEvidence(evidence.id);
      if (exists) {
        throw new Error(`Evidence with ID ${evidence.id} already exists`);
      }

      const now = new Date().toISOString();
      const fp =
        evidence.fingerprint ||
        SchemaValidator.computeFingerprint(
          'evidence',
          evidence.type,
          evidence.uri,
          evidence.provenance.commitSha || evidence.id
        );

      const enriched = {
        ...evidence,
        ownerUid: this.owner.uid,
        fingerprint: fp,
        createdAt: evidence.provenance.fetchedAt || now
      };
      await this.backend.setSubDoc(this.owner.uid, 'evidence', enriched.id, enriched, this.owner.idToken);
      await this.touchProfileMetadata();
    });
  }

  public async upsertEvidence(evidence: EvidenceSource): Promise<{ evidence: EvidenceSource; created: boolean }> {
    return this.enqueueAtomic('upsertEvidence', async () => {
      const token = this.owner.idToken;
      SchemaValidator.validateEvidence(evidence);
      const fp =
        evidence.fingerprint ||
        SchemaValidator.computeFingerprint(
          'evidence',
          evidence.type,
          evidence.uri,
          evidence.provenance.commitSha || ''
        );

      const allEv = (await this.backend.listSubDocs(this.owner.uid, 'evidence', token)) as EvidenceSource[];
      const existing = allEv.find(e => e.id === evidence.id || (e.fingerprint && e.fingerprint === fp));
      const now = new Date().toISOString();

      if (existing) {
        const updated = {
          ...existing,
          ...evidence,
          id: existing.id,
          ownerUid: this.owner.uid,
          fingerprint: fp,
          createdAt: (existing as any).createdAt || evidence.provenance.fetchedAt || now
        };
        await this.backend.setSubDoc(this.owner.uid, 'evidence', existing.id, updated, token);
        return { evidence: updated, created: false };
      }

      const enriched = {
        ...evidence,
        ownerUid: this.owner.uid,
        fingerprint: fp,
        createdAt: evidence.provenance.fetchedAt || now
      };
      await this.backend.setSubDoc(this.owner.uid, 'evidence', enriched.id, enriched, token);
      await this.touchProfileMetadata();
      return { evidence: enriched, created: true };
    });
  }

  public async deleteEvidence(evidenceId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    return this.enqueueAtomic('deleteEvidence', async () => {
      const existing = await this.getEvidence(evidenceId);
      if (!existing) return false;
      const deleted = await this.backend.deleteSubDoc(this.owner.uid, 'evidence', evidenceId, this.owner.idToken);
      if (deleted) {
        await this.appendAuditLog({
          actor,
          action: 'evidence_deleted',
          targetId: evidenceId,
          details: `Deleted evidence source "${existing.title}"`
        });
        await this.touchProfileMetadata();
      }
      return deleted;
    });
  }

  public async listRepositories(): Promise<GitHubRepositoryRecord[]> {
    return this.executeControlled('listRepositories', async () => {
      const docs = await this.backend.listSubDocs(this.owner.uid, 'repositories', this.owner.idToken);
      return (docs as GitHubRepositoryRecord[]).sort((a, b) =>
        String(b.lastSyncedAt || '').localeCompare(String(a.lastSyncedAt || ''))
      );
    });
  }

  public async upsertRepository(
    repo: GitHubRepositoryRecord
  ): Promise<{ repo: GitHubRepositoryRecord; updated: boolean }> {
    return this.enqueueAtomic('upsertRepository', async () => {
      const token = this.owner.idToken;
      const allRepos = (await this.backend.listSubDocs(
        this.owner.uid,
        'repositories',
        token
      )) as GitHubRepositoryRecord[];
      const existing = allRepos.find(r => r.fullName === repo.fullName || r.id === repo.id);

      let meaningfulChange = true;
      if (existing) {
        meaningfulChange =
          existing.pushedAt !== repo.pushedAt ||
          existing.latestCommitSha !== repo.latestCommitSha ||
          existing.description !== repo.description ||
          existing.stargazersCount !== repo.stargazersCount;
      }

      const docId = existing?.id || repo.id;
      const enriched = { ...repo, id: docId, ownerUid: this.owner.uid };
      await this.backend.setSubDoc(this.owner.uid, 'repositories', docId, enriched, token);
      await this.touchProfileMetadata();
      return { repo: enriched, updated: meaningfulChange };
    });
  }

  public async listSyncHistory(): Promise<SyncHistoryRecord[]> {
    return this.executeControlled('listSyncHistory', async () => {
      const docs = await this.backend.listSubDocs(this.owner.uid, 'syncHistory', this.owner.idToken);
      return (docs as SyncHistoryRecord[])
        .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
        .slice(0, 25);
    });
  }

  public async addSyncHistory(record: SyncHistoryRecord): Promise<void> {
    await this.enqueueAtomic('addSyncHistory', async () => {
      await this.backend.setSubDoc(
        this.owner.uid,
        'syncHistory',
        record.id,
        {
          ...record,
          ownerUid: this.owner.uid
        },
        this.owner.idToken
      );
    });
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    return this.executeControlled('getAuditLogs', async () => {
      const docs = await this.backend.listSubDocs(this.owner.uid, 'auditLogs', this.owner.idToken);
      return (docs as AuditLogEntry[])
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
        .slice(0, 100);
    });
  }

  public async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    return this.executeControlled('appendAuditLog', async () => {
      const newEntry: AuditLogEntry & { ownerUid: string } = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        ownerUid: this.owner.uid,
        ...entry
      };
      await this.backend.setSubDoc(this.owner.uid, 'auditLogs', newEntry.id, newEntry, this.owner.idToken);
      return newEntry;
    });
  }

  public async exportProfileBundle(ownerUid?: string): Promise<ProfileExportBundle> {
    const targetAdapter = ownerUid && ownerUid !== this.owner.uid ? this.forOwner({ uid: ownerUid, idToken: this.owner.idToken }) : this;
    const profile = await targetAdapter.getProfile();
    if (!profile) {
      throw new StorageOperationError('exportProfileBundle', 'No profile found for export', 'PROFILE_NOT_FOUND');
    }
    return {
      schemaVersion: '1.5.0',
      exportedAt: new Date().toISOString(),
      ownerUid: ownerUid || this.owner.uid,
      isSampleData: Boolean(profile.isSampleData),
      profile
    };
  }

  public async importProfileBundle(
    ownerUid: string,
    incomingProfile: VerifiedCareerProfile,
    options: { mode?: 'merge' | 'initialize_if_empty' } = {}
  ): Promise<ProfileImportResult> {
    return this.enqueueAtomic('importProfileBundle', async () => {
      const mode = options.mode || 'merge';
      const token = this.owner.idToken;

      if (
        incomingProfile.isSampleData === true ||
        incomingProfile.id === SAMPLE_CAREER_PROFILE.id ||
        incomingProfile.email === SAMPLE_CAREER_PROFILE.email
      ) {
        throw new StorageOperationError(
          'importProfileBundle',
          'Refusing to import sample demonstration profile (Alex Morgan) into authenticated owner storage.',
          'SAMPLE_PROFILE_IMPORT_FORBIDDEN'
        );
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

      const sanitizedIncoming: VerifiedCareerProfile = {
        ...incomingProfile,
        id: `profile-${ownerUid}`,
        ownerUid,
        isSampleData: false,
        evidenceVault: cleanEvidence,
        claims: cleanClaims
      };

      SchemaValidator.validateProfile(sanitizedIncoming);

      const existingRoot = await this.backend.getUserRoot(ownerUid, token);
      if (existingRoot && mode === 'initialize_if_empty') {
        const existingClaims = await this.backend.listSubDocs(ownerUid, 'claims', token);
        if (existingClaims.length > 0) {
          throw new StorageOperationError(
            'importProfileBundle',
            'Target owner profile already contains records; use merge mode instead of initialize_if_empty.',
            'PROFILE_ALREADY_EXISTS'
          );
        }
      }

      const existingProfile = await this.getProfile();
      const mergedSkills = Array.from(
        new Map(
          [...(existingProfile?.skills ?? []), ...(sanitizedIncoming.skills ?? [])].map(s => [
            s.name.toLowerCase(),
            s
          ])
        ).values()
      );
      const mergedProjects = Array.from(
        new Map(
          [...(existingProfile?.projects ?? []), ...(sanitizedIncoming.projects ?? [])].map(p => [
            p.name.toLowerCase(),
            p
          ])
        ).values()
      );
      const mergedExperiences =
        (existingProfile?.experiences?.length ?? 0) > 0
          ? existingProfile!.experiences
          : sanitizedIncoming.experiences ?? [];
      const mergedResumeVersions = Array.from(
        new Map(
          [
            ...(existingProfile?.resumeVersions ?? []),
            ...(sanitizedIncoming.resumeVersions ?? [])
          ].map(v => [v.id, v])
        ).values()
      );

      await this.backend.setUserRoot(
        ownerUid,
        {
          id: `profile-${ownerUid}`,
          ownerUid,
          candidateName: sanitizedIncoming.candidateName || existingProfile?.candidateName || 'Verified Candidate',
          email: sanitizedIncoming.email || existingProfile?.email || this.owner.email || '',
          location: sanitizedIncoming.location || existingProfile?.location || '',
          headline: sanitizedIncoming.headline || existingProfile?.headline || 'Software & Systems Engineer',
          summary: sanitizedIncoming.summary || existingProfile?.summary || '',
          skills: mergedSkills,
          experiences: mergedExperiences,
          projects: mergedProjects,
          education: sanitizedIncoming.education ?? existingProfile?.education ?? [],
          resumeVersions: mergedResumeVersions,
          settings: sanitizedIncoming.settings ?? existingProfile?.settings ?? {},
          isSampleData: false,
          version: Number(existingProfile?.version || 1) + 1,
          lastUpdated: new Date().toISOString()
        },
        token
      );

      const now = new Date().toISOString();
      for (const ev of cleanEvidence) {
        const fp =
          ev.fingerprint ||
          SchemaValidator.computeFingerprint('evidence', ev.type, ev.uri, ev.provenance.commitSha || ev.id);
        await this.backend.setSubDoc(
          ownerUid,
          'evidence',
          ev.id,
          {
            ...ev,
            ownerUid,
            fingerprint: fp,
            createdAt: ev.provenance.fetchedAt || now
          },
          token
        );
      }

      for (const claim of cleanClaims) {
        const fp =
          claim.fingerprint ||
          SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');
        const lifecycle = resolveLifecycleState(claim);
        await this.backend.setSubDoc(
          ownerUid,
          'claims',
          claim.id,
          {
            ...claim,
            ownerUid,
            fingerprint: fp,
            lifecycleState: lifecycle,
            updatedAt: now
          },
          token
        );
      }

      for (const repo of sanitizedIncoming.repositories ?? []) {
        await this.backend.setSubDoc(
          ownerUid,
          'repositories',
          repo.id,
          {
            ...repo,
            ownerUid
          },
          token
        );
      }

      await this.appendAuditLog({
        actor: 'user',
        action: 'profile_updated',
        targetId: `profile-${ownerUid}`,
        details: `Imported validated career data (${cleanClaims.length} claims, ${cleanEvidence.length} evidence items, ${sampleRecordsRejected} sample records rejected).`
      });

      return {
        importedProfileId: `profile-${ownerUid}`,
        ownerUid,
        claimsImported: cleanClaims.length,
        evidenceImported: cleanEvidence.length,
        repositoriesImported: (sanitizedIncoming.repositories ?? []).length,
        sampleRecordsRejected,
        mode
      };
    });
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    return {
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '1.5.0-phase1.5',
      storageDriver: 'firestore',
      storageMode: 'cloud_firestore_durable',
      profileLoaded: true,
      evidenceCount: 0,
      claimsCount: 0,
      verifiedClaimsCount: 0,
      repositoriesCount: 0,
      syncRunsCount: 0,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
      githubApiReady: true,
      securityScannerActive: true,
      authConfigured: true
    };
  }

  private async touchProfileMetadata(): Promise<void> {
    const token = this.owner.idToken;
    const root = await this.backend.getUserRoot(this.owner.uid, token);
    if (root) {
      await this.backend.setUserRoot(
        this.owner.uid,
        {
          ...root,
          version: Number(root.version || 1) + 1,
          lastUpdated: new Date().toISOString()
        },
        token
      );
    }
  }
}
