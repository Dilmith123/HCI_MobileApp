import {
  fetchChatMessages,
  fetchUserConversationsFromDb,
  fetchProfile,
  type DbMessage,
} from './api';

export type ChatMessage = {
  id: string;
  senderId: 'me' | 'them';
  text: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  isVoice?: boolean;
};

export type Conversation = {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string | null;
  currentUserId?: string | null;
  petReportId?: string;
  petName?: string;
  petSpecies?: string;
  petImage?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageStatus?: 'sent' | 'delivered' | 'read';
  messages: ChatMessage[];
};

const STORAGE_KEY = 'pawlo_messages_v5';

export function getConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: Conversation[] = JSON.parse(raw);
    return list.map((c) => {
      // Remove any pet image assigned to user avatar
      if (c.participantAvatar && (c.participantAvatar === c.petImage || c.participantAvatar.includes('pexels.com'))) {
        c.participantAvatar = null;
      }
      // Replace legacy "Owner of [Pet Name]" or "Pet Owner" with neutral fallback until resolved
      if (c.participantName && (c.participantName.startsWith('Owner of') || c.participantName === 'Pet Owner')) {
        c.participantName = 'User';
      }
      return c;
    });
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.error('Failed to save conversations:', err);
  }
}

export function saveConversationToStore(conversation: Conversation): void {
  const list = getConversations();
  const idx = list.findIndex(
    (c) => c.id === conversation.id || (c.participantId && c.participantId === conversation.participantId)
  );
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...conversation };
  } else {
    list.unshift(conversation);
  }
  saveConversations(list);
}

export function getConversationById(id: string): Conversation | undefined {
  const list = getConversations();
  return list.find((c) => c.id === id || c.participantId === id);
}

const READ_TIMESTAMPS_KEY = 'pawlo_read_timestamps_v1';

export function getReadTimestamps(): Record<string, string> {
  try {
    const raw = localStorage.getItem(READ_TIMESTAMPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveReadTimestamps(map: Record<string, string>): void {
  try {
    localStorage.setItem(READ_TIMESTAMPS_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('Failed to save read timestamps:', err);
  }
}

export function getPartnerLastReadTime(
  userId?: string | null,
  partnerId?: string | null
): string | null {
  if (!userId || !partnerId) return null;
  const map = getReadTimestamps();
  return map[`${userId}_${partnerId}`] || null;
}

export function markPartnerAsRead(userId: string | null, partnerId: string | null): void {
  if (!userId || !partnerId) return;
  const map = getReadTimestamps();
  map[`${userId}_${partnerId}`] = new Date().toISOString();
  saveReadTimestamps(map);

  const list = getConversations();
  const updated = list.map((c) =>
    c.participantId === partnerId || c.id === partnerId || c.id === `conv-${partnerId}`
      ? { ...c, unreadCount: 0 }
      : c
  );
  saveConversations(updated);
}

export function markConversationAsRead(id: string, userId?: string | null): void {
  const list = getConversations();
  const target = list.find((c) => c.id === id || c.participantId === id);
  if (target && userId && target.participantId) {
    const map = getReadTimestamps();
    map[`${userId}_${target.participantId}`] = new Date().toISOString();
    saveReadTimestamps(map);
  }
  const updated = list.map((c) =>
    c.id === id || c.participantId === id ? { ...c, unreadCount: 0 } : c
  );
  saveConversations(updated);
}

/**
 * Synthesizes a gentle, melodic 2-tone chime using Web Audio API.
 * Requires zero external audio files.
 */
export function playNotificationSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Note 1: E5 (659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    // Note 2: A5 (880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.debug('Audio chime unavailable:', e);
  }
}

/**
 * Triggers standard browser system notification if permissions granted.
 */
export function requestNotificationPermission(): void {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
}

export function triggerSystemNotification(title: string, body: string, icon?: string): void {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, {
        body,
        icon: icon || '/images/pawlo-logo.png',
      });
    } catch (e) {
      console.debug('System notification failed:', e);
    }
  }
}

/**
 * Records an incoming real-time message into the local store and returns
 * the updated conversation along with the sender's unread count.
 */
