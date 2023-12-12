/**
 * Calculate a hash string from the given string.
 * 
 * @param original String value to hash.
 * @returns Hashed result.
 */
export async function getHashString (original: string): Promise<string> {
    const bytes = new TextEncoder().encode(original)
    const buffer = await crypto.subtle.digest('SHA-1', bytes)
    return new Uint8Array(buffer).join('')
}
