import bcrypt from "bcryptjs";

// Cost 10 (~4× cheaper than 12) keeps sign-in and password changes within the CPU budget of Cloudflare Workers.
const COST = 10;

export const hashPassword = (pw: string) => bcrypt.hash(pw, COST);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// Hash of a random discarded secret: makes unknown-email logins take as long as real ones.
const DUMMY = "$2b$10$pxJzqbzc8EDtjqCgocS7C.khbIxyDRaXFyyuj80hEZQ0dhexcmUPm";

export async function verifyPasswordOrDummy(pw: string, hash: string | null | undefined) {
  if (hash && hash.startsWith("$2")) return verifyPassword(pw, hash);
  await verifyPassword(pw, DUMMY);
  return false;
}
