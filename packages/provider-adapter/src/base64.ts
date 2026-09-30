const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function decodeBase64(value: string): Uint8Array {
  const cleaned = value.replace(/\s/g, "");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2,3})?$/.test(
      cleaned,
    )
  )
    throw new Error("无效的 Base64 数据");
  const result = new Uint8Array(Math.floor((cleaned.length * 3) / 4));
  let bits = 0,
    pending = 0,
    offset = 0;
  for (const char of cleaned) {
    if (char === "=") break;
    bits = (bits << 6) | alphabet.indexOf(char);
    pending += 6;
    if (pending >= 8) {
      pending -= 8;
      result[offset++] = (bits >> pending) & 255;
    }
  }
  return result.subarray(0, offset);
}
