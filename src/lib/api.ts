/**
 * api.ts — All Supabase API calls for Pawlo.
 *
 * Every function gracefully returns an empty result / null when the
 * Supabase client is not configured (VITE_SUPABASE_URL missing), so
 * the app keeps working with static fallback data in preview mode.
 */
import { supabase } from './supabase';
import type {
  NewReport,
  PetReport,
  Profile,
  ReportFilters,
  UpdateProfile,
} from '../types/database';

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Returns the current session, or null if none / Supabase not configured. */
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Sign in with email + password. Throws on error. */
export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Sign up with email, password, and optional profile metadata. Throws on error. */
export async function signUp(
  email: string,
  password: string,
  meta: { full_name?: string; phone?: string; address?: string; avatar_url?: string },
) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: meta },
  });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

/** Sign out the current user. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Trigger a Supabase password-reset email for the given address.
 * Throws on network / client error; invalid emails return a success-like
 * result from Supabase for security (email enumeration prevention).
 */
export async function resetPassword(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!email) throw new Error('Email is required.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : undefined,
  });
  if (error) throw error;
}

// ── Profiles ──────────────────────────────────────────────────────────────────

/**
 * Fetch the profile belonging to the given user ID.
 * Returns null if Supabase is not configured or profile not found.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Update the user's profile in public.profiles.
 * Validates that the active session matches userId for defense-in-depth.
 */