export function recordIncomingMessage(
  message: DbMessage,
  currentUserId: string,
  isCurrentlyOpenChat: boolean,
): { conv: Conversation; senderUnreadCount: number } {
  const partnerId = message.sender_id;
  const list = getConversations();
  let conv = list.find((c) => c.participantId === partnerId || c.id === `conv-${partnerId}`);

  const formattedTime = formatDynamicTimestamp(message.created_at);

  if (conv) {
    const nextUnread = isCurrentlyOpenChat ? 0 : (conv.unreadCount || 0) + 1;
    conv = {
      ...conv,
      lastMessage: message.content,
      lastMessageTime: formattedTime || 'Just now',
      unreadCount: nextUnread,
    };
    saveConversationToStore(conv);
    const newConv: Conversation = {
      id: `conv-${partnerId}`,
      participantId: partnerId,
      participantName: 'User',
      currentUserId,
      petReportId: message.post_id || undefined,
      unreadCount: isCurrentlyOpenChat ? 0 : 1,
      lastMessage: message.content,
      lastMessageTime: formattedTime || 'Just now',
      messages: [],
    };
    saveConversationToStore(newConv);
    conv = newConv;

    // Fetch real profile of sender in background
    fetchProfile(partnerId)
      .then((p) => {
        if (p?.full_name?.trim() || p?.avatar_url) {
          const refreshed = getConversationById(newConv.id);
          if (refreshed) {
            if (p.full_name?.trim()) refreshed.participantName = p.full_name.trim();
            if (p.avatar_url) refreshed.participantAvatar = p.avatar_url;
            saveConversationToStore(refreshed);
          }
        }
      })
      .catch(() => {});
  }

  if (isCurrentlyOpenChat) {
    markPartnerAsRead(currentUserId, partnerId);
  }

  return { conv, senderUnreadCount: conv.unreadCount };
}

export function formatDynamicTimestamp(dateStr?: string | Date): string {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) {
      return typeof dateStr === 'string' ? dateStr : '';
    }
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    // 12-hour format with leading zeros and uppercase AM/PM, e.g. "08:05 PM"
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const timeFormatted = `${formattedHours}:${formattedMinutes} ${ampm}`;

    if (isToday) {
      return timeFormatted;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Yesterday';
    }

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return typeof dateStr === 'string' ? dateStr : '';
  }
}

/**
 * 3. Fetch Conversations (Messages Inbox View):
 * Fetches the latest message for each distinct conversation where the current user
 * is either sender_id or receiver_id from Supabase `messages` table, along with
 * recipient details, unread count from sender, and related pet post info.
 */
export async function fetchUserConversations(userId: string | null): Promise<Conversation[]> {
  if (!userId) return [];

  const localList = getConversations();

  try {
    const summaries = await fetchUserConversationsFromDb(userId, (partnerId) =>
      getPartnerLastReadTime(userId, partnerId)
    );
    if (summaries && summaries.length > 0) {
      const dbList: Conversation[] = summaries.map((s) => {
        const partnerName =
          s.partnerProfile?.full_name?.trim() || 'User';
        const partnerAvatar =
          s.partnerProfile?.avatar_url || null;

        return {
          id: `conv-${s.partnerId}`,
          participantId: s.partnerId,
          participantName: partnerName,
          participantAvatar: partnerAvatar,
          currentUserId: userId,
          petReportId: s.latestMessage.post_id || undefined,
          petName: s.postDetails?.name,
          petSpecies: s.postDetails?.species,
          petImage: s.postDetails?.image_url || undefined,
          unreadCount: s.unreadCount ?? 0,
          lastMessage: s.latestMessage.content,
          lastMessageTime: formatDynamicTimestamp(s.latestMessage.created_at),
          messages: [],
        };
      });

      // Merge with any local conversations that might not have DB messages yet,
      // but only if they actually contain messages
      const mergedList = [...dbList];
      for (const loc of localList) {
        const hasContent =
          Boolean(loc.lastMessage && loc.lastMessage.trim().length > 0 && loc.lastMessage !== 'No messages yet') ||
          Boolean(loc.messages && loc.messages.length > 0);
        if (hasContent && !mergedList.some((m) => m.participantId === loc.participantId || m.id === loc.id)) {
          mergedList.push(loc);
        }
      }

      // Filter out empty chat sessions that have "No messages yet" or blank lastMessage
      const activeList = mergedList.filter((c) => {
        const hasSnippet = Boolean(c.lastMessage && c.lastMessage.trim().length > 0 && c.lastMessage !== 'No messages yet');
        const hasMessages = Boolean(c.messages && c.messages.length > 0);
        return hasSnippet || hasMessages;
      });

      saveConversations(activeList);
      return activeList;
    }
  } catch (err) {
    console.warn('Could not fetch conversations from DB:', err);
  }

  // Fallback to local active conversations for this user
  return localList.filter((c) => {
    const isParticipant =
      c.currentUserId === userId ||
      c.participantId === userId ||
      (!c.currentUserId && (c.messages.length > 0 || c.lastMessage.trim().length > 0));
    const hasContent =
      Boolean(c.lastMessage && c.lastMessage.trim().length > 0 && c.lastMessage !== 'No messages yet') ||
      Boolean(c.messages && c.messages.length > 0);
    return isParticipant && hasContent;
  });
}

/**
 * Get total unread message count for badge display.
 */
