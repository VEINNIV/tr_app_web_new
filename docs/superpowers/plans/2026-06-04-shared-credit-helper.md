# Shared AI-Operation / Credit Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the duplicated client-side credit ritual (begin → parse → classify error → refund) into one shared module so every existing feature and every future feature (F1–F8) shares it.

**Architecture:** Two tiny layers. (1) `src/lib/aiOperation.ts` — pure, React-free primitives `beginAiOperation`/`refundAiOperation` (single home for the RPC calls, operationId parsing, and error-message regexes). (2) `src/hooks/useAiOperation.ts` — a `useAuth`-backed hook wrapping the primitives for the standard begin→run→refund flow. All 7 existing call sites adopt the primitives; sites whose flow matches the standard pattern also use the hook. Server-side RPCs and `ai-proxy` are NOT touched.

**Tech Stack:** React 19 + TypeScript, `@supabase/supabase-js` (`supabase.rpc`), `react-hot-toast`. No test runner exists in this repo (no vitest/jest in `package.json`); verification is `npx tsc -b` + `npm run lint` + manual smoke per migrated path, matching the codebase convention.

**Conventions for every task:**
- "Type-check" = run `npx tsc -b` from `c:\devflut\tr_app_web_new`. Expected: exits 0, no errors.
- "Lint" = run `npm run lint`. Expected: no new errors in touched files.
- Behavior must stay identical: same `action` / `amount` / `calls` / `reference` and same user-visible toast text as before each edit.
- Commit messages end with the project's Co-Authored-By trailer.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/aiOperation.ts` (NEW) | Pure primitives: `beginAiOperation` (RPC + parse + error classification), `refundAiOperation` (RPC + swallow). Sole owner of the `/Yetersiz/` and `/fazla istek/` regexes. |
| `src/hooks/useAiOperation.ts` (NEW) | `useAiOperation()` hook: orchestrates begin → `refreshProfile` → `run(operationId)` → refund-on-error, with configurable toasts. Pulls `refreshProfile` from `useAuth()`. |
| `src/hooks/useChatSession.ts` (EDIT) | Replace inline begin block with `beginAiOperation`. |
| `src/context/TranslationContext.tsx` (EDIT) | Replace inline begin + inline refund with primitives; keep `opIdRef`/beforeunload. |
| `src/pages/DocumentsPage.tsx` (EDIT) | Replace summary credit block with hook `run()`. |
| `src/pages/StudyNotesPage.tsx` (EDIT) | generate → primitives; translate → hook `run()`. |
| `src/pages/GlossaryPage.tsx` (EDIT) | Replace credit block with hook `run()` (toastId `'ai-gloss'`). |
| `src/components/OnboardingModal.tsx` (EDIT) | Replace inline begin with `beginAiOperation` (silent on failure). |

---

## Task 1: Create the primitives module

**Files:**
- Create: `src/lib/aiOperation.ts`

- [ ] **Step 1: Write the full module**

```ts
/**
 * AI operasyonu (kredi) primitifleri — tek kaynak.
 *
 * begin_ai_operation / refund_ai_operation RPC çağrıları, operationId ayrıştırma ve
 * hata sınıflandırma yalnızca burada yapılır. Sayfalar/hook'lar bunları import eder;
 * inline supabase.rpc('begin_ai_operation') çağrısı başka yerde KALMAMALI.
 *
 * NOT: Sunucu otoritesi (atomik düşüm/iade) RPC'lerde kalır; bu dosya yalnızca onları sarar.
 */
import { supabase } from './supabase';

export type AiAction = 'chat' | 'translation' | 'study_notes' | 'glossary' | (string & {});

export type CreditErrorReason = 'insufficient' | 'rate_limit' | 'error';

export interface BeginAiOpInput {
  action: AiAction;
  /** Ayrılacak kredi — çağıran getCreditCosts'tan çözer. */
  amount: number;
  /** ai-proxy çağrı bütçesi. */
  calls: number;
  /** İlgili kayıt (docId vb.). */
  reference?: string | null;
}

export type BeginAiOpResult =
  | { ok: true; operationId: string }
  | { ok: false; reason: CreditErrorReason; message: string };

/** begin_ai_operation RPC + operationId ayrıştırma + hata sınıflandırma. */
export async function beginAiOperation({
  action,
  amount,
  calls,
  reference = null,
}: BeginAiOpInput): Promise<BeginAiOpResult> {
  const { data, error } = await supabase.rpc('begin_ai_operation', {
    p_action: action,
    p_amount: amount,
    p_calls: calls,
    p_reference: reference,
  });
  const operationId = (data as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
  if (!error && operationId) return { ok: true, operationId };

  const message = error?.message ?? '';
  const reason: CreditErrorReason = /Yetersiz/.test(message)
    ? 'insufficient'
    : /fazla istek/.test(message)
      ? 'rate_limit'
      : 'error';
  return { ok: false, reason, message };
}

/**
 * refund_ai_operation RPC — hatayı yutar.
 * Sunucu yalnızca hiç AI çağrısı yapılmadıysa gerçekten iade eder (mevcut davranış).
 */
export async function refundAiOperation(operationId: string): Promise<void> {
  try {
    await supabase.rpc('refund_ai_operation', { p_op_id: operationId });
  } catch {
    /* yut */
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiOperation.ts
git commit -m "feat(credit): add shared AI-operation primitives"
```