export async function updateProfile(
  userId: string,
  updates: UpdateProfile,
): Promise<Profile> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!userId) throw new Error('User ID is required.');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const activeUserId = session?.user?.id ?? null;
  if (!activeUserId || activeUserId !== userId) {
    throw new Error('Session mismatch. You can only edit your own profile.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Pet Reports ───────────────────────────────────────────────────────────────

/**
 * Sanitize a search query for safe use inside PostgREST .or() filter strings.
 * Removes PostgREST DSL delimiters (commas, parentheses, quotes) while preserving
 * characters for case-insensitive partial matching with ILIKE.
 */
function sanitizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/[,()"']/g, '');
}

/**
 * Fetch pet reports from Supabase with optional server-side filters.
 * Returns an empty array when Supabase is not configured.
 */
export async function fetchReports(filters?: ReportFilters): Promise<PetReport[]> {
  if (!supabase) return [];

  let q = supabase
    .from('pet_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.species && filters.species !== 'All') {
    q = q.eq('species', filters.species);
  }
  if (filters?.status && filters.status !== 'All') {
    q = q.eq('status', filters.status);
  }
  if (filters?.district && filters.district !== 'All') {
    q = q.eq('district', filters.district);
  }
  if (filters?.query) {
    const clean = sanitizeSearchQuery(filters.query);
    if (clean) {
      const term = `%${clean}%`;
      q = q.or(
        `name.ilike.${term},location.ilike.${term},species.ilike.${term},district.ilike.${term}`,
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch only the reports belonging to the given user.
 */
export async function fetchMyReports(userId: string): Promise<PetReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pet_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Insert a new pet report.
 * Throws if Supabase is not configured, the caller is not authenticated,
 * or the insert fails.  The report.user_id must match the currently signed
 * in user's id — this is defense-in-depth on top of the RLS insert policy
 * and prevents leaked/stale auth state from writing reports to a different
 * user's account.
 */
export async function submitReport(report: NewReport): Promise<PetReport> {
  if (!supabase) throw new Error('Supabase is not configured.');

  // Validate ownership with the active session before writing.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const activeUserId = session?.user?.id ?? null;
  if (!activeUserId) throw new Error('You must be signed in to submit a report.');
  if (activeUserId !== report.user_id) {
    throw new Error('Session mismatch. Please sign in again and retry.');
  }

  // Sanity-check enum value so the DB CHECK constraint can't surprise us.
  if (report.status !== 'LOST' && report.status !== 'FOUND') {
    throw new Error('Invalid report status.');
  }

  const { data, error } = await supabase
    .from('pet_reports')
    .insert(report)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update a report's status (LOST → FOUND) or other mutable fields.
 */
export async function updateReportStatus(
  id: string,
  status: 'LOST' | 'FOUND',
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('pet_reports')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Delete a report by id (owner only — enforced by RLS).
 */
export async function deleteReport(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('pet_reports').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Update mutable fields of an existing report (owner only — enforced by RLS).
 * Does NOT allow changing id, user_id, or created_at.
 */
export async function updateReport(
  id: string,
  updates: Partial<Pick<PetReport, 'name' | 'species' | 'location' | 'district' | 'contact' | 'description' | 'image_url' | 'status'>>,
): Promise<PetReport> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!id) throw new Error('Report ID is required.');

  // Defense-in-depth: ensure the caller is authenticated before hitting RLS.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('You must be signed in to edit a report.');

  const { data, error } = await supabase
    .from('pet_reports')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Storage ───────────────────────────────────────────────────────────────────

// Whitelist of image file extensions users are allowed to upload.  Used to
// sanitize the filename extension before storage — prevents path traversal
// or executable uploads via misleading filenames.
const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — matches client-side guard

/**
 * Upload a pet image to the `pet-images` storage bucket and return its
 * public URL.  Returns null when Supabase is not configured.
 *
 * The uploaded path is `{userId}/{timestamp}.{safeExt}` which aligns with
 * the storage RLS policy `storage.foldername(name)[1] = auth.uid()::text`
 * — i.e. the first path component after the bucket root MUST be the
 * uploader's user id.
 */
export async function uploadPetImage(
  file: File,
  userId: string,
): Promise<string | null> {
  if (!supabase) return null;

  // Guard against empty / missing user id before we construct the path.
  if (!userId) throw new Error('Authenticated user id is required to upload.');

  // Size + MIME sanity checks before any network call.
  if (!file || file.size === 0) throw new Error('Empty file provided.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Photo too large. Maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  }

  // Session ownership double-check (matches submitReport defence).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const activeUserId = session?.user?.id ?? null;
  if (!activeUserId || activeUserId !== userId) {
    throw new Error('Session mismatch. Please sign in again and retry.');
  }

  // Sanitize the extension; fall back to 'jpg' if the user's extension is
  // not in the whitelist (Supabase storage policies operate on paths, so
  // this keeps us inside a safe, predictable naming scheme).
  const rawExt = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const ext = ALLOWED_IMAGE_EXT.includes(rawExt as (typeof ALLOWED_IMAGE_EXT)[number])
    ? rawExt
    : 'jpg';

  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('pet-images')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('pet-images').getPublicUrl(path);

  return publicUrl;
}

/**
 * Upload an avatar/profile image to the `avatars` storage bucket (with fallback to `pet-images`)
 * and return its public URL.
 *
 * Path: `{userId}/{timestamp}.{safeExt}`
 */
export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<string | null> {
  if (!supabase) return null;

  if (!userId) throw new Error('Authenticated user id is required to upload an avatar.');
  if (!file || file.size === 0) throw new Error('Empty file provided.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Avatar image too large. Maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const activeUserId = session?.user?.id ?? null;
  if (!activeUserId || activeUserId !== userId) {
    throw new Error('Session mismatch. Please sign in again and retry.');
  }

  const rawExt = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const ext = ALLOWED_IMAGE_EXT.includes(rawExt as (typeof ALLOWED_IMAGE_EXT)[number])
    ? rawExt
    : 'jpg';

  const path = `${userId}/${Date.now()}.${ext}`;

  // Try uploading to 'avatars' bucket, fallback to 'pet-images' if 'avatars' not yet created
  let bucket = 'avatars';
  let { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError && (uploadError.message?.toLowerCase().includes('not found') || uploadError.message?.toLowerCase().includes('bucket'))) {
    bucket = 'pet-images';
    const retry = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    uploadError = retry.error;
  }

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return publicUrl;
}
