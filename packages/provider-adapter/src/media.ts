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
  const fileBytes = new Uint8Array(bytes.length);
  fileBytes.set(bytes);
  const form = new FormData();
  form.set("puid", session.userId);
  form.set("file", new Blob([fileBytes], { type: "image/jpeg" }), "sign.jpg");
  const url = new URL("https://pan-yz.chaoxing.com/upload");
  url.searchParams.set("_from", "mobilelearn");
  url.searchParams.set("_token", token);
  const result = await json(
    await jar.request(url.toString(), { method: "POST", body: form }),
  );
  return { mediaId: str(result.objectId, "objectId") };
}
