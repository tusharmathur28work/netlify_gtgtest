export default async (request, context) => {
  const url = new URL(request.url);
  const targetOrigin = "https://gtm-tbzzlpq3.fps.goog";
  const targetUrl = `${targetOrigin}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const countryCode = context.geo?.country?.code;
  const regionCode = context.geo?.subdivision?.code;
  const city = context.geo?.city;
  const latitude = context.geo?.latitude;
  const longitude = context.geo?.longitude;

  if (countryCode) {
    headers.set("X-Forwarded-Country", countryCode);
  }

  if (regionCode) {
    headers.set("X-Forwarded-Region", regionCode);
  }

  if (countryCode && regionCode) {
    const formattedRegion = regionCode.includes("-")
      ? regionCode
      : `${countryCode}-${regionCode}`;
    headers.set("X-Forwarded-CountryRegion", formattedRegion);
  } else if (countryCode) {
    headers.set("X-Forwarded-CountryRegion", countryCode);
  }

  const geoParts = [];
  if (latitude && longitude) {
    geoParts.push(`latlong=${latitude},${longitude}`);
  }
  if (city) {
    geoParts.push(`city=${city}`);
  }
  if (geoParts.length > 0) {
    headers.set("X-Forwarded-Geolocation", geoParts.join(";"));
  }

  const fetchOptions = {
    method: request.method,
    headers: headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = request.body;
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const newHeaders = new Headers(response.headers);

    const isGetOrHead = request.method === "GET" || request.method === "HEAD";
    const isTelemetry =
      url.pathname.includes("/collect") || url.pathname.includes("/healthy");
    const isScript =
      !isTelemetry &&
      (url.pathname.endsWith(".js") || url.pathname.endsWith("/gtag/js"));
    const isSuccess = response.status === 200;

    if (isGetOrHead && isScript && isSuccess) {
      // 1. Remove Google's private cache, expires, and cookie headers so Netlify CDN will cache it
      newHeaders.delete("set-cookie");
      newHeaders.delete("cache-control");
      newHeaders.delete("expires");
      newHeaders.delete("pragma");

      // 2. Set explicit PUBLIC cache control for both Netlify CDN Edge POPs and browsers
      newHeaders.set(
        "Cache-Control",
        "public, max-age=900, stale-while-revalidate=86400"
      );
      newHeaders.set(
        "Netlify-CDN-Cache-Control",
        "public, max-age=900, stale-while-revalidate=86400"
      );
      newHeaders.set(
        "CDN-Cache-Control",
        "public, max-age=900, stale-while-revalidate=86400"
      );
    } else {
      // Telemetry (/collect), health checks, and errors remain live and uncached
      newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      newHeaders.set("Netlify-CDN-Cache-Control", "no-store");
      newHeaders.set("CDN-Cache-Control", "no-store");
    }

    // =========================================================================
    // 🔍 DEBUGGING: Inspect context.geo in browser DevTools Network tab
    // =========================================================================
    newHeaders.set("X-Debug-Geo-Country", countryCode || "null");
    newHeaders.set("X-Debug-Geo-Region", regionCode || "null");
    newHeaders.set(
      "X-Debug-Geo-CountryRegion",
      countryCode && regionCode
        ? (regionCode.includes("-") ? regionCode : `${countryCode}-${regionCode}`)
        : countryCode || "null"
    );
    try {
      newHeaders.set("X-Debug-Context-Geo", JSON.stringify(context.geo || {}));
    } catch (e) {
      newHeaders.set("X-Debug-Context-Geo", "serialization-error");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response("Error proxying request to Google Tag Gateway", {
      status: 502,
    });
  }
};

// CRITICAL: cache: "manual" is required for Netlify CDN to cache Edge Function responses
export const config = {
  path: "/metrics/*",
  cache: "manual",
};
