import { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { OverlayData, OverlayPage } from '../types';
import styles from '../styles/components/overlayViewer.module.css';

interface Props {
  overlay: OverlayData;
  currentPage: number;
  onSave: (updated: OverlayData) => void;
  onClose: () => void;
}

export default function TranslationEditor({ overlay, currentPage, onSave, onClose }: Props) {
  const page = overlay.pages.find(p => p.pageNum === currentPage);

  const [edits, setEdits] = useState<Record<number, string>>(() => {
    if (!page) return {};
    return Object.fromEntries(page.blocks.map((b, i) => [i, b.translated]));
  });

  const handleSave = () => {
    const updatedPages: OverlayPage[] = overlay.pages.map(p => {
      if (p.pageNum !== currentPage) return p;
      return {
        ...p,
        blocks: p.blocks.map((b, i) => ({
          ...b,
          translated: edits[i] ?? b.translated,
        })),
      };
    });
    onSave({ ...overlay, pages: updatedPages });
  };

  return (
    <div
      className={styles.editorBackdrop}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.editorPanel}>
        {/* Header */}
        <div className={styles.editorHeader}>
          <div>
            <h3 className={styles.editorTitle}>Çeviri Editörü</h3>
            <p className={styles.editorSub}>
              Sayfa {currentPage} — {page?.blocks.length ?? 0} metin bloğu
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Kapat">
            <X size={15} />
          </button>
        </div>

        {/* Block list */}
        <div className={styles.editorBody}>
          {!page || page.blocks.length === 0 ? (
            <p className={styles.editorEmpty}>Bu sayfada çevrilmiş metin bloğu yok.</p>
          ) : (
            page.blocks.map((block, i) => (
              <div key={i} className={styles.editorBlock}>
                <div className={styles.editorBlockOrig}>{block.original}</div>
                <div className={styles.editorBlockLabel}>Çeviri</div>
                <textarea
                  className={styles.editorBlockInput}
                  value={edits[i] ?? block.translated}
                  onChange={e => setEdits(prev => ({ ...prev, [i]: e.target.value }))}
                  rows={3}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.editorFooter}>
          <button className={styles.editorCancelBtn} onClick={onClose}>İptal</button>
          <button className={styles.editorSaveBtn} onClick={handleSave}>
            <RefreshCw size={13} /> Kaydet & Yenile
          </button>
        </div>
      </div>
    </div>
  );
}
