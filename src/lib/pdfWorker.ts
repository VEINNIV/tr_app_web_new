/**
 * pdf.js worker — Vite tarafından bundle'a dahil edilir, CDN bağımlılığı yok.
 *
 * import.meta.url + ?url Vite'in worker dosyasını assets'e taşımasını sağlar.
 * CDN'den yükleme (cdnjs.cloudflare.com) production'da yavaş veya kırık
 * olabiliyordu — self-host daha güvenilir.
 */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
