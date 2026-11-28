import { createHash } from "node:crypto";

export const SEAL_VERSION = 1;
export const SEAL_HEADER = "snakebyte-integrity-v1";
export const SEAL_SCRIPT_ATTR = "data-snakebyte-seal";
export const SEAL_STYLE_ATTR = "data-snakebyte-style";

const SEAL_TAG =
  /<script\b[^>]*\bdata-snakebyte-seal\b[^>]*>[\s\S]*?<\/script>/i;
const OLD_EXTERNAL_SEAL =
  /<script\b[^>]*\bsrc=["'](?:\.\/|\/)?integrity\.js["'][^>]*>\s*<\/script>/i;

export function formatSealPayload(scripts, styles) {
  return [
    SEAL_HEADER,
    ...scripts.map((text) => `script:${text.length}\n${text}`),
    ...styles.map((text) => `style:${text.length}\n${text}`),
  ].join("\n--\n");
}

/** Marks built inline <style> blocks so runtime checks ignore extension styles. */
export function markAppStyles(html) {
  return html.replace(/<style\b([^>]*)>/gi, (full, attrs = "") => {
    if (/\bdata-snakebyte-style\b/i.test(attrs)) return full;
    return `<style${attrs} ${SEAL_STYLE_ATTR}>`;
  });
}

export function extractInlineBlocks(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1] ?? "";
    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (/\bdata-snakebyte-seal\b/i.test(attributes)) continue;
    scripts.push(match[2]);
  }
  const markedStyles = [];
  const allStyles = [];
  for (const match of html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const attributes = match[1] ?? "";
    allStyles.push(match[2]);
    if (/\bdata-snakebyte-style\b/i.test(attributes)) {
      markedStyles.push(match[2]);
    }
  }
  const styles = markedStyles.length > 0 ? markedStyles : allStyles;
  return { scripts, styles, markedStyleCount: markedStyles.length };
}

export function fingerprintHtml(html) {
  const { scripts, styles, markedStyleCount } = extractInlineBlocks(html);
  const payload = formatSealPayload(scripts, styles);
  return {
    hash: createHash("sha256").update(payload).digest("hex"),
    payload,
    scripts: scripts.length,
    styles: styles.length,
    markedStyleCount,
  };
}

export function extractEmbeddedFingerprint(html) {
  const match = html.match(
    /<script\b[^>]*\bdata-snakebyte-seal\b[^>]*>[\s\S]*?fingerprint:\s*"([a-f0-9]{64})"[\s\S]*?<\/script>/i,
  );
  return match ? match[1] : null;
}

export function sealTag(hash) {
  return `<script ${SEAL_SCRIPT_ATTR}>window.__SNAKEBYTE_SEAL__=Object.freeze({v:${SEAL_VERSION},fingerprint:"${hash}"});</script>`;
}

export function injectSeal(html, hash, { markStyles = true } = {}) {
  const prepared = markStyles ? markAppStyles(html) : html;
  const tag = sealTag(hash);
  if (SEAL_TAG.test(prepared)) return prepared.replace(SEAL_TAG, tag);
  if (OLD_EXTERNAL_SEAL.test(prepared))
    return prepared.replace(OLD_EXTERNAL_SEAL, tag);
  return prepared.replace("</head>", `    ${tag}\n  </head>`);
}
