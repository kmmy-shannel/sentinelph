/**
 * services/api/utils/aiServiceClient.js
 * ---------------------------------------
 * Thin HTTP client for the FastAPI AI Scam Detection microservice.
 *
 * GUARDRAIL (SRS Requirement 5): This client only ever READS a
 * probability/label from the AI service. Nothing in this file — or
 * anywhere downstream of it — is permitted to write to the
 * BlacklistEntry collection or skip the Two-Officer approval state
 * machine. The AI's output is stored on the Report document as
 * `aiFlag` metadata for human officers to see; it is advisory only.
 *
 * Reads the AI service URL from process.env.AI_SERVICE_BASE_URL or
 * process.env.AI_SERVICE_URL, and sends process.env.AI_SERVICE_API_KEY
 * in the X-API-KEY header for Render service authentication.
 */

const axios = require('axios');

// Fallback chain for base URL: AI_SERVICE_BASE_URL -> AI_SERVICE_URL -> Render live URL
const baseURL =
  process.env.AI_SERVICE_BASE_URL ||
  process.env.AI_SERVICE_URL ||
  'https://sentinelph-ai.onrender.com';

const apiKey = process.env.AI_SERVICE_API_KEY || '';
const timeout = parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '15000', 10);

// Axios instance configured with X-API-KEY and Render cold-start timeout
const aiClient = axios.create({
  baseURL,
  timeout,
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey,
  },
});

/**
 * Calls POST {baseURL}/predict with report text and/or a base64 screenshot,
 * and returns a normalized "aiFlag" object to attach to the report BEFORE
 * it is hash-chained.
 *
 * This function NEVER throws for a "the AI service is down" scenario —
 * it degrades gracefully and returns a fallback aiFlag with `available: false`,
 * so a report can still be submitted and reviewed by human officers even if
 * the ML microservice is offline or sleeping.
 *
 * @param {Object} params
 * @param {string} [params.text] - Plain report text (e.g. SMS body).
 * @param {string} [params.imageBase64] - Base64 screenshot evidence.
 * @param {string} [params.reportId] - Optional report ID for correlation.
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
 * Direct wrapper for calling /predict. Returns raw FastAPI response data.
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

/**
 * Checks AI microservice health status.
 */
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