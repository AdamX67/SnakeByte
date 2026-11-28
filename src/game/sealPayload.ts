export const SEAL_VERSION = 1;
export const SEAL_HEADER = "snakebyte-integrity-v1";
export const SEAL_SCRIPT_ATTR = "data-snakebyte-seal";
export const SEAL_STYLE_ATTR = "data-snakebyte-style";

/**
 * Canonical length-prefixed framing for application inline scripts and styles.
 * Shared across boot verification and runtime DOM re-verification.
 */
export function formatSealPayload(
  scripts: readonly string[],
  styles: readonly string[],
): string {
  return [
    SEAL_HEADER,
    ...scripts.map((text) => `script:${text.length}\n${text}`),
    ...styles.map((text) => `style:${text.length}\n${text}`),
  ].join("\n--\n");
}