---

## Task 2: Create the orchestration hook

**Files:**
- Create: `src/hooks/useAiOperation.ts`

> Verify the auth import path first: `GlossaryPage.tsx` imports `useAuth` from `'../context/auth'`. From `src/hooks/`, the path is `'../context/auth'` as well. Confirm `useAuth()` returns `{ refreshProfile }` (it does — `AuthContext.tsx` exposes `refreshProfile`).

- [ ] **Step 1: Write the full hook**

```ts
/**
 * useAiOperation — standart kredi akışını saran hook.
 *
 * begin → refreshProfile → run(operationId) → hatada refund + refreshProfile.
 * Akışı bu desene birebir uyan sayfalar ve TÜM yeni AI özellikleri bunu kullanır.
 * Özgün UI mantığı olan yerler (chat inline hata, arka plan çevirisi) primitifleri
 * doğrudan kullanır.
 */
import toast from 'react-hot-toast';
import { useAuth } from '../context/auth';
import {
  beginAiOperation,
  refundAiOperation,
  type AiAction,
  type CreditErrorReason,
} from '../lib/aiOperation';

export interface RunAiOpInput<T> {
  action: AiAction;
  amount: number;
  calls: number;
  reference?: string | null;
  /** Asıl AI işi — operationId ile çağrılır. */
  run: (operationId: string) => Promise<T>;
  /** reason başına toast metni override. */
  messages?: Partial<Record<CreditErrorReason, string>>;
  /** Yükleniyor-toast'ını değiştirmek için (ör. GlossaryPage 'ai-gloss'). */
  toastId?: string;
  /** Varsayılan: true. false ise hata toast'ı gösterilmez (çağıran reason ile yönetir). */
  showErrorToast?: boolean;
  /** Varsayılan: true. Çalışma hatasında krediyi iade et. */
  refundOnError?: boolean;
  /** Varsayılan: true. AbortError'da toast gösterme. */
  silentAbort?: boolean;
}

export type RunAiOpResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: CreditErrorReason | 'aborted' };

const DEFAULT_MESSAGES: Record<CreditErrorReason, string> = {
  insufficient: 'Krediniz yetersiz.',
  rate_limit: 'Çok fazla istek — birkaç saniye bekleyin.',
  error: 'İşlem başlatılamadı, tekrar deneyin.',
};

export function useAiOperation() {
  const { refreshProfile } = useAuth();

  async function run<T>(input: RunAiOpInput<T>): Promise<RunAiOpResult<T>> {
    const {
      action,
      amount,
      calls,
      reference = null,
      run: task,
      messages,
      toastId,
      showErrorToast = true,
      refundOnError = true,
      silentAbort = true,
    } = input;

    const toastOpts = toastId ? { id: toastId } : undefined;

    const begin = await beginAiOperation({ action, amount, calls, reference });
    if (!begin.ok) {
      if (showErrorToast) {
        toast.error(messages?.[begin.reason] ?? DEFAULT_MESSAGES[begin.reason], toastOpts);
      }
      return { ok: false, reason: begin.reason };
    }

    // Kredi şimdi atomik düşüldü — UI bakiyesini tazele.
    void refreshProfile?.();

    try {
      const data = await task(begin.operationId);
      return { ok: true, data };
    } catch (e) {
      const isAbort = e instanceof Error && (e.name === 'AbortError' || /İptal/.test(e.message));
      if (refundOnError) {
        await refundAiOperation(begin.operationId);
        void refreshProfile?.();
      }
      if (isAbort && silentAbort) return { ok: false, reason: 'aborted' };
      if (showErrorToast) {
        toast.error(e instanceof Error && e.message ? e.message : 'İşlem tamamlanamadı.', toastOpts);
      }
      return { ok: false, reason: 'error' };
    }
  }

  return { run };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiOperation.ts
git commit -m "feat(credit): add useAiOperation orchestration hook"
```

