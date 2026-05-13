/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TransLingua — ChatPage (AI Asistan, v2)
 *
 * Yenilikler:
 *  • Streaming yanıt (Gemini SSE) — kullanıcı yazılır gibi görür
 *  • Konuşma geçmişi (multi-turn) — AI önceki soruları hatırlar
 *  • Dosya ekleme (görsel + PDF) — soruyla birlikte AI'a gider
 *  • Yanıtı durdurma (abort)
 *  • İlk açılışta hızlı başlatıcılar
 */
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Send, Brain, FileText, ChevronDown, Sparkles,
  Paperclip, X as XIcon, StopCircle, Image as ImageIcon,
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
  pending?: boolean; // streaming sırasında
}

const QUICK_PROMPTS = [
  { icon: '📄', label: 'Bu belgeyi özetle', text: 'Bu belgeyi 5–7 madde halinde özetle. Her maddenin yanına ilgili sayfa numarasını yaz.' },
  { icon: '🎯', label: 'Ana noktalar', text: 'Bu belgenin ana noktalarını ve önemli kavramlarını listele. Her kavram için kısa açıklama ekle.' },
  { icon: '❓', label: 'Sınav soruları', text: 'Bu belgeden 5 sınav sorusu hazırla (3 çoktan seçmeli, 2 açık uçlu) ve cevap anahtarını da ver.' },
  { icon: '🔍', label: 'Anlamadığım yer', text: 'Bu belgenin en karmaşık kısmını sade bir Türkçeyle, lise seviyesine uygun şekilde anlat.' },
];

