import { createHash } from "node:crypto";

import { env } from "../config/env.js";

type UploadInput = {
  contentBase64: string;
  fileName: string;
  contentType: string;
  folder: string;
};

export type StoredClinicalFile = {
  storageProvider: "cloudinary";
  storageUrl: string;
  storagePublicId: string;
  originalFileName: string;
  mimeType: string;
  storageSize: number;
};

export function isCloudinaryStorageConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function signCloudinaryParams(params: Record<string, string>) {
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${payload}${env.CLOUDINARY_API_SECRET}`).digest("hex");
}

function estimateDecodedSize(contentBase64: string) {
  const payload = contentBase64.includes(",") ? contentBase64.split(",").pop() ?? "" : contentBase64;
  return Buffer.byteLength(payload, "base64");
}

export async function uploadClinicalFileToCloudinary(input: UploadInput): Promise<StoredClinicalFile | null> {
  if (!isCloudinaryStorageConfigured()) {
    return null;
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedParams = {
    folder: input.folder,
    timestamp,
    unique_filename: "true",
    use_filename: "true",
  };
  const formData = new FormData();
  formData.append("file", input.contentBase64);
  formData.append("api_key", env.CLOUDINARY_API_KEY!);
  formData.append("timestamp", timestamp);
  formData.append("folder", input.folder);
  formData.append("use_filename", "true");
  formData.append("unique_filename", "true");
  formData.append("signature", signCloudinaryParams(signedParams));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error("Clinical file storage is currently unavailable.");
  }

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    bytes?: number;
  };

  if (!payload.secure_url || !payload.public_id) {
    throw new Error("Clinical file storage did not return a valid file reference.");
  }

  return {
    storageProvider: "cloudinary",
    storageUrl: payload.secure_url,
    storagePublicId: payload.public_id,
    originalFileName: input.fileName,
    mimeType: input.contentType,
    storageSize: payload.bytes ?? estimateDecodedSize(input.contentBase64),
  };
}