---

## Task 3: Migrate `useChatSession` to the primitive

Chat shows errors inline in the assistant bubble (not a toast) and does NOT refund on stream error, so it keeps its own streaming/catch and only swaps the begin block.

**Files:**
- Modify: `src/hooks/useChatSession.ts` (the begin block at ~lines 162–182)

- [ ] **Step 1: Add the import**

At the top of the file, alongside the existing imports, add:

```ts
import { beginAiOperation } from '../lib/aiOperation';
```

(Keep the existing `import { getCreditCosts } from ...` and `supabase` imports — `supabase` is still used elsewhere in this file.)

- [ ] **Step 2: Replace the begin block**

Replace this exact block:

```ts
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
```

with:

```ts
    // ── Kredi zorlaması (server-side, atomik) — "bedava sohbet" sızıntısını önler ──
    const CHAT_COST = (await getCreditCosts()).chat;
    const begin = await beginAiOperation({
      action: 'chat',
      amount: CHAT_COST,
      calls: 5,
      reference: selectedDocId || null,
    });
    if (!begin.ok) {
      if (begin.reason === 'insufficient') {
        toast.error(`Krediniz yetersiz. Sohbet için en az ${CHAT_COST} kredi gerekiyor.`);
      } else if (begin.reason === 'rate_limit') {
        toast.error('Çok fazla istek — birkaç saniye bekleyin.');
      } else {
        toast.error('Mesaj gönderilemedi, tekrar deneyin.');
      }
      return;
    }
    const operationId = begin.operationId;
    void refreshProfile?.();
```

(Everything below — `userMsg`, streaming, the inline-bubble catch — is unchanged; `operationId` is still in scope for the `streamDocumentChat(...)` call.)

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. If lint flags `supabase` as unused, confirm it is still used elsewhere in the file (it is — `chat_messages` inserts). Do not remove it.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useChatSession.ts
git commit -m "refactor(credit): use beginAiOperation in useChatSession"
```

---

## Task 4: Migrate `TranslationContext` to primitives

Keep the background-job lifecycle (`opIdRef`, `beforeunload`, `tryRefund`). Swap only the inline RPC + parse + regex (begin) and the inline refund RPC.

**Files:**
- Modify: `src/context/TranslationContext.tsx` (begin at ~268–285; `tryRefund` at ~97–102)

- [ ] **Step 1: Add the import**

```ts
import { beginAiOperation, refundAiOperation } from '../lib/aiOperation';
```

- [ ] **Step 2: Replace the inline refund inside `tryRefund`**

Replace:

```ts
    try { await supabase.rpc('refund_ai_operation', { p_op_id: op }); } catch { /* yut */ }
```

with:

```ts
    await refundAiOperation(op);
```

- [ ] **Step 3: Replace the begin block**

Replace this exact block:

```ts
      const { data: opData, error: opErr } = await supabase.rpc('begin_ai_operation', {
        p_action: 'translation',
        p_amount: estimatedCost,
        p_calls: callBudget,
        p_reference: docId,
      });
      const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
      if (opErr || !operationId) {
        const m = opErr?.message ?? '';
        throw new Error(
          /Yetersiz/.test(m)
            ? `Yetersiz kredi — bu çeviri ${estimatedCost} kredi gerektiriyor.`
            : /fazla istek/.test(m)
              ? 'Çok fazla istek — birkaç saniye bekleyip tekrar deneyin.'
              : 'Çeviri başlatılamadı: ' + (m || 'bilinmeyen hata'),
        );
      }
      opIdRef.current = operationId;
