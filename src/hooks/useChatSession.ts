import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { streamDocumentChat, type ChatTurn } from '../lib/ai';
import { getCreditCosts } from '../lib/creditConfig';
import type { Document } from '../types';
import type { User } from '../types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentNames?: string[];
  timestamp: Date;
  pending?: boolean;
}

/** Bir sohbet "kapsamı" — genel asistan (docId null) veya belirli bir belge. */
export interface Conversation {
  docId: string | null;
  lastAt: string;
  preview: string;
}

interface UseChatSessionOpts {
  profile: User | null;
  initDocId: string;
  refreshProfile?: () => void | Promise<void>;
}

export function useChatSession({ profile, initDocId, refreshProfile }: UseChatSessionOpts) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState(initDocId);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [docContext, setDocContext] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Streaming throttle — her SSE token'da setState yerine en fazla kare başına
  // bir güncelleme yap (render jank'ini önler → "yavaş" hissini giderir).
  const rafRef = useRef<number | null>(null);
  const pendingFullRef = useRef<string>('');

  // Load completed documents for doc picker
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('documents')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDocuments(data as Document[]); });
  }, [profile]);

  // ── Geçmiş sohbet kapsamlarını yükle ("eski chatler") ──────────────────────
  const profileId = profile?.id;
  const loadConversations = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('document_id, content, created_at')
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(400);
    if (!data) return;
    const map = new Map<string, Conversation>();
    for (const m of data as Array<{ document_id: string | null; content: string | null; created_at: string }>) {
      const key = m.document_id ?? '__general__';
      if (!map.has(key)) {
        map.set(key, {
          docId: m.document_id ?? null,
          lastAt: m.created_at,
          preview: (m.content || '').replace(/\s+/g, ' ').slice(0, 80),
        });
      }
    }
    setConversations(Array.from(map.values()));
  }, [profileId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Load chat history when doc or user changes
  useEffect(() => {
    if (!profileId) return;
    setMessages([]);
    // Son 80 mesajı çek (en yeni → en eski), sonra kronolojik sıraya çevir.
    // ascending+limit eski 80'i getiriyordu → 80'i geçen sohbetlerde yeni
    // mesajlar (yani güncel geçmiş) hiç görünmüyordu.
    const base = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(80);

    const scoped = selectedDocId
      ? base.eq('document_id', selectedDocId)
      : base.is('document_id', null);

    scoped.then(({ data, error }) => {
      if (error) console.error('[Chat] history load error', error);
      if (data && data.length > 0) {
        const ordered = [...data].reverse(); // en yeni→eski geldi, kronolojiğe çevir
        setMessages(ordered.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          role: m.role as 'user' | 'assistant',
          content: (m.content as string) || '',
          timestamp: new Date(m.created_at as string),
        })));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, selectedDocId]);

  // Cache translation text for the selected document
  useEffect(() => {
    if (!selectedDocId) { setDocContext(null); return; }
    supabase
      .from('translations')
      .select('translated_text')
      .eq('document_id', selectedDocId)
      .eq('status', 'completed')
      .single()
      .then(({ data }) => {
        setDocContext(
          (data?.translated_text as { pages?: string[] } | null)?.pages
            ? (data!.translated_text as { pages: string[] }).pages.join('\n\n')
            : null
        );
      });
  }, [selectedDocId]);

  // Streaming güncellemesini kareye hizala
  const flushStreaming = useCallback((asstId: string) => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const full = pendingFullRef.current;
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: full } : m));
    });
  }, []);

  const sendMessage = async (opts?: { overrideText?: string; pageFile?: File }) => {
    const text = (opts?.overrideText ?? input).trim();
    const pageFile = opts?.pageFile ?? null;
    if ((!text && pendingFiles.length === 0 && !pageFile) || loading || !profile) return;

    const historySnapshot: ChatTurn[] = messages
      .filter(m => !m.pending && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    const filesToSend = [...pendingFiles, ...(pageFile ? [pageFile] : [])];
    const attachmentNames = [
      ...pendingFiles.map(f => f.name),
      ...(pageFile ? [pageFile.name] : []),
    ];

    // ── Kredi zorlaması (server-side, atomik) — "bedava sohbet" sızıntısını önler ──
    const CHAT_COST = (await getCreditCosts()).chat;
    const { data: opData, error: creditErr } = await supabase.rpc('begin_ai_operation', {
      p_action: 'chat',
      p_amount: CHAT_COST,
      p_calls: 5,
      p_reference: selectedDocId || null,
    });
    const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
    if (creditErr || !operationId) {
      const m = creditErr?.message ?? '';
      if (/Yetersiz/.test(m)) {
        toast.error(`Krediniz yetersiz. Sohbet için en az ${CHAT_COST} kredi gerekiyor.`);
      } else if (/fazla istek/.test(m)) {
        toast.error('Çok fazla istek — birkaç saniye bekleyin.');
      } else {
        toast.error('Mesaj gönderilemedi, tekrar deneyin.');
      }
      return;
    }
    void refreshProfile?.();

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '(eklenen dosyaları incele)',
      attachmentNames: attachmentNames.length ? attachmentNames : undefined,
      timestamp: new Date(),
    };
    const asstId = (Date.now() + 1).toString();
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '', timestamp: new Date(), pending: true };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    if (!opts?.overrideText) setInput('');
    setLoading(true);
    setPendingFiles([]);

    void supabase.from('chat_messages').insert({
      user_id: profile.id,
      ...(selectedDocId ? { document_id: selectedDocId } : {}),
      role: 'user', content: text, credits_used: CHAT_COST,
    });

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      let final = '';
      const result = await streamDocumentChat(
        historySnapshot,
        text || 'Eklenen dosyaları incele ve ne yapabileceğini açıkla.',
        docContext,
        filesToSend,
        (_delta, full) => {
          final = full;
          pendingFullRef.current = full;
          flushStreaming(asstId);
        },
        abortRef.current.signal,
        operationId,
      );
      // Non-streaming fallback'te onChunk çağrılmaz; nihai metni dönüş değerinden al.
      if (result) final = result;
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: final, pending: false } : m));
      void supabase.from('chat_messages').insert({
        user_id: profile.id,
        ...(selectedDocId ? { document_id: selectedDocId } : {}),
        role: 'assistant', content: final, credits_used: 0,
      });
      void loadConversations();
    } catch (err: unknown) {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      const isAbort = err instanceof Error && (err.name === 'AbortError' || /İptal/.test(err.message));
      const errText = isAbort
        ? '_Yanıt durduruldu._'
        : `**Hata:** ${err instanceof Error ? err.message : 'Lütfen tekrar deneyin.'}`;
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: errText, pending: false } : m));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  /** Sohbeti gerçekten sıfırlar — ekranı VE kapsamdaki DB geçmişini siler. */
  const clearChat = async () => {
    if (loading || !profile) return;
    setMessages([]);
    const q = supabase.from('chat_messages').delete().eq('user_id', profile.id);
    const scoped = selectedDocId ? q.eq('document_id', selectedDocId) : q.is('document_id', null);
    const { error } = await scoped;
    if (error) toast.error('Geçmiş silinemedi.');
    else void loadConversations();
  };

  return {
    messages, setMessages,
    input, setInput,
    loading,
    documents,
    selectedDocId, setSelectedDocId,
    pendingFiles, setPendingFiles,
    docContext,
    conversations,
    abortRef,
    sendMessage,
    clearChat,
  };
}
