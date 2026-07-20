export default async (request, context) => {
  const url = new URL(request.url);
  
  // 1. Route to root Google Tag Gateway origin (preserves /metrics path)
  const targetOrigin = "https://fps.goog"; 
  const targetUrl = `${targetOrigin}${url.pathname}${url.search}`;
 
  // 2. Clone and modify the headers
  const headers = new Headers(request.headers);
  
  // CRITICAL SECURITY & ROUTING FIX:
  // Remove incoming Host header so Netlify automatically sets "Host: fps.goog"
  headers.delete("host");

  headers.set("X-Gtg-Tag-Id", "GTM-TBZZLPQ3"); // Your GTM container ID or GA4 Tag ID
  headers.set("X-Gtg-Implementation", "netlify-edge");

  // Extract geolocation data provided by Netlify's edge network
  const countryCode = context.geo?.country?.code;
  const regionCode = context.geo?.subdivision?.code;
  const city = context.geo?.city;
  const latitude = context.geo?.latitude;
  const longitude = context.geo?.longitude;

  // Inject geolocation headers for regional privacy compliance
  if (countryCode) {
    headers.set("X-Forwarded-Country", countryCode);
  }
  if (regionCode) {
    headers.set("X-Forwarded-Region", regionCode);
  }
  if (latitude && longitude) {
    headers.set("X-Forwarded-Geolocation", `latlong=${latitude},${longitude};city=${city || ""}`);
  }

  // 3. Configure the fetch options
  const fetchOptions = {
    method: request.method,
    headers: headers,
    redirect: "manual" 
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = request.body;
  }

  // 4. Perform the fetch to Google's servers (acts as the reverse proxy)
  try {
    const response = await fetch(targetUrl, fetchOptions);

    // =========================================================================
    // 🚀 CACHING OPTIMIZATION: Resolves 120ms latency issue
    // =========================================================================
    const newHeaders = new Headers(response.headers);

    const isGetOrHead = request.method === "GET" || request.method === "HEAD";
    const isScript = url.pathname.endsWith(".js") || url.pathname.includes("/gtag/js");
    const isSuccess = response.status === 200;

    if (isGetOrHead && isScript && isSuccess) {
      // Cache gtm.js at Netlify Edge POPs for 15 mins (drops latency to ~10ms)
      newHeaders.set(
        "Netlify-CDN-Cache-Control",
        "public, max-age=900, stale-while-revalidate=86400"
      );
    } else {
      // Telemetry (/collect), health checks, and errors remain live and uncached
      newHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      newHeaders.set("Netlify-CDN-Cache-Control", "no-store");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    return new Response("Error proxying request to Google Tag Gateway", { status: 502 });
  }
};

// Configure this Edge Function to run only on your reserved measurement path
export const config = {
  path: "/metrics/*",
};
