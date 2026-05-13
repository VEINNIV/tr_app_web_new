/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Send, Brain, FileText, ChevronDown,
  Paperclip, X as XIcon, StopCircle, Image as ImageIcon,
  Plus, List, HelpCircle, BookOpen, AlignLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { streamDocumentChat, type ChatTurn } from '../lib/ai';
import type { Document } from '../types';
import styles from '../styles/components/chat.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SPRING_TIGHT } from '../components/ui/motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentNames?: string[];
  timestamp: Date;
  pending?: boolean;
}

const QUICK_PROMPTS = [
  { icon: AlignLeft,  label: 'Özetle',         text: 'Bu belgeyi 5–7 madde halinde özetle.' },
  { icon: List,       label: 'Ana kavramlar',   text: 'Bu belgenin temel kavramlarını ve önemli noktalarını listele. Her madde için kısa açıklama ekle.' },
  { icon: HelpCircle, label: 'Sınav soruları',  text: 'Bu belgeden 5 sınav sorusu hazırla (3 çoktan seçmeli, 2 açık uçlu) ve cevap anahtarını yaz.' },
  { icon: BookOpen,   label: 'Sade anlat',      text: 'Bu belgenin en karmaşık kısmını lise öğrencisine anlatır gibi sade bir Türkçeyle açıkla.' },
];