```

with:

```ts
      const begin = await beginAiOperation({
        action: 'translation',
        amount: estimatedCost,
        calls: callBudget,
        reference: docId,
      });
      if (!begin.ok) {
        throw new Error(
          begin.reason === 'insufficient'
            ? `Yetersiz kredi — bu çeviri ${estimatedCost} kredi gerektiriyor.`
            : begin.reason === 'rate_limit'
              ? 'Çok fazla istek — birkaç saniye bekleyip tekrar deneyin.'
              : 'Çeviri başlatılamadı: ' + (begin.message || 'bilinmeyen hata'),
        );
      }
      const operationId = begin.operationId;
      opIdRef.current = operationId;
```

(`operationId` stays in scope for `detectLanguage(...)` and `translatePDF(...)` below — unchanged.)

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. `supabase` remains used elsewhere in this file (documents/translations writes) — keep its import.

- [ ] **Step 5: Commit**

```bash
git add src/context/TranslationContext.tsx
git commit -m "refactor(credit): use AI-operation primitives in TranslationContext"
```

---

## Task 5: Migrate `DocumentsPage` summary to the hook

Standard flow — fits `run()` exactly (begin → refresh → run → refund+refresh+toast on error, silent on abort).

**Files:**
- Modify: `src/pages/DocumentsPage.tsx` (`openSummary` at ~216–260)

- [ ] **Step 1: Add the hook import + instantiate**

Add the import:

```ts
import { useAiOperation } from '../hooks/useAiOperation';
```

Inside the `DocumentsPage` component body (near the other hook calls such as `useAuth()`), add:

```ts
  const { run: runAiOp } = useAiOperation();
```

- [ ] **Step 2: Replace the body of `openSummary`**

Replace the function body from the `const cost = ...` line through the end of the `finally` block:

```ts
    // Operasyon jetonu — özet de bir AI çağrısıdır; kredi harcanmadan proxy çağrılamaz.
    const cost = (await getCreditCosts()).chat;
    const { data: opData, error: opErr } = await supabase.rpc('begin_ai_operation', {
      p_action: 'chat',
      p_amount: cost,
      p_calls: 3,
      p_reference: doc.id,
    });
    const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
    if (opErr || !operationId) {
      const m = opErr?.message ?? '';
      toast.error(
        /Yetersiz/.test(m) ? `Yetersiz kredi — özet için ${cost} kredi gerekiyor.`
          : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
          : 'Özet başlatılamadı.',
      );
      return;
    }
    void refreshProfile?.();
    setSummaryDoc(doc);
    setSummaryText('');
    setSummaryLoading(true);
    summaryAbortRef.current = new AbortController();
    try {
      const summary = await summarizeDocument(
        text,
        summaryAbortRef.current.signal,
        (_delta, full) => setSummaryText(full),
        operationId,
      );
      // Non-streaming fallback'te onChunk çağrılmaz; nihai özeti dönüş değerinden al.
      if (summary) setSummaryText(summary);
    } catch (e) {
      // Erken hata/iptal → kredi iadesi (yalnızca hiç çağrı yapılmadıysa)
      try { await supabase.rpc('refund_ai_operation', { p_op_id: operationId }); } catch { /* yut */ }
      void refreshProfile?.();
      if (e instanceof Error && e.name !== 'AbortError') toast.error(e.message || 'Özet oluşturulamadı');
    } finally {
      setSummaryLoading(false);
    }
```

with:

```ts
    // Operasyon jetonu — özet de bir AI çağrısıdır; kredi harcanmadan proxy çağrılamaz.
    const cost = (await getCreditCosts()).chat;
    setSummaryDoc(doc);
    setSummaryText('');
    setSummaryLoading(true);
    summaryAbortRef.current = new AbortController();
    try {
      await runAiOp({
        action: 'chat',
        amount: cost,
        calls: 3,
        reference: doc.id,
        messages: {
          insufficient: `Yetersiz kredi — özet için ${cost} kredi gerekiyor.`,
          rate_limit: 'Çok fazla istek — biraz bekleyin.',
          error: 'Özet başlatılamadı.',
        },
        run: async (operationId) => {
          const summary = await summarizeDocument(
            text,
            summaryAbortRef.current!.signal,
            (_delta, full) => setSummaryText(full),
            operationId,
          );
          // Non-streaming fallback'te onChunk çağrılmaz; nihai özeti dönüş değerinden al.
          if (summary) setSummaryText(summary);
        },
      });
    } finally {
      setSummaryLoading(false);
    }
