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
  DbMessage,
  DbMessageWithProfiles,
  ProfileSummary,
  NewMessage,
} from '../types/database';

export type { DbMessage, DbMessageWithProfiles, ProfileSummary, NewMessage };

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
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('fetchProfile query error:', error);
      return null;
    }

    // If profile row exists and has a full_name, return it directly
    if (data && data.full_name?.trim()) {
      return data;
    }

    // Check if the target user is the currently authenticated user
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.id === userId) {
        const metaName =
          (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          '';
        const metaAvatar =
          (user.user_metadata?.avatar_url as string) ||
          (user.user_metadata?.picture as string) ||
          null;

        if (metaName || metaAvatar) {
          return {
            id: userId,
            full_name: metaName || data?.full_name || null,
            phone: data?.phone || null,
            address: data?.address || null,
            avatar_url: metaAvatar || data?.avatar_url || null,
            created_at: data?.created_at || new Date().toISOString(),
          };
        }
      }
    } catch {
      // Ignore auth getUser error
    }

    return data;
  } catch (err) {
    console.warn('fetchProfile exception:', err);
    return null;
  }
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

// ── Messaging (Database) ───────────────────────────────────────────────────────

/**
 * Validate whether a string is a standard UUID format.
 */
function isValidUuid(val?: string | null): boolean {
  return (
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())
  );
}

/**
 * 1. Send Message Integration:
 * Inserts a new row into the `messages` table containing:
 * - sender_id: ID of the currently logged-in user (auth.uid())
 * - receiver_id: ID of the pet owner (or the chat recipient)
 * - post_id: ID of the related pet post (null if not a valid UUID)
 * - content: The text message entered by the user
 */
export async function sendDbMessage({
  sender_id,
  receiver_id,
  post_id,
  content,
}: NewMessage): Promise<DbMessage | null> {
  if (!supabase) return null;
  const trimmed = content?.trim();
  if (!sender_id || !receiver_id || !trimmed) {
    throw new Error('Sender, recipient, and message content are required.');
  }

  // Double-check session matches sender_id
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUid = session?.user?.id ?? null;
  if (authUid && authUid !== sender_id) {
    throw new Error('Session mismatch. You can only send messages as yourself.');
  }

  const cleanPostId = isValidUuid(post_id) ? post_id : null;
  const cleanReceiverId = receiver_id.trim();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id,
      receiver_id: cleanReceiverId,
      post_id: cleanPostId,
      content: trimmed,
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting message into Supabase:', error);
    throw error;
  }
  return data;
}

/**
 * 2. Fetch Chat Messages (1-on-1 Chat Screen):
 * Query the `messages` table to fetch all messages exchanged between the active
 * logged-in user and the selected recipient:
 * ((sender_id == current_user AND receiver_id == recipient) OR (sender_id == recipient AND receiver_id == current_user))
 * Ordered by created_at ascending so messages appear in chronological sequence.
 */