export default function ChatPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [docContext, setDocContext] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Belgeleri çek
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

  // Önceki sohbet geçmişini yükle
  useEffect(() => {
    if (!profile || historyLoaded) return;
    supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data }) => {
        setHistoryLoaded(true);
        if (data && data.length > 0) {
          setMessages(data.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
            timestamp: new Date(m.created_at),
          })));
        }
      });
  }, [profile, historyLoaded]);

  // Dokümanlar sayfasından otomatik belge seçimi
  useEffect(() => {
    const state = location.state as { documentId?: string } | null;
    if (state?.documentId) {
      setSelectedDocId(state.documentId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seçili belgenin çevirisini önbelleğe al
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
          data?.translated_text?.pages
            ? data.translated_text.pages.join('\n\n')
            : null
        );
      });
  }, [selectedDocId]);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const clearChat = () => { if (!loading) setMessages([]); };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const valid = Array.from(list).filter(
      f => (f.type.startsWith('image/') || f.type === 'application/pdf') && f.size <= 10 * 1024 * 1024
    );
    setPendingFiles(prev => [...prev, ...valid].slice(0, 5));
    e.target.value = '';
  };

  const removePending = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if ((!text && pendingFiles.length === 0) || loading || !profile) return;

    // History'yi setMessages'tan ÖNCE yakala
    const historySnapshot: ChatTurn[] = messages
      .filter(m => !m.pending && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    const attachmentNames = pendingFiles.map(f => f.name);
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '(eklenen dosyaları incele)',
      attachmentNames: attachmentNames.length ? attachmentNames : undefined,
      timestamp: new Date(),
    };
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pending: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    if (!overrideText) setInput('');
    setLoading(true);

    const filesToSend = pendingFiles;
    setPendingFiles([]);

    void supabase.from('chat_messages').insert({
      user_id: profile.id,
      ...(selectedDocId ? { document_id: selectedDocId } : {}),
      role: 'user',
      content: text,
      credits_used: 0.5,
    });

    if (profile.credits_remaining >= 0.5) {
      void supabase.from('profiles').update({
        credits_remaining: Math.max(0, profile.credits_remaining - 0.5),
      }).eq('id', profile.id);
    }

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
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: full } : m));
        },
        abortRef.current.signal,
      );

      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: final, pending: false } : m));

      void supabase.from('chat_messages').insert({
        user_id: profile.id,
        ...(selectedDocId ? { document_id: selectedDocId } : {}),
        role: 'assistant',
        content: final,
        credits_used: 0,
      });
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || /İptal/.test(err?.message || '');
      const errText = isAbort
        ? '_Yanıt durduruldu._'
        : `**Hata:** ${err?.message || 'Lütfen tekrar deneyin.'}`;
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: errText, pending: false } : m));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const selectedDoc = documents.find(d => d.id === selectedDocId);

  if (!profile) {
    return (
      <div className={styles.chatPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2.5px solid #e5e7eb', borderTopColor: '#2454ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <div className={styles.chatHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.chatTitle}>AI Asistan</h1>
          {selectedDoc && (
            <span className={styles.docChip}>
              <FileText size={11} />
              {selectedDoc.original_name}
            </span>
          )}
        </div>

        <div className={styles.headerRight}>
          {messages.length > 0 && (
            <motion.button
              className={styles.newBtn}
              onClick={clearChat}
              disabled={loading}
              whileHover={reduced ? undefined : { y: -1 }}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              transition={SPRING_TIGHT}
            >
              <Plus size={13} /> Yeni
            </motion.button>
          )}

          <div className={styles.docPickerWrapper}>
            <motion.button
              className={styles.docPickerBtn}
              onClick={() => setShowDocPicker(v => !v)}
              whileHover={reduced ? undefined : { y: -1 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              transition={SPRING_TIGHT}
            >
              <Brain size={14} />
              <span>{selectedDoc ? selectedDoc.original_name : 'Belge seç'}</span>
              <motion.span style={{ display: 'inline-flex' }} animate={{ rotate: showDocPicker ? 180 : 0 }} transition={SPRING_TIGHT}>
                <ChevronDown size={13} />
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {showDocPicker && (
                <motion.div
                  className={styles.docPickerDropdown}
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className={`${styles.docPickerItem} ${!selectedDocId ? styles.docPickerItemActive : ''}`}
                    onClick={() => { setSelectedDocId(''); setShowDocPicker(false); }}
                  >
                    <Brain size={14} /> Genel asistan
                  </button>
                  {documents.length === 0 ? (
                    <div className={styles.docPickerEmpty}>
                      Henüz tamamlanmış belge yok.{' '}
                      <Link to="/translate" onClick={() => setShowDocPicker(false)}>Çeviri başlat</Link>
                    </div>
                  ) : documents.map(d => (
                    <button
                      key={d.id}
                      className={`${styles.docPickerItem} ${selectedDocId === d.id ? styles.docPickerItemActive : ''}`}
                      onClick={() => { setSelectedDocId(d.id); setShowDocPicker(false); }}
                    >
                      <FileText size={13} />
                      <span className={styles.docPickerItemName}>{d.original_name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Sohbet Alanı ─────────────────────────────────────── */}
      <div className={styles.chatBody} ref={bodyRef}>
        {messages.length === 0 ? (
          <motion.div
            className={styles.emptyChat}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.emptyChatIcon}>
              <Brain size={28} />
            </div>
            <p className={styles.emptyChatText}>Nasıl yardımcı olabilirim?</p>
            <p className={styles.emptyChatHint}>
              {selectedDoc
                ? `"${selectedDoc.original_name}" üzerine soru sorabilir ya da dosya ekleyebilirsiniz.`
                : 'Bir belge seçin veya soruyla birlikte dosya ekleyin.'
              }
            </p>

            <div className={styles.quickGrid}>
              {QUICK_PROMPTS.map(qp => {
                const Icon = qp.icon;
                return (
                  <motion.button
                    key={qp.label}
                    className={styles.quickBtn}
                    onClick={() => sendMessage(qp.text)}
                    whileHover={reduced ? undefined : { y: -2 }}
                    whileTap={reduced ? undefined : { scale: 0.97 }}
                    transition={SPRING_TIGHT}
                  >
                    <span className={styles.quickBtnIcon}><Icon size={15} /></span>
                    {qp.label}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          messages.map(msg => (
            <motion.div
              key={msg.id}
              className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgUser : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={`${styles.msgAvatar} ${msg.role === 'user' ? styles.msgAvatarUser : styles.msgAvatarAi}`}>
                {msg.role === 'user' ? initials : <Brain size={15} />}
              </div>
              <div className={styles.msgWrap}>
                <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAi}`}>
                  {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                    <div className={styles.attachRow}>
                      {msg.attachmentNames.map((n, i) => (
                        <span key={i} className={styles.attachTag}>
                          <Paperclip size={10} /> {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    msg.content ? (
                      <div className="markdown-body">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm as any]}
                          components={{
                            p: ({ ...p }) => <p style={{ margin: 0, paddingBottom: '0.5em' }} {...p} />,
                            ul: ({ ...p }) => <ul style={{ margin: 0, paddingLeft: '1.4em', paddingBottom: '0.5em' }} {...p} />,
                            ol: ({ ...p }) => <ol style={{ margin: 0, paddingLeft: '1.4em', paddingBottom: '0.5em' }} {...p} />,
                            h1: ({ ...p }) => <h3 style={{ margin: '0.6em 0 0.2em' }} {...p} />,
                            h2: ({ ...p }) => <h4 style={{ margin: '0.5em 0 0.2em' }} {...p} />,
                            h3: ({ ...p }) => <h5 style={{ margin: '0.4em 0 0.2em' }} {...p} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {msg.pending && (
                          <motion.span
                            className={styles.cursor}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}
                      </div>
                    ) : (
                      <div className={styles.typing}>
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                      </div>
                    )
                  ) : (
                    msg.content
                  )}
                </div>
                <div className={`${styles.msgTime} ${msg.role === 'user' ? styles.msgTimeRight : ''}`}>
                  {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* ── Bekleyen dosyalar ──────────────────────────────────── */}
      <AnimatePresence>
        {pendingFiles.length > 0 && (
          <motion.div
            className={styles.pendingFiles}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {pendingFiles.map((f, i) => (
              <span key={i} className={styles.pendingTag}>
                {f.type.startsWith('image/') ? <ImageIcon size={11} /> : <FileText size={11} />}
                <span>{f.name}</span>
                <button onClick={() => removePending(i)} className={styles.pendingRemove}>
                  <XIcon size={11} />
                </button>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Giriş Alanı ────────────────────────────────────────── */}
      <div className={styles.inputWrap}>
        <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" onChange={onPickFiles} style={{ display: 'none' }} />

        <motion.button
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          whileHover={reduced || loading ? undefined : { scale: 1.08 }}
          whileTap={reduced || loading ? undefined : { scale: 0.9 }}
          transition={SPRING_TIGHT}
          title="Dosya ekle"
        >
          <Paperclip size={16} />
        </motion.button>

        <textarea
          className={styles.inputField}
          placeholder="Bir soru yazın…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />

        {loading ? (
          <motion.button
            className={`${styles.sendBtn} ${styles.sendBtnStop}`}
            onClick={() => abortRef.current?.abort()}
            whileHover={reduced ? undefined : { scale: 1.06 }}
            whileTap={reduced ? undefined : { scale: 0.9 }}
            transition={SPRING_TIGHT}
            title="Durdur"
          >
            <StopCircle size={17} />
          </motion.button>
        ) : (
          <motion.button
            className={styles.sendBtn}
            onClick={() => sendMessage()}
            disabled={!input.trim() && pendingFiles.length === 0}
            whileHover={reduced || (!input.trim() && pendingFiles.length === 0) ? undefined : { scale: 1.06 }}
            whileTap={reduced || (!input.trim() && pendingFiles.length === 0) ? undefined : { scale: 0.9 }}
            transition={SPRING_TIGHT}
          >
            <Send size={16} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
