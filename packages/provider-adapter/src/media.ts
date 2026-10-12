import type { ProviderSession } from "@sign/shared";
import { decodeBase64 } from "./base64";
import { ProviderError } from "./errors";
import { json, str } from "./response";
import { RequestSession, type Transport } from "./session";

export async function uploadPhoto(
  session: ProviderSession,
  jpegBase64: string,
  transport?: Transport,
): Promise<{ mediaId: string }> {
  const bytes = decodeBase64(jpegBase64);
  if (
    bytes.length > 2_000_000 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  )
    throw new ProviderError("INVALID_INPUT", "仅支持不超过 2 MB 的 JPEG 照片");
  const jar = new RequestSession(session, transport);
  const tokenBody = await json(
    await jar.request("https://pan-yz.chaoxing.com/api/token/uservalid"),
  );
  const token = str(tokenBody._token, "cloud token");
  const boundary = `----DiandaoPhoto${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const prefix = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="puid"\r\n\r\n${session.userId}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sign.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);
  const url = new URL("https://pan-yz.chaoxing.com/upload");
  url.searchParams.set("_from", "mobilelearn");
  url.searchParams.set("_token", token);
  const result = await json(
    await jar.request(url.toString(), {
      method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body,
    }),
  );
  return { mediaId: str(result.objectId, "objectId") };
}
