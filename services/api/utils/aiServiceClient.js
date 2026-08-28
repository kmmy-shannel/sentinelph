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
 * Reads the AI service base URL from process.env.AI_SERVICE_URL
 * (Requirement 10) instead of a hardcoded host/port, so it works the
 * same in local dev, CI, and production behind different hostnames.
 *
 * Place this file at: services/api/utils/aiServiceClient.js
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_TIMEOUT_MS = parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 5000;

/**
 * Calls POST {AI_SERVICE_URL}/predict with report text and/or a base64
 * screenshot, and returns a normalized "aiFlag" object to attach to the
 * report BEFORE it is hash-chained (so the AI's assessment is itself
 * part of the immutable audit trail).
 *
 * This function NEVER throws for a "the AI service is down" scenario —
 * it degrades gracefully and returns a fallback aiFlag with
 * `available: false`, so a report can still be submitted and reviewed
 * by human officers even if the ML microservice is offline. It only
 * throws for programmer errors (e.g. missing text and no image).
 *
 * @param {Object} params
 * @param {string} [params.text] - Plain report text (e.g. SMS body).
 * @param {string} [params.imageBase64] - Base64 screenshot evidence.
 * @param {string} [params.reportId] - Optional report ID for correlation.
 * @returns {Promise<Object>} aiFlag object, always safe to store on the report.
 */
async function getAiScamAssessment({ text, imageBase64, reportId } = {}) {
  if (!text && !imageBase64) {
    throw new Error(
      'getAiScamAssessment requires at least one of `text` or `imageBase64`.'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

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
    const response = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text || undefined,
        image_base64: imageBase64 || undefined,
        report_id: reportId || undefined,
      }),
      signal: controller.signal,
    });

    if (response.status === 503) {
      const body = await response.json().catch(() => ({}));
      console.warn(
        '[aiServiceClient] AI service not ready (model not trained):',
        body.detail || 'unknown reason'
      );
      return {
        ...fallback,
        label: 'unavailable',
        error: 'MODEL_NOT_TRAINED',
      };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error(
        `[aiServiceClient] AI service returned ${response.status}:`,
        body.detail || body
      );
      return {
        ...fallback,
        error: `HTTP_${response.status}`,
      };
    }

    const data = await response.json();

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
    if (err.name === 'AbortError') {
      console.error(
        `[aiServiceClient] AI service call timed out after ${AI_SERVICE_TIMEOUT_MS}ms`
      );
      return { ...fallback, error: 'TIMEOUT' };
    }
    console.error('[aiServiceClient] AI service call failed:', err.message);
    return { ...fallback, error: 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getAiScamAssessment };