```

Note: the hook handles the begin error toast, the refund-on-error, the `refreshProfile` calls, and the silent-abort + run-error toast (`e.message` default matches the old `toast.error(e.message || 'Özet oluşturulamadı')`). `setSummaryLoading(false)` stays in the `finally`.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. If `refreshProfile` from `useAuth()` is now unused in this file, remove it from the destructure; if `supabase` is now unused, remove its import — otherwise keep both.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DocumentsPage.tsx
git commit -m "refactor(credit): use useAiOperation for DocumentsPage summary"
```

---

## Task 6: Migrate `StudyNotesPage` (generate → primitives, translate → hook)

`generate` has extra `study_sessions` bookkeeping in its catch, so it uses primitives. `translate` is a clean standard flow → hook.

**Files:**
- Modify: `src/pages/StudyNotesPage.tsx` (generate at ~185–253; translate at ~268–287)

- [ ] **Step 1: Add imports + hook**

```ts
import { beginAiOperation, refundAiOperation } from '../lib/aiOperation';
import { useAiOperation } from '../hooks/useAiOperation';
```

Inside the component body:

```ts
  const { run: runAiOp } = useAiOperation();
```

- [ ] **Step 2: Replace `generate`'s begin block**

Replace:

```ts
      const { data: opData, error: creditErr } = await supabase.rpc('begin_ai_operation', {
        p_action: 'study_notes',
        p_amount: cost,
        p_calls: totalSources * 2 + 5,
        p_reference: null,
      });
      operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
      if (creditErr || !operationId) {
        const m = creditErr?.message ?? '';
```

with:

```ts
      const begin = await beginAiOperation({
        action: 'study_notes',
        amount: cost,
        calls: totalSources * 2 + 5,
        reference: null,
      });
      operationId = begin.ok ? begin.operationId : undefined;
      if (!begin.ok) {
        const m = begin.message;
```

> Keep the lines that follow (the `if` body that toasts based on `m` and `return`s, plus the rest of the function) exactly as they are. The `m` variable is still referenced by the existing regex-based toast inside that block; leaving it preserves the current messages. (This is the one place we still read `.message`; that's intentional to keep generate's bespoke wording untouched.)

- [ ] **Step 3: Replace `generate`'s catch-block refund**

Replace:

```ts
      if (operationId) {
        try { await supabase.rpc('refund_ai_operation', { p_op_id: operationId }); } catch { /* yut */ }
        await refreshProfile();
      }
```

with:

```ts
      if (operationId) {
        await refundAiOperation(operationId);
        await refreshProfile();
      }
```

- [ ] **Step 4: Replace the `translate` flow with the hook**

Replace:

```ts
    setTranslating(true);
    let operationId: string | undefined;
    try {
      const { data: opData, error: creditErr } = await supabase.rpc('begin_ai_operation', {
        p_action: 'study_notes', p_amount: cost, p_calls: 3, p_reference: null,
      });
      operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
      if (creditErr || !operationId) { toast.error('Çeviri başlatılamadı.'); return; }

      const translated = await translateStudyNotes(source, target, undefined, operationId);
      setNotesByLang(prev => ({ ...prev, [target]: translated }));
      setActiveLang(target);
      await refreshProfile();
      toast.success(target === 'en' ? 'İngilizce sürüm hazır.' : 'Türkçe sürüm hazır.');
    } catch (e) {
      if (operationId) { try { await supabase.rpc('refund_ai_operation', { p_op_id: operationId }); } catch { /* yut */ } await refreshProfile(); }
      toast.error(e instanceof Error ? e.message : 'Çeviri başarısız.');
    } finally {
      setTranslating(false);
    }
```

with:

```ts
    setTranslating(true);
    try {
      const res = await runAiOp({
        action: 'study_notes',
        amount: cost,
        calls: 3,
        reference: null,
        messages: { insufficient: 'Çeviri başlatılamadı.', rate_limit: 'Çeviri başlatılamadı.', error: 'Çeviri başlatılamadı.' },
        run: (operationId) => translateStudyNotes(source, target, undefined, operationId),
      });
      if (res.ok) {
        setNotesByLang(prev => ({ ...prev, [target]: res.data }));
        setActiveLang(target);
        toast.success(target === 'en' ? 'İngilizce sürüm hazır.' : 'Türkçe sürüm hazır.');
      }
    } finally {
      setTranslating(false);
    }
```

