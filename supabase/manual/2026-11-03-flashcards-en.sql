-- Flashcard İngilizce karşılığı (TR/EN çalışma düğmesi). Idempotent.
alter table public.flashcards add column if not exists en jsonb;
