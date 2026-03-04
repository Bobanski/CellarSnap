import { Platform } from "react-native";

export function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return "heic";
  }
  if (mimeType === "image/gif") {
    return "gif";
  }
  return "jpg";
}

function inferPhotoMimeTypeFromNameOrUri(
  fileName: string | null | undefined,
  uri: string | null | undefined
) {
  const candidate = (fileName ?? uri ?? "").toLowerCase();
  const extensionMatch = candidate.match(/\.([a-z0-9]+)(?:\?|$)/);
  const ext = extensionMatch?.[1] ?? "";

  if (ext === "png") {
    return "image/png";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  if (ext === "gif") {
    return "image/gif";
  }
  if (ext === "heic" || ext === "heif") {
    return "image/heic";
  }
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  return null;
}

export function ensurePhotoMimeType(
  mimeType: string | null | undefined,
  fileName?: string | null,
  uri?: string | null
) {
  if (mimeType && mimeType.startsWith("image/")) {
    return mimeType;
  }

  const inferred = inferPhotoMimeTypeFromNameOrUri(fileName, uri);
  if (inferred) {
    return inferred;
  }

  return "image/jpeg";
}

function readArrayBufferFromUriViaXhr(uri: string) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const finishWithError = () => {
      xhr.onload = null;
      xhr.onerror = null;
      reject(new Error("Unable to read selected photo."));
    };

    xhr.onload = () => {
      const response = xhr.response;
      xhr.onload = null;
      xhr.onerror = null;
      if (!(response instanceof ArrayBuffer) || response.byteLength === 0) {
        reject(new Error("Unable to read selected photo."));
        return;
      }
      resolve(response);
    };
    xhr.onerror = finishWithError;
    xhr.responseType = "arraybuffer";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

export async function readPhotoBytes(uri: string) {
  const normalizedUri = uri.trim();
  if (!normalizedUri) {
    throw new Error("Unable to read selected photo.");
  }

  const preferXhr =
    Platform.OS === "android" && normalizedUri.startsWith("content://");
  if (!preferXhr) {
    try {
      const fileResponse = await fetch(normalizedUri);
      if (fileResponse.ok) {
        const bytes = await fileResponse.arrayBuffer();
        if (bytes.byteLength > 0) {
          return bytes;
        }
      }
    } catch {
      // Fall back to XHR path for device-local URIs that fetch cannot read in Expo Go.
    }
  }

  return readArrayBufferFromUriViaXhr(normalizedUri);
}