Note: the hook handles begin-error toast, refund-on-error + `refreshProfile`, and the run-error toast (`e.message` default matches the old `toast.error(e instanceof Error ? e.message : ...)`). The old success path also called `refreshProfile()`; the hook already calls it right after a successful begin, so the post-success balance is fresh — behavior preserved.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. Keep `supabase` import (still used for `study_sessions` writes). Keep `refreshProfile` from `useAuth()` (still used in generate).

- [ ] **Step 6: Commit**

```bash
git add src/pages/StudyNotesPage.tsx
git commit -m "refactor(credit): adopt AI-operation helpers in StudyNotesPage"
```

---

## Task 7: Migrate `GlossaryPage` to the hook

Standard flow; preserves the `'ai-gloss'` loading-toast id via `toastId`.

**Files:**
- Modify: `src/pages/GlossaryPage.tsx` (credit block at ~100–135)

- [ ] **Step 1: Add the hook import + instantiate**

```ts
import { useAiOperation } from '../hooks/useAiOperation';
```

In the component body (it already calls `useAuth()`):

```ts
  const { run: runAiOp } = useAiOperation();
```

- [ ] **Step 2: Replace the credit block + try/catch**

Replace from `const cost = (await getCreditCosts()).glossary;` through the closing `finally` block:

```ts
    // Operasyon jetonu — küçük kredi maliyeti + proxy çağrı hakkı (bypass'ı önler)
    const cost = (await getCreditCosts()).glossary;
    const { data: opData, error: opErr } = await supabase.rpc('begin_ai_operation', {
      p_action: 'glossary',
      p_amount: cost,
      p_calls: 2,
      p_reference: null,
    });
    const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
    if (opErr || !operationId) {
      const m = opErr?.message ?? '';
      toast.error(
        /Yetersiz/.test(m) ? `Yetersiz kredi — AI öneri için ${cost} kredi gerekiyor.`
          : /fazla istek/.test(m) ? 'Çok fazla istek — biraz bekleyin.'
          : 'İşlem başlatılamadı.',
        { id: 'ai-gloss' },
      );
      setAiGenerating(false);
      return;
    }
    void refreshProfile?.();
    try {
      const suggestions = await generateGlossarySuggestions(prof, uc, lang, operationId);
      if (suggestions.length === 0) { toast.error('Öneri üretilemedi.', { id: 'ai-gloss' }); return; }
      const { data, error } = await supabase.from('glossaries')
        .insert(suggestions.map(s => ({ ...s, user_id: profile.id })))
        .select();
      if (error) { toast.error('Kayıt hatası: ' + error.message, { id: 'ai-gloss' }); return; }
      setEntries(prev => [...(data as GlossaryEntry[]), ...prev]);
      await supabase.from('profiles').update({ glossary_generated: true }).eq('id', profile.id);
      toast.success(`${suggestions.length} terim eklendi! 🎉`, { id: 'ai-gloss' });
    } catch {
      toast.error('AI hatası, tekrar deneyin.', { id: 'ai-gloss' });
    } finally {
      setAiGenerating(false);
    }
```

with:

```ts
    // Operasyon jetonu — küçük kredi maliyeti + proxy çağrı hakkı (bypass'ı önler)
    const cost = (await getCreditCosts()).glossary;
    try {
      const res = await runAiOp({
        action: 'glossary',
        amount: cost,
        calls: 2,
        reference: null,
        toastId: 'ai-gloss',
        messages: {
          insufficient: `Yetersiz kredi — AI öneri için ${cost} kredi gerekiyor.`,
          rate_limit: 'Çok fazla istek — biraz bekleyin.',
          error: 'İşlem başlatılamadı.',
        },
        run: async (operationId) => {
          const suggestions = await generateGlossarySuggestions(prof, uc, lang, operationId);
          if (suggestions.length === 0) { toast.error('Öneri üretilemedi.', { id: 'ai-gloss' }); return; }
          const { data, error } = await supabase.from('glossaries')
            .insert(suggestions.map(s => ({ ...s, user_id: profile.id })))
            .select();
          if (error) { toast.error('Kayıt hatası: ' + error.message, { id: 'ai-gloss' }); return; }
          setEntries(prev => [...(data as GlossaryEntry[]), ...prev]);
          await supabase.from('profiles').update({ glossary_generated: true }).eq('id', profile.id);
          toast.success(`${suggestions.length} terim eklendi! 🎉`, { id: 'ai-gloss' });
        },
      });
      // Çalışma hatası → hook iade + refresh yaptı; balon mesajı için 'ai-gloss' id'sini güncelle.
      if (!res.ok && res.reason === 'error') toast.error('AI hatası, tekrar deneyin.', { id: 'ai-gloss' });
    } finally {
      setAiGenerating(false);
    }
```

