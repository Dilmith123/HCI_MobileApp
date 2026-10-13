import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  Wifi,
  Battery,
  Signal,
  MessageSquare,
  Loader2,
  UserRound,
  Camera,
  PawPrint,
  ExternalLink,
  X,
  Phone,
  MapPin,
} from 'lucide-react';
import {
  type Conversation,
  type ChatMessage,
  getConversationById,
  markConversationAsRead,
  saveConversationToStore,
  formatDynamicTimestamp,
} from '../lib/messaging';
import {
  fetchProfile,
  uploadPetImage,
  type DbMessage,
  type DbMessageWithProfiles,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import type { PetReport } from '../types/database';

type ChatScreenProps = {
  conversationId: string;
  currentUserId?: string | null;
  onBack: () => void;
  onViewPost?: (reportId: string) => void;
};

function formatMessageTime(timeStr?: string): string {
  if (!timeStr) return '';
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (/^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(timeStr.trim())) {
      return timeStr.trim();
    }
    return timeStr;
  } catch {
    return timeStr || '';
  }
}

function parseMessageContent(raw: string): { text: string; imageUrl: string | null } {
  if (!raw) return { text: '', imageUrl: null };

  // Check for markdown image: ![alt](url)
  const mdMatch = raw.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) {
    const text = raw.replace(mdMatch[0], '').trim();
    return { text, imageUrl: mdMatch[1] };
  }

  // Check for [img]url[/img] or [photo]url[/photo]
  const tagMatch = raw.match(/\[(?:img|photo)\](https?:\/\/[^\s\]]+)\[\/(?:img|photo)\]/i);
  if (tagMatch) {
    const text = raw.replace(tagMatch[0], '').trim();
    return { text, imageUrl: tagMatch[1] };
  }

  // Check for direct Supabase pet-images public URL
  const supaMatch = raw.match(/(https?:\/\/[^\s]+\/storage\/v1\/object\/public\/pet-images\/[^\s]+)/i);
  if (supaMatch) {
    const text = raw.replace(supaMatch[0], '').trim();
    return { text, imageUrl: supaMatch[1] };
  }

  // Check for direct general image file url
  const urlMatch = raw.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?[^\s]*)?)/i);
  if (urlMatch) {
    const text = raw.replace(urlMatch[0], '').trim();
    return { text, imageUrl: urlMatch[1] };
  }

  return { text: raw, imageUrl: null };
}

function cleanUuid(id?: string | null): string | null {
  if (!id) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id.trim()) ? id.trim() : null;
}

