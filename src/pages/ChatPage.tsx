import { useState, useRef, useEffect } from 'react';
import { Send, Brain } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { askAboutDocument } from '../lib/gemini';
import styles from '../styles/components/chat.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await askAboutDocument(
        'Bu bir demo konuşmasıdır. Kullanıcı henüz bir doküman seçmemiş olabilir.',
        text
      );
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response, timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.', timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatHeader}>
        <h1 className={styles.chatTitle}>AI Doküman Asistanı</h1>
        <p className={styles.chatDesc}>Belgeleriniz hakkında sorular sorun, detaylı yanıtlar alın.</p>
      </div>

      <div className={styles.chatBody} ref={bodyRef}>
        {messages.length === 0 ? (
          <div className={styles.emptyChat}>
            <Brain size={48} className={styles.emptyChatIcon} />
            <div className={styles.emptyChatText}>Dokümanınız hakkında bir soru sorun</div>
            <div className={styles.emptyChatHint}>Örn: "Bu belgenin ana konusu nedir?" veya "3. bölümü özetler misin?"</div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgUser : ''}`}>
              <div className={`${styles.msgAvatar} ${msg.role === 'user' ? styles.msgAvatarUser : styles.msgAvatarAi}`}>
                {msg.role === 'user' ? initials : 'AI'}
              </div>
              <div>
                <div className={`${styles.msgBubble} ${msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAi}`}>
                  {msg.content}
                </div>
                <div className={styles.msgTime}>{msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className={styles.msgRow}>
            <div className={`${styles.msgAvatar} ${styles.msgAvatarAi}`}>AI</div>
            <div className={`${styles.msgBubble} ${styles.msgBubbleAi}`}>
              <div className={styles.typing}><div className={styles.typingDot} /><div className={styles.typingDot} /><div className={styles.typingDot} /></div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.chatInput}>
        <textarea
          className={styles.inputField}
          placeholder="Belgeniz hakkında bir soru sorun..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button className={styles.sendBtn} onClick={sendMessage} disabled={!input.trim() || loading}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
