FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY worker1.py worker2.py ./

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Default command (will be overridden in docker-compose)
CMD ["python", "worker1.py"]