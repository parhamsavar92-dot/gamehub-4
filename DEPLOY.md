# GameHub — استقرار

## اجرای محلی
```bash
cp .env.example .env
# OWNER_PASSWORD را عوض کن
npm install
npm start
```

## Render.com (رایگان)
1. ریپوی گیت‌هاب بساز و فایل‌ها را آپلود کن
2. New Web Service → این ریپو
3. Build: `npm install` | Start: `npm start`
4. Environment: OWNER_PASSWORD، و در صورت نیاز کلیدهای AI

## Railway.app
1. New Project → Deploy from GitHub
2. Root همان پوشه پروژه
3. Variables: OWNER_PASSWORD، PORT خودکار

## Docker
```bash
docker build -t gamehub .
docker run -p 3000:3000 -e OWNER_PASSWORD=secret -v gamehub-data:/data gamehub
```

برای AI قوی کلید OPENAI_API_KEY یا XAI_API_KEY را در .env بگذار.
