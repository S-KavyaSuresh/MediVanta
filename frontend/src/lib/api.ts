type ApiError = Error & {
  status?: number;
  fieldErrors?: Record<string, string>;
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: Record<string, string>;
  } & T;

  if (!response.ok) {
    const isBackendConnectionFailure =
      response.status >= 500 &&
      path.startsWith("/api/") &&
      !payload.message;

    const error = new Error(
      isBackendConnectionFailure
        ? "MediVanta could not reach the backend service. Start the backend API on http://localhost:4000 and try again."
        : payload.message ?? "Something went wrong while contacting MediVanta.",
    ) as ApiError;
    error.status = response.status;
    error.fieldErrors = payload.errors;
    throw error;
  }

  return payload as T;
}