export default function ChatPage() {
  const { profile } = useAuth();
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

  // Seçilen belgenin çevirisini önbelleğe al
  useEffect(() => {
    if (!selectedDocId) { setDocContext(null); return; }
    supabase
      .from('translations')
      .select('translated_text')
      .eq('document_id', selectedDocId)
      .eq('status', 'completed')
      .single()
      .then(({ data }) => {
        if (data?.translated_text?.pages) {
          setDocContext(data.translated_text.pages.join('\n\n'));
        } else {
          setDocContext(null);
        }
      });
  }, [selectedDocId]);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  /** Multi-turn için Gemini formatına çevir (son mesajı dahil etme — onu newMessage olarak gönderiyoruz) */
  const buildHistory = (): ChatTurn[] => {
    return messages
      .filter(m => !m.pending)
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
  };

  /** Dosya ekleme */
  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const valid = Array.from(list).filter(f => {
      const ok = f.type.startsWith('image/') || f.type === 'application/pdf';
      const small = f.size <= 10 * 1024 * 1024;
      return ok && small;
    });
    setPendingFiles(prev => [...prev, ...valid].slice(0, 5));
    e.target.value = '';
  };

  const removePending = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  /** Mesaj gönder + streaming */
  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if ((!text && pendingFiles.length === 0) || loading || !profile) return;

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

    // Kullanıcı mesajını kaydet
    await supabase.from('chat_messages').insert({
      user_id: profile.id,
      document_id: selectedDocId || null,
      role: 'user',
      content: text,
      credits_used: 0.5,
    });

    // Krediden düş (chat 0.5 kredi)
    if (profile.credits_remaining >= 0.5) {
      await supabase.from('profiles').update({
        credits_remaining: Math.max(0, profile.credits_remaining - 0.5),
      }).eq('id', profile.id);
    }

    abortRef.current = new AbortController();

    try {
      const history = buildHistory();
      // Son 2 mesajı kaldır (yeni user + bekleyen assistant) — onları zaten newMessage olarak gönderiyoruz
      history.pop(); // pending assistant
      history.pop(); // user (kullanıcının az önceki mesajı — yeniden newMessage olarak gönderilecek)

      let final = '';
      await streamDocumentChat(
        history,
        text || 'Eklenen dosyaları incele ve bana ne yapabileceğimi söyle.',
        docContext,
        filesToSend,
        (_delta, full) => {
          final = full;
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: full } : m));
        },
        abortRef.current.signal,
      );

      // Streaming bitti — pending bayrağını kaldır
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: final, pending: false } : m));

      // AI yanıtını DB'ye yaz
      await supabase.from('chat_messages').insert({
        user_id: profile.id,
        document_id: selectedDocId || null,
        role: 'assistant',
        content: final,
        credits_used: 0,
      });
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || /İptal/.test(err?.message || '');
      const errText = isAbort
        ? '_Yanıt durduruldu._'
        : `**Üzgünüm, bir hata oluştu.** ${err?.message || 'Lütfen tekrar deneyin.'}`;
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: errText, pending: false } : m));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
  const selectedDoc = documents.find(d => d.id === selectedDocId);

  if (!profile) {
    return (
      <div className={styles.chatPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>

      {/* ── Başlık ve Doküman Seçici ─────────────────────────── */}
      <div className={styles.chatHeader}>
        <div>
          <h1 className={styles.chatTitle}>AI Doküman Asistanı</h1>
          <p className={styles.chatDesc}>Belgeleriniz hakkında sorular sorun, dosya ekleyin, konuşmaya devam edin.</p>
        </div>

        <div className={styles.docPickerWrapper}>
          <motion.button
            className={styles.docPickerBtn}
            onClick={() => setShowDocPicker(!showDocPicker)}
            whileHover={reduced ? undefined : { y: -1 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={SPRING_TIGHT}
          >
            <FileText size={15} />
            <span>{selectedDoc ? selectedDoc.original_name : 'Doküman Seç'}</span>
            <motion.span style={{ display: 'inline-flex' }} animate={{ rotate: showDocPicker ? 180 : 0 }} transition={SPRING_TIGHT}>
              <ChevronDown size={14} />
            </motion.span>
          </motion.button>
          <AnimatePresence>
            {showDocPicker && (
              <motion.div
                className={styles.docPickerDropdown}
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  className={`${styles.docPickerItem} ${!selectedDocId ? styles.docPickerItemActive : ''}`}
                  onClick={() => { setSelectedDocId(''); setShowDocPicker(false); }}
                >
                  <Brain size={14} /> Genel Asistan
                </button>
                {documents.length === 0 ? (
                  <div className={styles.docPickerEmpty}>
                    Tamamlanmış belge yok.{' '}
                    <Link to="/translate" onClick={() => setShowDocPicker(false)}>Çeviri başlat →</Link>
                  </div>
                ) : documents.map(d => (
                  <button
                    key={d.id}
                    className={`${styles.docPickerItem} ${selectedDocId === d.id ? styles.docPickerItemActive : ''}`}
                    onClick={() => { setSelectedDocId(d.id); setShowDocPicker(false); }}
                  >
                    <FileText size={14} />
                    <span className={styles.docPickerItemName}>{d.original_name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.demoBar}>
        <Sparkles size={13} />
        <span>{selectedDoc ? `"${selectedDoc.original_name}" hakkında sorular sorun.` : 'Belge seçin veya soruyla birlikte dosya ekleyin (resim/PDF).'}</span>
      </div>

      {/* ── Sohbet Alanı ─────────────────────────────────────── */}
      <div className={styles.chatBody} ref={bodyRef}>
        {messages.length === 0 ? (
          <motion.div
            className={styles.emptyChat}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={reduced ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Brain size={48} className={styles.emptyChatIcon} />
            </motion.div>
            <div className={styles.emptyChatText}>Bir soru sorun ya da dosya ekleyin</div>
            <div className={styles.emptyChatHint}>Belgeyi anlıyor, hatırlıyor ve takip soruları yanıtlıyor.</div>

            {/* Hızlı başlatıcılar */}
            <div style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 8,
              maxWidth: 600, width: '100%',
            }}>
              {QUICK_PROMPTS.map(qp => (
                <motion.button
                  key={qp.label}
                  whileHover={reduced ? undefined : { y: -2 }}
                  whileTap={reduced ? undefined : { scale: 0.97 }}
                  transition={SPRING_TIGHT}
                  onClick={() => sendMessage(qp.text)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', textAlign: 'left',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 12, cursor: 'pointer', fontSize: 13,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{qp.icon}</span>
                  <span>{qp.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map(msg => (
            <motion.div
              key={msg.id}
              className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgUser : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={`${styles.msgAvatar} ${msg.role === 'user' ? styles.msgAvatarUser : styles.msgAvatarAi}`}>
                {msg.role === 'user' ? initials : 'AI'}
              </div>
              <div>
                <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAi}`}>
                  {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {msg.attachmentNames.map((n, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 999,
                          background: 'rgba(0,0,0,0.06)', color: 'inherit',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <Paperclip size={11} /> {n}
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
                            p: ({ ...props }) => <p style={{ margin: 0, paddingBottom: '0.5em' }} {...props} />,
                            ul: ({ ...props }) => <ul style={{ margin: 0, paddingLeft: '1.5em', paddingBottom: '0.5em' }} {...props} />,
                            h1: ({ ...props }) => <h3 style={{ margin: '0.5em 0' }} {...props} />,
                            h2: ({ ...props }) => <h4 style={{ margin: '0.5em 0' }} {...props} />,
                            h3: ({ ...props }) => <h5 style={{ margin: '0.5em 0' }} {...props} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {msg.pending && (
                          <motion.span
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.2, repeat: Infinity }}
                            style={{ display: 'inline-block', width: 6, height: 14, background: 'currentColor', verticalAlign: 'middle', marginLeft: 2 }}
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
                <div className={styles.msgTime}>
                  {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* ── Bekleyen dosyalar (input'un üstünde) ───────────── */}
      {pendingFiles.length > 0 && (
        <div style={{
          padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 6,
          borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-alt)',
        }}>
          {pendingFiles.map((f, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 999, fontSize: 12,
            }}>
              {f.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button onClick={() => removePending(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
                <XIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Mesaj Giriş Alanı ──────────────────────────────── */}
      <div className={styles.chatInput}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={onPickFiles}
          style={{ display: 'none' }}
        />
        <motion.button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          whileHover={reduced || loading ? undefined : { scale: 1.06 }}
          whileTap={reduced || loading ? undefined : { scale: 0.92 }}
          transition={SPRING_TIGHT}
          style={{
            background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 10, padding: 10, cursor: loading ? 'not-allowed' : 'pointer',
            color: 'var(--color-text-secondary)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          title="Dosya ekle"
        >
          <Paperclip size={18} />
        </motion.button>
        <textarea
          className={styles.inputField}
          placeholder={loading ? 'Yanıt geliyor…' : 'Belgeniz hakkında bir soru sorun…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        {loading ? (
          <motion.button
            className={styles.sendBtn}
            onClick={stopGenerating}
            whileHover={reduced ? undefined : { scale: 1.06 }}
            whileTap={reduced ? undefined : { scale: 0.92 }}
            transition={SPRING_TIGHT}
            style={{ background: 'var(--color-error)' }}
            title="Yanıtı durdur"
          >
            <StopCircle size={18} />
          </motion.button>
        ) : (
          <motion.button
            className={styles.sendBtn}
            onClick={() => sendMessage()}
            disabled={!input.trim() && pendingFiles.length === 0}
            whileHover={reduced || (!input.trim() && pendingFiles.length === 0) ? undefined : { scale: 1.06 }}
            whileTap={reduced || (!input.trim() && pendingFiles.length === 0) ? undefined : { scale: 0.92, rotate: -8 }}
            transition={SPRING_TIGHT}
          >
            <Send size={18} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
