export {};

declare global {
  interface Window {
    __SNAKEBYTE_SEAL__?: { v: number; fingerprint: string };
  }
}
