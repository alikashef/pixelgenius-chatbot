ARG PYTHON_IMAGE=docker.arvancloud.ir/library/python:3.12-slim
FROM ${PYTHON_IMAGE}

WORKDIR /app

ARG PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_TRUSTED_HOST=
ENV PIP_INDEX_URL=${PIP_INDEX_URL}
ENV PIP_DEFAULT_TIMEOUT=60
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
RUN if [ -n "$PIP_TRUSTED_HOST" ]; then \
      pip install --no-cache-dir --trusted-host "$PIP_TRUSTED_HOST" -r requirements.txt; \
    else \
      pip install --no-cache-dir -r requirements.txt; \
    fi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
