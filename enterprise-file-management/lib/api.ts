export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // Inject current token
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const modifiedOptions: RequestInit = {
    ...options,
    headers,
  };

  let response = await fetch(url, modifiedOptions);

  // If 401, token might be expired. Try to refresh.
  if (response.status === 401) {
    try {
      const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.accessToken) {
          // Update local storage
          if (typeof window !== "undefined") {
            localStorage.setItem("accessToken", data.accessToken);
          }

          // Retry original request with new token
          headers.set("Authorization", `Bearer ${data.accessToken}`);
          const retryOptions: RequestInit = {
            ...options,
            headers,
          };
          response = await fetch(url, retryOptions);
        } else {
          // Force logout if refresh didn't give a token
          throw new Error("No access token returned from refresh");
        }
      } else {
        // Refresh failed. Force logout
        throw new Error("Refresh failed");
      }
    } catch (error) {
      // Unrecoverable. Clear state and redirect to login.
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
  }

  return response;
}