export function ChatScreen({ conversationId, currentUserId, onBack, onViewPost }: ChatScreenProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(currentUserId ?? null);
  const [recipientProfile, setRecipientProfile] = useState<{
    fullName: string;
    avatarUrl: string | null;
  } | null>(null);
  const [petPost, setPetPost] = useState<PetReport | null>(null);
  const [showPetModal, setShowPetModal] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<{
    file: File;
    previewUrl: string;
    name: string;
  } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectMedia = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image size exceeds 10MB limit.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAttachedMedia({ file, previewUrl, name: file.name });
    e.target.value = '';
  };

  // 1. Resolve currently authenticated user (supabase.auth.getUser())
  useEffect(() => {
    let isMounted = true;
    if (!activeUserId) {
      supabase.auth
        .getUser()
        .then(({ data: { user }, error }) => {
          if (error) {
            console.warn('Could not retrieve user:', error);
            return;
          }
          if (isMounted && user?.id) {
            setActiveUserId(user.id);
          }
        })
        .catch((err) => {
          console.warn('supabase.auth.getUser error:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [activeUserId]);

  // 2. Resolve initial conversation metadata from cache or placeholders
  useEffect(() => {
    const cached = getConversationById(conversationId);
    if (cached) {
      // Sanitize legacy "Owner of ..." or pet image avatar if present in cache
      const sanitizedName =
        cached.participantName &&
        !cached.participantName.startsWith('Owner of') &&
        cached.participantName !== 'Pet Owner'
          ? cached.participantName
          : 'User';
      const sanitizedAvatar =
        cached.participantAvatar &&
        (cached.participantAvatar === cached.petImage ||
          cached.participantAvatar.includes('pexels.com'))
          ? null
          : cached.participantAvatar;

      const sanitizedConv = {
        ...cached,
        participantName: sanitizedName,
        participantAvatar: sanitizedAvatar,
      };

      setConversation(sanitizedConv);
      markConversationAsRead(cached.id, activeUserId);

      if (sanitizedName !== 'User' || sanitizedAvatar) {
        setRecipientProfile({
          fullName: sanitizedName,
          avatarUrl: sanitizedAvatar ?? null,
        });
      }
    } else {
      const parsedRecipientId = conversationId.replace(/^conv-/, '');
      const placeholder: Conversation = {
        id: conversationId,
        participantId: parsedRecipientId,
        participantName: 'User',
        currentUserId: activeUserId,
        unreadCount: 0,
        lastMessage: '',
        lastMessageTime: '',
        messages: [],
      };
      setConversation(placeholder);
    }
  }, [conversationId, activeUserId]);

  // 3. Dynamically fetch the real user name and profile avatar for the chat partner
  useEffect(() => {
    let isMounted = true;

    const fetchPartnerProfile = async () => {
      let partnerId = cleanUuid(conversation?.participantId);
      if (partnerId === activeUserId) partnerId = null;

      if (!partnerId) {
        const candidate = cleanUuid(conversationId.replace(/^conv-/, ''));
        if (candidate && candidate !== activeUserId) {
          partnerId = candidate;
        }
      }

      // If partnerId is still unknown, check if we have a pet post id to resolve the owner
      if (!partnerId && conversation?.petReportId) {
        const cleanReportId = cleanUuid(conversation.petReportId);
        if (cleanReportId) {
          try {
            const { data: pet } = await supabase
              .from('pet_reports')
              .select('id, user_id, name, species, location, image_url, status, description, contact')
              .eq('id', cleanReportId)
              .maybeSingle();

            if (pet) {
              if (isMounted) setPetPost(pet as PetReport);
              if (pet.user_id && cleanUuid(pet.user_id) && pet.user_id !== activeUserId) {
                partnerId = pet.user_id;
              }
              if (isMounted) {
                setConversation((prev) =>
                  prev
                    ? {
                        ...prev,
                        participantId: partnerId || prev.participantId,
                        petName: prev.petName || pet.name,
                        petSpecies: prev.petSpecies || pet.species,
                        petImage: prev.petImage || pet.image_url || undefined,
                      }
                    : prev
                );
              }
            }
          } catch (err) {
            console.warn('Could not lookup pet owner:', err);
          }
        }
      }

      if (!partnerId) return;

      try {
        const profile = await fetchProfile(partnerId);
        if (isMounted && profile) {
          const realName = profile.full_name?.trim() || '';
          const realAvatar = profile.avatar_url?.trim() || null;

          if (realName || realAvatar) {
            setRecipientProfile({
              fullName: realName || 'User',
              avatarUrl: realAvatar,
            });

            setConversation((prev) => {
              if (!prev) return prev;
              const updated: Conversation = {
                ...prev,
                participantId: partnerId!,
                participantName:
                  realName ||
                  (prev.participantName.startsWith('Owner of') || prev.participantName === 'Pet Owner'
                    ? 'User'
                    : prev.participantName),
                participantAvatar: realAvatar,
              };
              saveConversationToStore(updated);
              return updated;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch recipient profile:', err);
      }
    };

    fetchPartnerProfile();

    return () => {
      isMounted = false;
    };
  }, [conversationId, conversation?.participantId, conversation?.petReportId, activeUserId]);

  // 4. Fetch Chat Messages (1-on-1 Chat Screen)
  // Query messages table ordered by created_at ascending
  useEffect(() => {
    let isMounted = true;
    const recipientId = conversation?.participantId;
    if (!activeUserId || !recipientId) {
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);

    const loadMessages = async () => {
      try {
        let messagesData: DbMessageWithProfiles[] | null = null;

        // 1. Supabase Join Query joining sender and receiver profiles
        const { data: joinData, error: joinError } = await supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(full_name, avatar_url),
            receiver:profiles!receiver_id(full_name, avatar_url)
          `)
          .or(
            `and(sender_id.eq.${activeUserId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${activeUserId})`
          )
          .order('created_at', { ascending: true });

        if (!joinError && joinData) {
          messagesData = joinData;
        } else {
          // Fallback if foreign key relationship is missing in schema cache
          console.warn('Chat messages join query fallback:', joinError?.message);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('messages')
            .select('*')
            .or(
              `and(sender_id.eq.${activeUserId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${activeUserId})`
            )
            .order('created_at', { ascending: true });

          if (fallbackError) {
            console.error('Error fetching chat messages:', fallbackError);
            if (isMounted) showToast('Failed to load messages from server.');
            return;
          }
          messagesData = fallbackData;
        }

        if (isMounted && messagesData) {
          // 2. Determine who the logged-in user is talking to:
          // sender if current user is receiver, or receiver if current user is sender
          for (const m of messagesData) {
            const partner = m.sender_id === activeUserId ? m.receiver : m.sender;
            const p = Array.isArray(partner) ? partner[0] : partner;

            if (p?.full_name?.trim() || p?.avatar_url) {
              const realName = p.full_name?.trim() || 'User';
              const realAvatar = p.avatar_url || null;

              setRecipientProfile({
                fullName: realName,
                avatarUrl: realAvatar,
              });

              setConversation((prev) => {
                if (!prev) return prev;
                const updated = {
                  ...prev,
                  participantName: realName,
                  participantAvatar: realAvatar,
                };
                saveConversationToStore(updated);
                return updated;
              });
              break;
            }
          }

          const formatted: ChatMessage[] = messagesData.map((m: DbMessageWithProfiles) => ({
            id: m.id,
            senderId: m.sender_id === activeUserId ? 'me' : 'them',
            text: m.content,
            timestamp: formatDynamicTimestamp(m.created_at),
            status: 'sent',
          }));

          setConversation((prev) => {
            if (!prev) return prev;
            const updated: Conversation = {
              ...prev,
              messages: formatted,
              lastMessage:
                formatted.length > 0 ? formatted[formatted.length - 1].text : prev.lastMessage,
              lastMessageTime:
                formatted.length > 0
                  ? formatted[formatted.length - 1].timestamp
                  : prev.lastMessageTime,
            };
            saveConversationToStore(updated);
            return updated;
          });
        }
      } catch (err: unknown) {
        console.error('Exception fetching chat messages:', err);
      } finally {
        if (isMounted) {
          setLoadingMessages(false);
        }
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [activeUserId, conversation?.participantId]);

  // 5. Supabase Realtime Subscription: Listen to INSERT events on messages table
  useEffect(() => {
    const recipientId = conversation?.participantId;
    if (!activeUserId || !recipientId) return;

    const channelName = `realtime-chat-${[activeUserId, recipientId].sort().join('-')}`;
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
          const newMsg = payload.new as DbMessage;
          if (!newMsg) return;

          // Check if message belongs to this 1-on-1 chat
          const isCurrentChat =
            (newMsg.sender_id === activeUserId && newMsg.receiver_id === recipientId) ||
            (newMsg.sender_id === recipientId && newMsg.receiver_id === activeUserId);

          if (!isCurrentChat) return;

          const formattedTime = formatDynamicTimestamp(newMsg.created_at);

          setConversation((prev) => {
            if (!prev) return prev;

            // Deduplicate if already present by id
            if (prev.messages.some((m) => m.id === newMsg.id)) {
              return prev;
            }

            // If an optimistic temp message exists, reconcile its ID and timestamp
            const tempIdx = prev.messages.findIndex(
              (m) => m.senderId === 'me' && m.text === newMsg.content && m.id.startsWith('temp-')
            );

            let nextMessages: ChatMessage[];
            if (tempIdx !== -1) {
              nextMessages = [...prev.messages];
              nextMessages[tempIdx] = {
                ...nextMessages[tempIdx],
                id: newMsg.id,
                timestamp: formattedTime,
              };
            } else {
              // Newly received message from recipient
              const incoming: ChatMessage = {
                id: newMsg.id,
                senderId: newMsg.sender_id === activeUserId ? 'me' : 'them',
                text: newMsg.content,
                timestamp: formattedTime,
                status: 'sent',
              };
              nextMessages = [...prev.messages, incoming];
            }

            const updated: Conversation = {
              ...prev,
              messages: nextMessages,
              lastMessage: newMsg.content,
              lastMessageTime: formattedTime,
            };
            saveConversationToStore(updated);
            if (activeUserId) {
              markConversationAsRead(prev.id, activeUserId);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeUserId, conversation?.participantId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // 6. Send Message Handler
  const handleSendMessage = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if ((!textToSend && !attachedMedia) || !conversation || sending || uploadingMedia) return;

    setSending(true);

    try {
      // 1. Get authenticated user UUID via supabase.auth.getUser()
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        showToast('Please sign in to send messages.');
        setSending(false);
        return;
      }

      const sender_id = user.id;
      const receiver_id = conversation.participantId;
      const post_id = cleanUuid(conversation.petReportId);

      if (!receiver_id) {
        showToast('Recipient is not available.');
        setSending(false);
        return;
      }

      // Upload media if attached
      let uploadedUrl: string | null = null;
      if (attachedMedia) {
        setUploadingMedia(true);
        try {
          uploadedUrl = await uploadPetImage(attachedMedia.file, sender_id);
        } catch (upErr) {
          console.error('Failed to upload image:', upErr);
          showToast('Failed to upload photo. Please retry.');
          setSending(false);
          setUploadingMedia(false);
          return;
        } finally {
          setUploadingMedia(false);
        }
      }

      // Build message payload
      let payloadContent = textToSend;
      if (uploadedUrl) {
        payloadContent = textToSend
          ? `${textToSend}\n[img]${uploadedUrl}[/img]`
          : `[img]${uploadedUrl}[/img]`;
      }

      if (!payloadContent.trim()) {
        setSending(false);
        return;
      }

      // Clear input and attachment immediately
      setInputText('');
      if (attachedMedia?.previewUrl) {
        URL.revokeObjectURL(attachedMedia.previewUrl);
      }
      setAttachedMedia(null);

      // 2. Append new message to local chat state immediately (instant UI update)
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();
      const timeFormatted = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      const optimisticMsg: ChatMessage = {
        id: tempId,
        senderId: 'me',
        text: payloadContent,
        timestamp: timeFormatted,
        status: 'sent',
      };

      setConversation((prev) => {
        if (!prev) return prev;
        const nextMessages = [...prev.messages, optimisticMsg];
        const updated: Conversation = {
          ...prev,
          messages: nextMessages,
          lastMessage: textToSend || '📷 Photo',
          lastMessageTime: 'Just now',
        };
        saveConversationToStore(updated);
        return updated;
      });

      // 4. Execute Supabase .from('messages').insert([...]) mutation
      const { data: inserted, error: insertError } = await supabase
        .from('messages')
        .insert([
          {
            sender_id,
            receiver_id,
            post_id,
            content: payloadContent,
          },
        ])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // 5. Reconcile temporary message with Supabase response
      if (inserted) {
        const realTime = formatDynamicTimestamp(inserted.created_at);
        setConversation((prev) => {
          if (!prev) return prev;
          const updatedMessages = prev.messages.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: inserted.id,
                  timestamp: realTime,
                }
              : m
          );
          const updated: Conversation = {
            ...prev,
            messages: updatedMessages,
            lastMessage: textToSend || '📷 Photo',
            lastMessageTime: realTime,
          };
          saveConversationToStore(updated);
          return updated;
        });
      }
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to send message.';
      if (errMsg.includes('invalid input syntax for type uuid')) {
        showToast('Cannot send: Post does not have a registered owner.');
      } else {
        showToast(errMsg || 'Failed to deliver message.');
      }
    } finally {
      setSending(false);
      setUploadingMedia(false);
    }
  };

  if (!conversation) {
    return (
      <main className="app-shell chat-screen-shell">
        <div className="chat-not-found">
          <p>Conversation not found.</p>
          <button className="primary-button" onClick={onBack}>
            Go Back
          </button>
        </div>
      </main>
    );
  }

  // Calculate real recipient user display name
  const rawRecipientName =
    recipientProfile?.fullName?.trim() ||
    (conversation.participantName &&
    !conversation.participantName.startsWith('Owner of') &&
    conversation.participantName !== 'Pet Owner'
      ? conversation.participantName.trim()
      : '') ||
    'User';
  const headerDisplayName = rawRecipientName;

  // Recipient profile avatar (guaranteed NOT to be a pet photo)
  const headerAvatarUrl = recipientProfile?.avatarUrl || conversation.participantAvatar || null;

  const hasMessages = conversation.messages && conversation.messages.length > 0;

  return (
    <main className="app-shell chat-screen-shell">
      {/* Top phone status bar */}
      <div className="phone-status-bar">
        <span className="phone-status-time">09:30</span>
        <div className="phone-notch" />
        <div className="phone-status-icons">
          <Signal size={13} strokeWidth={2.4} />
          <Wifi size={13} strokeWidth={2.4} />
          <Battery size={14} strokeWidth={2.4} />
        </div>
      </div>

      {/* Header */}
      <header className="chat-header">
        <button className="chat-header-back" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={22} strokeWidth={2.4} />
        </button>

        {/* Profile Avatar Container: shows profile avatar if available, otherwise standard user icon */}
        <div className="chat-header-avatar-wrap">
          {headerAvatarUrl ? (
            <img
              src={headerAvatarUrl}
              alt={headerDisplayName}
              className="chat-header-avatar"
            />
          ) : (
            <div className="chat-header-avatar-placeholder" aria-label="User avatar">
              <UserRound size={20} strokeWidth={2.2} />
            </div>
          )}
        </div>

        {/* Header Text: Real user name and Pet Context Subtitle */}
        <div className="chat-header-info">
          <h1 className="chat-header-name">{headerDisplayName}</h1>
          {conversation.petName && (
            <span className="chat-header-subtitle">Regarding {conversation.petName}</span>
          )}
        </div>

        <div className="chat-header-actions">
          <button
            className="chat-icon-btn"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="More options"
            title="More options"
          >
            <MoreVertical size={20} strokeWidth={2.2} />
          </button>

          {showMenu && (
            <div className="chat-dropdown-menu">
              <button
                onClick={() => {
                  setShowMenu(false);
                  showToast('Notifications muted for this chat.');
                }}
              >
                Mute Notifications
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  showToast(`Viewing contact details for ${headerDisplayName}`);
                }}
              >
                Contact Details
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onBack();
                }}
              >
                Close Chat
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Notification Toast */}
      {toastMessage && <div className="chat-toast-alert">{toastMessage}</div>}

      {/* Messages Area */}
      <section className="chat-messages-area" aria-label="Conversation messages">
        {(conversation.petName || petPost?.name) && (
          <div className="chat-pet-preview-card">
            <div className="chat-pet-preview-thumb-wrap">
              {(petPost?.image_url || conversation.petImage) ? (
                <img
                  src={petPost?.image_url || conversation.petImage}
                  alt={petPost?.name || conversation.petName}
                  className="chat-pet-preview-thumb"
                  loading="lazy"
                />
              ) : (
                <div className="chat-pet-preview-thumb-placeholder" aria-label="Pet icon">
                  <PawPrint size={20} strokeWidth={2.2} />
                </div>
              )}
            </div>

            <div className="chat-pet-preview-details">
              <div className="chat-pet-preview-tag">
                <span className="chat-pet-tag-dot" />
                <span>Inquiry regarding post</span>
              </div>
              <div className="chat-pet-preview-title-row">
                <strong className="chat-pet-preview-name">
                  {petPost?.name || conversation.petName}
                </strong>
                {(petPost?.species || conversation.petSpecies) && (
                  <span className="chat-pet-preview-species">
                    • {petPost?.species || conversation.petSpecies}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className="chat-pet-preview-action-btn"
              onClick={() => {
                if (onViewPost && (petPost?.id || conversation.petReportId)) {
                  onViewPost(petPost?.id || conversation.petReportId!);
                  return;
                }
                setShowPetModal(true);
              }}
              aria-label={`View post for ${petPost?.name || conversation.petName}`}
              title="View pet post"
            >
              <span>View Post</span>
              <ExternalLink size={13} strokeWidth={2.4} />
            </button>
          </div>
        )}

        {loadingMessages ? (
          <div className="chat-loading-wrap" aria-label="Loading messages">
            <Loader2 size={24} className="spinner" />
          </div>
        ) : !hasMessages ? (
          /* Empty State Handling */
          <div className="chat-empty-state">
            <div className="chat-empty-icon-wrap">
              <MessageSquare size={28} strokeWidth={2} />
            </div>
            <p className="chat-empty-title">No messages yet</p>
            <p className="chat-empty-desc">Send a message to start the conversation!</p>
          </div>
        ) : (
          /* Dynamic message history fetched from Supabase messages table */
          conversation.messages.map((msg: ChatMessage) => {
            const isMe = msg.senderId === 'me';
            const { text: cleanText, imageUrl } = parseMessageContent(msg.text);

            return (
              <div
                key={msg.id}
                className={`chat-bubble-row ${isMe ? 'chat-row-sent' : 'chat-row-received'}`}
              >
                <div
                  className={`chat-bubble ${isMe ? 'chat-bubble-sent' : 'chat-bubble-received'}`}
                >
                  {imageUrl && (
                    <div className="chat-bubble-media-wrap">
                      <img
                        src={imageUrl}
                        alt="Attached pet"
                        className="chat-bubble-media"
                        loading="lazy"
                        onClick={() => setPreviewModalImage(imageUrl)}
                      />
                    </div>
                  )}
                  {cleanText && <p className="chat-bubble-text">{cleanText}</p>}
                  <div className="chat-bubble-footer">
                    <span className="chat-bubble-time">{formatMessageTime(msg.timestamp) || 'Just now'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Bottom Input Bar */}
      <footer className="chat-bottom-bar">
        {attachedMedia && (
          <div className="chat-attachment-preview">
            <img
              src={attachedMedia.previewUrl}
              alt="Attachment preview"
              className="chat-attach-thumb"
            />
            <span className="chat-attach-filename">{attachedMedia.name}</span>
            <button
              type="button"
              className="chat-attach-remove"
              onClick={() => {
                URL.revokeObjectURL(attachedMedia.previewUrl);
                setAttachedMedia(null);
              }}
              aria-label="Remove photo"
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="chat-input-capsule">
          <button
            type="button"
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingMedia}
            aria-label="Attach pet photo"
            title="Attach photo"
          >
            {uploadingMedia ? (
              <Loader2 size={18} className="spinner" />
            ) : (
              <Camera size={19} strokeWidth={2.2} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleSelectMedia}
          />

          <input
            ref={inputRef}
            type="text"
            className="chat-capsule-input"
            placeholder={attachedMedia ? 'Add a caption...' : 'Type something...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={sending || uploadingMedia}
          />

          <button
            type="submit"
            className="chat-capsule-circle-btn"
            aria-label="Send message"
            title="Send"
            disabled={(!inputText.trim() && !attachedMedia) || sending || uploadingMedia}
          >
            {sending || uploadingMedia ? (
              <Loader2 size={16} className="spinner" />
            ) : (
              <ArrowRight size={18} strokeWidth={2.6} />
            )}
          </button>
        </form>
      </footer>

      {/* Pet Post Quick Details Modal */}
      {showPetModal && (
        <div className="chat-pet-modal-overlay" onClick={() => setShowPetModal(false)}>
          <div className="chat-pet-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="chat-pet-modal-header">
              <span className="chat-pet-modal-title">Pet Post Details</span>
              <button
                className="chat-pet-modal-close"
                onClick={() => setShowPetModal(false)}
                aria-label="Close details"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>

            <div className="chat-pet-modal-body">
              {(petPost?.image_url || conversation.petImage) && (
                <div className="chat-pet-modal-img-wrap">
                  <img
                    src={petPost?.image_url || conversation.petImage}
                    alt={petPost?.name || conversation.petName}
                    className="chat-pet-modal-img"
                  />
                  {petPost?.status && (
                    <span className={petPost.status === 'FOUND' ? 'badge-found' : 'badge-lost'}>
                      {petPost.status}
                    </span>
                  )}
                </div>
              )}

              <div className="chat-pet-modal-info">
                <h3 className="chat-pet-modal-name">{petPost?.name || conversation.petName}</h3>
                {(petPost?.species || conversation.petSpecies) && (
                  <p className="chat-pet-modal-species">
                    Species: <strong>{petPost?.species || conversation.petSpecies}</strong>
                  </p>
                )}
                {petPost?.location && (
                  <p className="chat-pet-modal-meta">
                    <MapPin size={14} /> <span>{petPost.location} {petPost.district ? `(${petPost.district})` : ''}</span>
                  </p>
                )}
                {petPost?.contact && (
                  <p className="chat-pet-modal-meta">
                    <Phone size={14} /> <span>{petPost.contact}</span>
                  </p>
                )}
                {petPost?.description && (
                  <p className="chat-pet-modal-desc">{petPost.description}</p>
                )}
              </div>
            </div>

            <div className="chat-pet-modal-footer">
              {onViewPost && (petPost?.id || conversation.petReportId) && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowPetModal(false);
                    onViewPost(petPost?.id || conversation.petReportId!);
                  }}
                >
                  Open Full Post Page
                </button>
              )}
              <button
                type="button"
                className="chat-pet-modal-close-btn"
                onClick={() => setShowPetModal(false)}
              >
                Back to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Preview Lightbox */}
      {previewModalImage && (
        <div className="chat-image-lightbox" onClick={() => setPreviewModalImage(null)}>
          <button
            className="chat-image-lightbox-close"
            onClick={() => setPreviewModalImage(null)}
            aria-label="Close photo"
          >
            <X size={22} strokeWidth={2.4} />
          </button>
          <img src={previewModalImage} alt="Fullscreen pet" className="chat-image-lightbox-img" />
        </div>
      )}
    </main>
  );
}
