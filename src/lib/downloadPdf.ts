type Html2PdfWorker = {
  set: (options: Record<string, unknown>) => Html2PdfWorker;
  from: (element: HTMLElement) => Html2PdfWorker;
  save: () => Promise<void>;
};

type Html2PdfFactory = () => Html2PdfWorker;

export async function downloadElementAsPdf(
  element: HTMLElement,
  options: Record<string, unknown>,
): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js') as { default: Html2PdfFactory };
  await html2pdf().set(options).from(element).save();
}
