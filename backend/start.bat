@echo off
echo ===================================================
echo  TransLingua PDF Servisi v4.0 - Hibrit Temiz Ceviri
echo  Yontem A: fill=None redaction (duz arka planlar)
echo  Yontem B: OpenCV TELEA inpaint (gradyan/fotograf)
echo ===================================================
echo.
echo Bagimliliklari kontrol ediyor...
python -c "import cv2, numpy, fitz, PIL; print('  cv2:', cv2.__version__); print('  numpy:', numpy.__version__); print('  pymupdf:', fitz.version[0]); print('  pillow: OK'); print(); print('Tum bagimliliklar hazir!')" 2>&1
echo.
echo PDF Servisi baslatiliyor (port 5050)...
python -m uvicorn main:app --port 5050 --reload
pause
