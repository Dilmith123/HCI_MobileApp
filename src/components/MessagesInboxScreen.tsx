import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  MessageSquare,
  UserRound,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  type Conversation,
  saveConversations,
  getReadTimestamps,
} from '../lib/messaging';
import { subscribeToMessages, type DbMessage, type DbMessageWithProfiles } from '../lib/api';

type MessagesInboxScreenProps = {
  userId: string | null;
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
  onGoToHome?: () => void;
  onGoToLogin?: () => void;
};

/**
 * Format conversation timestamp into right-aligned 12-hour format (e.g. "08:05 PM")
 */
function formatConversationTime(dateStr?: string | Date): string {
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

    // 12-hour format with leading zero and uppercase AM/PM (e.g. "08:05 PM")
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

export function MessagesInboxScreen({
  userId,
  onBack,
  onOpenConversation,
  onGoToHome,
  onGoToLogin,
}: MessagesInboxScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({});

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // 1. Supabase Query: Fetch messages and join profiles table using explicit foreign key relations
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!sender_id(full_name, avatar_url),
          receiver:profiles!receiver_id(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      let messagesList: DbMessageWithProfiles[] = [];

      if (!error && data) {
        messagesList = data as DbMessageWithProfiles[];
      } else {
        console.warn('Inbox messages join query fallback:', error?.message);
        const { data: rawMessages } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false });
        messagesList = (rawMessages as DbMessageWithProfiles[]) || [];
      }

      // Filter only messages exchanged with current logged-in user
      const userMessages = messagesList.filter(
        (m) => m.sender_id === userId || m.receiver_id === userId
      );

      // Group by distinct conversation partner (first encountered is latest because ordered by created_at desc)
      const convMap = new Map<
        string,
        {
          partnerId: string;
          latestMsg: DbMessageWithProfiles;
          partnerName: string;
          partnerAvatar: string | null;
          postId?: string | null;
        }
      >();

      for (const msg of userMessages) {
        const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        if (!partnerId) continue;

        if (!convMap.has(partnerId)) {
          // sender if current user is receiver, receiver if current user is sender
          const rawPartner = msg.sender_id === userId ? msg.receiver : msg.sender;
          const p = Array.isArray(rawPartner) ? rawPartner[0] : rawPartner;
          const name = p?.full_name?.trim() || '';
          const avatar = p?.avatar_url || null;

          convMap.set(partnerId, {
            partnerId,
            latestMsg: msg,
            partnerName: name,
            partnerAvatar: avatar,
            postId: msg.post_id || null,
          });
        }
      }

      const partnerIds = Array.from(convMap.keys());
      if (partnerIds.length === 0) {
        setConversations([]);
        return;
      }

      // Ensure all conversation partners have profiles fetched from public.profiles table
      const missingProfilePartnerIds = partnerIds.filter((pId) => {
        const item = convMap.get(pId);
        return !item?.partnerName || !item?.partnerAvatar;
      });

      if (missingProfilePartnerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', missingProfilePartnerIds);

        profiles?.forEach((p) => {
          const item = convMap.get(p.id);
          if (item) {
            if (p.full_name?.trim()) item.partnerName = p.full_name.trim();
            if (p.avatar_url) item.partnerAvatar = p.avatar_url;
          }
        });
      }

      // Batch query pet_reports for related post info
      const postIds = Array.from(
        new Set(
          Array.from(convMap.values())
            .map((item) => item.postId)
            .filter((id): id is string => Boolean(id))
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

      // Calculate unread count per partner
      const readMap = getReadTimestamps();
      const unreadCounts = new Map<string, number>();
      for (const msg of userMessages) {
        if (msg.receiver_id === userId && msg.sender_id) {
          const pId = msg.sender_id;
          const lastRead = readMap[`${userId}_${pId}`];
          const isUnread = !lastRead || new Date(msg.created_at) > new Date(lastRead);
          if (isUnread) {
            unreadCounts.set(pId, (unreadCounts.get(pId) || 0) + 1);
          }
        }
      }

      // Construct final conversation list, strictly eliminating empty sessions
      const loadedList: Conversation[] = [];
      for (const [partnerId, item] of convMap.entries()) {
        const content = item.latestMsg.content?.trim();
        // Eliminate empty chat sessions that have "No messages yet" or blank content
        if (!content || content === 'No messages yet') continue;

        const post = item.postId ? postMap.get(item.postId) : null;
        const formattedTime = formatConversationTime(item.latestMsg.created_at);

        loadedList.push({
          id: `conv-${partnerId}`,
          participantId: partnerId,
          participantName: item.partnerName || 'User',
          participantAvatar: item.partnerAvatar,
          currentUserId: userId,
          petReportId: item.postId || undefined,
          petName: post?.name,
          petSpecies: post?.species,
          petImage: post?.image_url || undefined,
          unreadCount: unreadCounts.get(partnerId) || 0,
          lastMessage: content,
          lastMessageTime: formattedTime,
          messages: [],
        });
      }

      setConversations(loadedList);
      saveConversations(loadedList);
    } catch (err) {
      console.warn('Failed to load user conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Realtime subscription: update inbox whenever a message involving this user is inserted
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToMessages((msg: DbMessage) => {
      if (msg.sender_id === userId || msg.receiver_id === userId) {
        loadConversations();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [userId, loadConversations]);

  // Real-time filter for search queries
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter((c) => {
      return (
        c.participantName.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        (c.petName && c.petName.toLowerCase().includes(q))
      );
    });
  }, [conversations, searchQuery]);

  return (
    <main className="app-shell inbox-screen-shell">
      {/* Top Header */}
      <header className="inbox-header">
        <button className="back-button inbox-back-btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={21} />
        </button>
        <span className="inbox-header-title">Messages</span>
      </header>

      {/* Loading state */}
      {loading ? (
        <div className="inbox-loading-wrap" aria-label="Loading conversations">
          <Loader2 size={26} className="spinner" />
          <span>Loading messages...</span>
        </div>
      ) : !userId ? (
        /* Guest user empty state */
        <div className="inbox-empty-state">
          <div className="inbox-empty-icon-wrap">
            <UserRound size={34} strokeWidth={1.8} />
          </div>
          <h2 className="inbox-empty-title">Sign in to view messages</h2>
          <p className="inbox-empty-desc">
            Please log in to your account to view your conversations and message pet owners.
          </p>
          {onGoToLogin && (
            <button className="primary-button inbox-empty-btn" onClick={onGoToLogin}>
              Log In / Sign Up
            </button>
          )}
        </div>
      ) : conversations.length === 0 ? (
        /* Empty State Handling for logged-in user with no chats */
        <div className="inbox-empty-state">
          <div className="inbox-empty-icon-wrap">
            <MessageSquare size={34} strokeWidth={1.8} />
          </div>
          <h2 className="inbox-empty-title">No messages yet</h2>
          <p className="inbox-empty-desc">
            You don't have any conversations yet. When you message a pet owner or receive inquiries
            about your reports, your chats will appear here.
          </p>
          {onGoToHome && (
            <button className="primary-button inbox-empty-btn" onClick={onGoToHome}>
              Explore Pet Reports
            </button>
          )}
        </div>
      ) : (
        /* Dynamic User Conversations List */
        <>
          {/* Search Bar */}
          <div className="inbox-search-row">
            <label className="inbox-search-input-wrap">
              <Search size={18} strokeWidth={2.2} className="inbox-search-icon" />
              <input
                type="search"
                className="inbox-search-input"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <section className="inbox-conv-list" aria-label="Recent chats">
            {filteredConversations.length === 0 ? (
              <div className="inbox-empty-state" style={{ padding: '40px 10px' }}>
                <p className="inbox-empty-desc">No conversations matching "{searchQuery}"</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                return (
                  <article
                    key={conv.id}
                    className="inbox-conv-item"
                    onClick={() => onOpenConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onOpenConversation(conv.id)}
                    aria-label={`Chat with ${conv.participantName}`}
                  >
                    <div className="conv-avatar-wrap">
                      {conv.participantAvatar && !avatarErrors[conv.id] ? (
                        <img
                          src={conv.participantAvatar}
                          alt={conv.participantName}
                          className="conv-avatar-img"
                          onError={() =>
                            setAvatarErrors((prev) => ({ ...prev, [conv.id]: true }))
                          }
                        />
                      ) : (
                        <div className="conv-avatar-fallback">
                          <UserRound size={22} strokeWidth={2} />
                        </div>
                      )}
                    </div>

                    <div className="conv-main-content">
                      <div className="conv-header-row">
                        <div className="conv-name-and-tag">
                          <span className="conv-name">{conv.participantName}</span>
                          {conv.petName && (
                            <span className="conv-pet-tag">Regarding {conv.petName}</span>
                          )}
                        </div>
                        <span className="conv-time">
                          {formatConversationTime(conv.lastMessageTime)}
                        </span>
                      </div>

                      <div className="conv-message-row">
                        <span className="conv-snippet">
                          {conv.lastMessage}
                        </span>

                        {conv.unreadCount > 0 && (
                          <span className="conv-unread-badge">{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </main>
  );
}
