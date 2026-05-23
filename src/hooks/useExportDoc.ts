import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { exportMarkdownToPDF, exportMarkdownToDOCX, exportMarkdownToTxt } from '../lib/exporters';

export type ExportFormat = 'pdf' | 'docx' | 'txt';

export interface ExportOpts {
  markdown: string;
  filename: string;   // uzantısız
  title: string;
  subtitle?: string;
  onDone?: () => void;
}

export function useExportDoc() {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const downloadAs = useCallback(async (format: ExportFormat, opts: ExportOpts) => {
    setExporting(format);
    try {
      if (format === 'pdf') {
        await exportMarkdownToPDF(opts.markdown, {
          filename: `${opts.filename}.pdf`,
          title: opts.title,
          subtitle: opts.subtitle,
        });
      } else if (format === 'docx') {
        await exportMarkdownToDOCX(opts.markdown, {
          filename: `${opts.filename}.docx`,
          title: opts.title,
          subtitle: opts.subtitle,
        });
      } else {
        exportMarkdownToTxt(opts.markdown, `${opts.filename}.txt`);
      }
      toast.success(`${format.toUpperCase()} indirildi`);
      opts.onDone?.();
    } catch {
      toast.error('İndirme başarısız oldu');
    } finally {
      setExporting(null);
    }
  }, []);

  return { exporting, downloadAs };
}
