# LƯU Ý: build với context là THƯ MỤC GỐC dự án (không phải backend/), vì cần
# copy cả database/schema.sql. Dùng docker-compose.yml ở gốc để build đúng cách,
# hoặc thủ công: docker build -f backend/Dockerfile -t finmind-backend .
FROM python:3.12-slim

WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/. .
COPY database/ /app/database/

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