Note: the hook's begin-failure toast uses `toastId: 'ai-gloss'`, so it replaces the spinner exactly like before. The run-success/empty/save-error toasts live inside `run` (all using `{ id: 'ai-gloss' }`), preserving them. The run-throws case maps to `res.reason === 'error'` → the "AI hatası" toast on the same id.

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. If `refreshProfile` is now unused in this file, remove it from the `useAuth()` destructure. Keep `supabase` (still used for glossaries/profiles).

- [ ] **Step 4: Commit**

```bash
git add src/pages/GlossaryPage.tsx
git commit -m "refactor(credit): use useAiOperation in GlossaryPage"
```

---

## Task 8: Migrate `OnboardingModal` to the primitive

Glossary generation is an optional sub-step; on begin failure it stays silent and onboarding continues.

**Files:**
- Modify: `src/components/OnboardingModal.tsx` (~94–105)

- [ ] **Step 1: Add the import**

```ts
import { beginAiOperation } from '../lib/aiOperation';
```

- [ ] **Step 2: Replace the begin block**

Replace:

```ts
      const { data: opData } = await supabase.rpc('begin_ai_operation', {
        p_action: 'glossary',
        p_amount: (await getCreditCosts()).glossary,
        p_calls: 2,
        p_reference: null,
      });
      const operationId = (opData as Array<{ operation_id: string }> | null)?.[0]?.operation_id;
      const suggestions = operationId
        ? await generateGlossarySuggestions(profession, useCase, nativeLang, operationId)
        : [];
```

with:

```ts
      const begin = await beginAiOperation({
        action: 'glossary',
        amount: (await getCreditCosts()).glossary,
        calls: 2,
        reference: null,
      });
      const suggestions = begin.ok
        ? await generateGlossarySuggestions(profession, useCase, nativeLang, begin.operationId)
        : [];
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors. Keep `supabase` (used for glossaries/profiles writes here).

- [ ] **Step 4: Commit**

```bash
git add src/components/OnboardingModal.tsx
git commit -m "refactor(credit): use beginAiOperation in OnboardingModal"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full type-check + lint**

Run: `npx tsc -b` then `npm run lint`
Expected: 0 errors across the project.

- [ ] **Step 2: Grep for leftover inline RPCs**

Run: search the `src/` tree for `begin_ai_operation` and `refund_ai_operation`.
Expected: matches ONLY in `src/lib/aiOperation.ts`. Any match in a page/hook/context/component is a missed migration — fix it before continuing.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, sign in as a test user, and for each path verify the 3 cases (success deducts once / insufficient shows the right toast & does not deduct / mid-run abort or forced error refunds and the balance restores, abort shows no toast):
  - Chat send (`useChatSession`)
  - PDF translation (`TranslationContext`) — start a translation, also test cancelling it
  - Document summary (`DocumentsPage`)
  - Study notes generate + language translate (`StudyNotesPage`)
  - Glossary AI suggestions (`GlossaryPage`) — confirm the spinner toast is replaced, not duplicated
  - Onboarding glossary step (`OnboardingModal`) — with zero credits, confirm onboarding still completes silently

- [ ] **Step 4: Final commit (if any smoke-fix changes were made)**

```bash
git add -A
git commit -m "test(credit): verify shared AI-operation migration"
```

---

## Self-Review notes (author)

- **Spec coverage:** primitives (Task 1) ✓, hook (Task 2) ✓, all 7 call sites migrated (Tasks 3–8) ✓, no RPC/ai-proxy/creditConfig changes ✓, verification via tsc+lint+manual ✓ (Task 9).
- **Type consistency:** `beginAiOperation` returns `BeginAiOpResult` (`.ok`, `.operationId`, `.reason`, `.message`); the hook consumes those exact fields; `RunAiOpResult` (`.ok`, `.data`, `.reason`) is consumed in Tasks 5–7. `runAiOp` is the agreed local alias for `useAiOperation().run` in every page.
- **No placeholders:** every code step contains full replacement code; every command states expected output.