export function getTotalUnreadCount(userId: string | null): number {
  if (!userId) return 0;
  const list = getConversations();
  return list.reduce((acc, c) => {
    const isForUser = c.currentUserId === userId || c.participantId === userId || !c.currentUserId;
    return isForUser && (c.messages.length > 0 || c.lastMessage) ? acc + (c.unreadCount || 0) : acc;
  }, 0);
}

/**
 * Create or retrieve a local conversation instance when user clicks
 * "Message Owner" from a pet report card.
 */
export function getOrCreateConversationForPost(
  report: {
    id: string;
    name: string;
    species: string;
    location: string;
    district?: string;
    image_url?: string | null;
    user_id: string;
  },
  currentUserId?: string | null,
): Conversation {
  const list = getConversations();
  const existing = list.find((c) => c.petReportId === report.id || c.participantId === report.user_id);
  if (existing) {
    // Update petReportId if missing
    if (!existing.petReportId && report.id) {
      existing.petReportId = report.id;
      existing.petName = report.name;
      existing.petSpecies = report.species;
      existing.petImage = report.image_url ?? undefined;
    }
    if (existing.participantName?.startsWith('Owner of') || existing.participantName === 'Pet Owner') {
      existing.participantName = 'User';
    }
    if (existing.participantAvatar && (existing.participantAvatar === existing.petImage || existing.participantAvatar.includes('pexels.com'))) {
      existing.participantAvatar = null;
    }
    saveConversationToStore(existing);

    // Attempt to resolve real profile of the pet owner
    if (report.user_id) {
      fetchProfile(report.user_id)
        .then((p) => {
          if (p?.full_name?.trim() || p?.avatar_url) {
            const refreshed = getConversationById(existing.id);
            if (refreshed) {
              if (p.full_name?.trim()) refreshed.participantName = p.full_name.trim();
              if (p.avatar_url) refreshed.participantAvatar = p.avatar_url;
              saveConversationToStore(refreshed);
            }
          }
        })
        .catch(() => {});
    }
    return existing;
  }

  // Create a new conversation with the pet owner
  const ownerName = 'User';
  const ownerAvatar = null;

  const newConv: Conversation = {
    id: `conv-${report.user_id || report.id}`,
    participantId: report.user_id || `owner-${report.id}`,
    participantName: ownerName,
    participantAvatar: ownerAvatar,
    currentUserId: currentUserId ?? null,
    petReportId: report.id,
    petName: report.name,
    petSpecies: report.species,
    petImage: report.image_url ?? undefined,
    unreadCount: 0,
    lastMessage: '',
    lastMessageTime: '',
    messages: [],
  };

  saveConversationToStore(newConv);

  // Attempt to resolve real profile of the pet owner in background
  if (report.user_id) {
    fetchProfile(report.user_id)
      .then((p) => {
        if (p?.full_name?.trim() || p?.avatar_url) {
          const refreshed = getConversationById(newConv.id);
          if (refreshed) {
            if (p.full_name?.trim()) refreshed.participantName = p.full_name.trim();
            if (p.avatar_url) refreshed.participantAvatar = p.avatar_url;
            saveConversationToStore(refreshed);
          }
        }
      })
      .catch(() => {});
  }

  return newConv;
}

/**
 * 2. Fetch Chat Messages:
 * Loads 1-on-1 messages from the Supabase `messages` table for the active session.
 */
export async function loadDynamicMessages(
  conversationId: string,
  currentUserId?: string | null,
  recipientId?: string | null,
): Promise<ChatMessage[] | null> {
  const conv = getConversationById(conversationId);
  const cId = currentUserId || conv?.currentUserId;
  const rId = recipientId || conv?.participantId;

  if (!cId || !rId) return null;

  try {
    const dbMessages: DbMessage[] = await fetchChatMessages(cId, rId);
    if (dbMessages) {
      const dynamicMessages: ChatMessage[] = dbMessages.map((m) => ({
        id: m.id,
        senderId: m.sender_id === cId ? 'me' : 'them',
        text: m.content,
        timestamp: formatDynamicTimestamp(m.created_at),
        status: 'sent',
      }));

      if (conv) {
        const updated: Conversation = {
          ...conv,
          messages: dynamicMessages,
          lastMessage:
            dynamicMessages.length > 0
              ? dynamicMessages[dynamicMessages.length - 1].text
              : conv.lastMessage,
          lastMessageTime:
            dynamicMessages.length > 0
              ? dynamicMessages[dynamicMessages.length - 1].timestamp
              : conv.lastMessageTime,
        };
        saveConversationToStore(updated);
      }
      return dynamicMessages;
    }
  } catch (err) {
    console.warn('Failed to load dynamic messages from database:', err);
  }
  return null;
}