export async function fetchChatMessages(
  currentUserId: string,
  recipientId: string,
): Promise<DbMessageWithProfiles[]> {
  if (!supabase || !currentUserId || !recipientId) return [];

  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(full_name, avatar_url),
        receiver:profiles!receiver_id(full_name, avatar_url)
      `)
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`
      )
      .order('created_at', { ascending: true });

    if (!error && data) {
      return data as DbMessageWithProfiles[];
    }

    // Fallback if join relationship is missing from schema cache
    console.warn('Chat messages join query fallback:', error?.message);
    const { data: fallbackData } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`
      )
      .order('created_at', { ascending: true });

    return (fallbackData as DbMessageWithProfiles[]) ?? [];
  } catch (err) {
    console.warn('fetchChatMessages failed:', err);
    return [];
  }
}

export type DbConversationSummary = {
  partnerId: string;
  partnerProfile: ProfileSummary | null;
  latestMessage: DbMessageWithProfiles;
  unreadCount?: number;
  postDetails?: {
    id: string;
    name: string;
    species: string;
    image_url: string | null;
  } | null;
};

/**
 * 3. Fetch Conversations (Messages Inbox View):
 * Fetches the latest message for each distinct conversation where the current user
 * is either sender_id or receiver_id.
 * Joins profiles!sender_id and profiles!receiver_id to retrieve the active chat partner's details.
 */
export async function fetchUserConversationsFromDb(
  currentUserId: string,
  getLastReadTime?: (partnerId: string) => string | null,
): Promise<DbConversationSummary[]> {
  if (!supabase || !currentUserId) return [];

  try {
    let messages: DbMessageWithProfiles[] | null = null;
    let usedFallback = false;

    // Join profiles table using sender_id and receiver_id
    const { data: joinData, error: joinError } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(full_name, avatar_url),
        receiver:profiles!receiver_id(full_name, avatar_url)
      `)
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false });

    if (!joinError && joinData) {
      messages = joinData as DbMessageWithProfiles[];
    } else {
      usedFallback = true;
      console.warn('Inbox messages join query fallback:', joinError?.message);
      const { data: rawData, error: rawError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (rawError || !rawData) return [];
      messages = rawData as DbMessageWithProfiles[];
    }

    if (!messages || messages.length === 0) return [];

    // Group by distinct conversation partner. Since query is ordered by created_at desc,
    // the first message encountered for each partner is the latest message.
    const conversationMap = new Map<
      string,
      { latestMsg: DbMessageWithProfiles; partnerProfile: ProfileSummary | null }
    >();

    for (const msg of messages) {
      const partnerId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
      if (!partnerId) continue;

      if (!conversationMap.has(partnerId)) {
        // Determine who the logged-in user is talking to:
        // sender if current user is receiver, or receiver if current user is sender
        const rawPartner =
          msg.sender_id === currentUserId ? msg.receiver : msg.sender;
        const p = Array.isArray(rawPartner) ? rawPartner[0] : rawPartner;
        const partnerProfile: ProfileSummary | null = p
          ? {
              full_name: p.full_name?.trim() || null,
              avatar_url: p.avatar_url || null,
            }
          : null;

        conversationMap.set(partnerId, { latestMsg: msg, partnerProfile });
      }
    }

    const partnerIds = Array.from(conversationMap.keys());
    if (partnerIds.length === 0) return [];

    // Ensure all conversation partners have profiles fetched from public.profiles table if missing
    const partnersNeedingProfiles = partnerIds.filter((pId) => {
      const cur = conversationMap.get(pId)?.partnerProfile;
      return !cur?.full_name || !cur?.avatar_url;
    });

    if (partnersNeedingProfiles.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', partnersNeedingProfiles);

      profiles?.forEach((p) => {
        const item = conversationMap.get(p.id);
        if (item) {
          item.partnerProfile = {
            full_name: p.full_name?.trim() || item.partnerProfile?.full_name || null,
            avatar_url: p.avatar_url || item.partnerProfile?.avatar_url || null,
          };
        }
      });
    }

    // Fetch related pet post details for distinct post_ids
    const postIds = Array.from(
      new Set(
        Array.from(conversationMap.values())
          .map((item) => item.latestMsg.post_id)
          .filter((id): id is string => Boolean(id && isValidUuid(id)))
      )
    );

    const postMap = new Map<string, { id: string; name: string; species: string; image_url: string | null }>();
    if (postIds.length > 0) {
      const { data: petReports } = await supabase
        .from('pet_reports')
        .select('id, name, species, image_url')
        .in('id', postIds);

      petReports?.forEach((r) => postMap.set(r.id, r));
    }

    // Count unread incoming messages from each partner to the current user
    const unreadMap = new Map<string, number>();
    for (const msg of messages) {
      if (msg.receiver_id === currentUserId && msg.sender_id) {
        const pId = msg.sender_id;
        const lastRead = getLastReadTime ? getLastReadTime(pId) : null;
        const isUnread = !lastRead || new Date(msg.created_at) > new Date(lastRead);
        if (isUnread) {
          unreadMap.set(pId, (unreadMap.get(pId) || 0) + 1);
        }
      }
    }

    const summaries: DbConversationSummary[] = [];
    for (const [partnerId, { latestMsg, partnerProfile }] of conversationMap.entries()) {
      summaries.push({
        partnerId,
        partnerProfile,
        latestMessage: latestMsg,
        unreadCount: unreadMap.get(partnerId) || 0,
        postDetails: latestMsg.post_id ? postMap.get(latestMsg.post_id) ?? null : null,
      });
    }

    return summaries;
  } catch (err) {
    console.warn('Error in fetchUserConversationsFromDb:', err);
    return [];
  }
}

/**
 * 4. Realtime Subscription:
 * Set up a Supabase Realtime channel subscription listening to `INSERT` events
 * on the `messages` table so new messages pop up instantly without requiring a screen refresh.
 */
export function subscribeToMessages(
  onInsert: (message: DbMessage) => void,
): () => void {
  if (!supabase) return () => {};

  const channelName = `realtime-messages-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        if (payload?.new) {
          onInsert(payload.new as DbMessage);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}



