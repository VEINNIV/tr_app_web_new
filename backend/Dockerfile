# TransWordly PDF servisi — PyMuPDF (fitz) + FastAPI
# Profesyonel redaction: orijinal metni fiziksel siler, kutu/overlay yok.
FROM python:3.12-slim

WORKDIR /app

# Bağımlılıklar önce (Docker katman cache'i için). PyMuPDF ve Pillow
# manylinux wheel'leriyle kurulur → ek apt paketi gerekmez.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodu + gömülü fontlar (fonts/NotoSans-*.ttf)
COPY . .

# Coolify PORT env'i enjekte edebilir; yoksa 5050 kullanılır.
ENV PORT=5050
EXPOSE 5050

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-5050}"]
