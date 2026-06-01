import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { streamDocumentChat, type ChatTurn } from '../lib/ai';
import type { Document } from '../types';
import type { User } from '../types';

const CHAT_COST = 0.5;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentNames?: string[];
  timestamp: Date;
  pending?: boolean;
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
  const abortRef = useRef<AbortController | null>(null);

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

  // Load chat history when doc or user changes
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    setMessages([]);
    const base = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', profileId)
      .order('created_at', { ascending: true })
      .limit(80);

    const scoped = selectedDocId
      ? base.eq('document_id', selectedDocId)
      : base.is('document_id', null);

    scoped.then(({ data, error }) => {
      if (error) console.error('[Chat] history load error', error);
      if (data && data.length > 0) {
        setMessages(data.map((m: Record<string, unknown>) => ({
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
    // Eski kod yalnızca bayat local krediye bakıp yetersizse mesajı yine de gönderiyordu.
    const { error: creditErr } = await supabase.rpc('consume_credits', {
      p_action: 'chat',
      p_amount: CHAT_COST,
      p_reference: selectedDocId || null,
    });
    if (creditErr) {
      if (/Yetersiz/.test(creditErr.message)) {
        toast.error('Krediniz yetersiz. Sohbet için en az 0.5 kredi gerekiyor.');
        return; // mesaj gönderilmez, hiçbir şey yazılmaz
      }
      // Geçici/altyapı hatası → kullanıcının önünü kesme ama logla
      console.warn('[Chat] kredi düşümü hatası:', creditErr.message);
    }
    void refreshProfile?.(); // local kredi sayacını güncel tut

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
      await streamDocumentChat(
        historySnapshot,
        text || 'Eklenen dosyaları incele ve ne yapabileceğini açıkla.',
        docContext,
        filesToSend,
        (_delta, full) => {
          final = full;
          setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: full } : m));
        },
        abortRef.current.signal,
      );
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: final, pending: false } : m));
      void supabase.from('chat_messages').insert({
        user_id: profile.id,
        ...(selectedDocId ? { document_id: selectedDocId } : {}),
        role: 'assistant', content: final, credits_used: 0,
      });
    } catch (err: unknown) {
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
  };

  return {
    messages, setMessages,
    input, setInput,
    loading,
    documents,
    selectedDocId, setSelectedDocId,
    pendingFiles, setPendingFiles,
    docContext,
    abortRef,
    sendMessage,
    clearChat,
  };
}
