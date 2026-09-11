// services/api/utils/aiServiceClient.js
/**
 * Thin HTTP client for the FastAPI AI Scam Detection microservice.
 *
 * GUARDRAIL (SRS Requirement 5): This client only ever READS a
 * probability/label/explanation from the AI service. Nothing here — or
 * anywhere downstream — is permitted to write to the BlacklistEntry
 * collection or skip the Two-Officer approval state machine. The AI's
 * output is stored on the Report document as `aiFlag` metadata for
 * human officers to see; it is advisory only.
 */

const axios = require('axios');

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
 * Calls POST {baseURL}/predict and returns a normalized "aiFlag" object,
 * now including Layer 1 explainability fields (risk_level, reasons).
 *
 * Never throws for a "service down" scenario — degrades gracefully so a
 * report can still be submitted/reviewed even if the ML service is offline.
 *
 * @param {Object} params
 * @param {string} [params.text]
 * @param {string} [params.imageBase64]
 * @param {string} [params.reportId]
 * @returns {Promise<Object>} aiFlag object, safe to store on the report.
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
      label: data.label, // 'likely_scam' | 'uncertain' | 'likely_legitimate'
      isScam: data.is_scam,
      confidenceScore: data.confidence_score,
      riskLevel: data.risk_level, // 'HIGH' | 'MEDIUM' | 'LOW'
      explanationReasons: data.explanation_reasons || [], // [{category, description}]
      ocrUsed: data.ocr_used,
      modelVersion: data.model_version,
      advisoryOnly: data.advisory_only === true, // must always be true
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const detail = err.response.data?.detail || err.response.data?.error || 'Unknown error';

      if (status === 503) {
        console.warn(
          '[aiServiceClient] AI service not ready / model not loaded:',
          detail
        );
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
 * Direct wrapper for calling /predict. Returns raw FastAPI response data
 * (already includes is_scam / confidence_score / risk_level / explanation_reasons).
 * @param {Object} payload - { text, image_base64, report_id }
 * @returns {Promise<Object>} PredictResponse schema
 */
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
  classifyReportText,
  checkAiHealth,
};