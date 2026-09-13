// services/api/utils/aiServiceClient.js
/**
 * Thin HTTP client for the FastAPI AI Scam Detection microservice.
 *
 * GUARDRAIL (SRS Requirement 5): advisory-only. Never writes to
 * BlacklistEntry, never bypasses the Two-Officer approval state machine.
 */

const axios = require('axios');
const FormData = require('form-data');

const baseURL =
  process.env.AI_SERVICE_BASE_URL ||
  process.env.AI_SERVICE_URL ||
  'https://sentinelph-ai.onrender.com';

const apiKey = process.env.AI_SERVICE_API_KEY || '';
const timeout = parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '15000', 10);

const aiClient = axios.create({
  baseURL,
  timeout,
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey,
  },
});

/**
 * Calls POST {baseURL}/predict and returns a normalized "aiFlag" object.
 * Never throws for a "service down" scenario — degrades gracefully.
 */
async function getAiScamAssessment({ text, imageBase64, reportId } = {}) {
  if (!text && !imageBase64) {
    throw new Error(
      'getAiScamAssessment requires at least one of `text` or `imageBase64`.'
    );
  }

  const fallback = {
    available: false,
    probabilityScore: null,
    label: 'unavailable',
    isScam: null,
    confidenceScore: null,
    riskLevel: 'UNKNOWN',
    explanationReasons: [],
    ocrUsed: false,
    ocrText: null,               // NEW — stable shape for consumers
    ocrExtractedChars: 0,        // NEW
    modelVersion: null,
    advisoryOnly: true,
    checkedAt: new Date().toISOString(),
    error: null,
  };

  try {
    const response = await aiClient.post('/predict', {
      text: text || undefined,
      image_base64: imageBase64 || undefined,
      report_id: reportId || undefined,
    });

    const data = response.data;

    return {
      available: true,
      probabilityScore: data.probability_score,
      label: data.label,
      isScam: data.is_scam,
      confidenceScore: data.confidence_score,
      riskLevel: data.risk_level,
      explanationReasons: data.explanation_reasons || [],
      ocrUsed: data.ocr_used,
      ocrText: data.ocr_text || null,                       // NEW
      ocrExtractedChars: data.ocr_extracted_chars ?? 0,     // NEW
      modelVersion: data.model_version,
      advisoryOnly: data.advisory_only === true,
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const detail = err.response.data?.detail || err.response.data?.error || 'Unknown error';

      if (status === 503) {
        console.warn('[aiServiceClient] AI service not ready / model not loaded:', detail);
        return { ...fallback, label: 'unavailable', error: 'MODEL_NOT_TRAINED' };
      }
      if (status === 401) {
        console.error('[aiServiceClient] Unauthorized: Invalid or missing X-API-KEY.');
        return { ...fallback, error: 'UNAUTHORIZED' };
      }
      console.error(`[aiServiceClient] AI service returned ${status}:`, detail);
      return { ...fallback, error: `HTTP_${status}` };
    }

    if (err.code === 'ECONNABORTED') {
      console.error(`[aiServiceClient] AI service call timed out after ${timeout}ms`);
      return { ...fallback, error: 'TIMEOUT' };
    }

    console.error('[aiServiceClient] AI service call failed:', err.message);
    return { ...fallback, error: 'NETWORK_ERROR' };
  }
}

/**
 * Forwards an uploaded screenshot buffer to the FastAPI `/ocr` endpoint
 * using multipart/form-data, returning { text, confidence, available }.
 */
async function forwardImageForOcr({ buffer, originalname, mimetype, scamType = 'UNKNOWN' }) {
  const form = new FormData();
  form.append('file', buffer, {
    filename: originalname || 'screenshot.jpg',
    contentType: mimetype || 'image/jpeg',
  });
  form.append('scamType', scamType || 'UNKNOWN');

  try {
    const response = await axios.post(`${baseURL}/ocr`, form, {
      headers: {
        ...form.getHeaders(),
        'X-API-KEY': apiKey,
      },
      timeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const data = response.data || {};
    return {
      available: true,
      text: data.text ?? data.extracted_text ?? '',
      confidence: data.confidence ?? null,
      // NEW: pass through Layer-1 fields the /ocr endpoint may include
      isScam: data.is_scam ?? null,
      confidenceScore: data.confidence_score ?? null,
      riskLevel: data.risk_level ?? 'UNKNOWN',
      explanationReasons: data.explanation_reasons ?? [],
      error: null,
    };
  } catch (err) {
    if (err.response) {
      console.error(`[aiServiceClient:ocr] ${err.response.status}:`, err.response.data);
      return {
        available: false,
        text: '',
        confidence: null,
        isScam: null,
        confidenceScore: null,
        riskLevel: 'UNKNOWN',
        explanationReasons: [],
        error: `HTTP_${err.response.status}`,
      };
    }
    console.error('[aiServiceClient:ocr] forward failed:', err.message);
    return {
      available: false,
      text: '',
      confidence: null,
      isScam: null,
      confidenceScore: null,
      riskLevel: 'UNKNOWN',
      explanationReasons: [],
      error: err.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR',
    };
  }
}

async function classifyReportText(payload) {
  try {
    const response = await aiClient.post('/predict', payload);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(`[AI Service Error] ${error.response.status}:`, error.response.data);
    } else if (error.code === 'ECONNABORTED') {
      console.error(`[AI Service Error] Request timed out after ${timeout}ms.`);
    } else {
      console.error('[AI Service Error]', error.message);
    }
    throw error;
  }
}

async function checkAiHealth() {
  try {
    const response = await aiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('[AI Service Healthcheck Failed]', error.message);
    return { status: 'down', model_loaded: false };
  }
}

module.exports = {
  getAiScamAssessment,
  forwardImageForOcr,
  classifyReportText,
  checkAiHealth,
};