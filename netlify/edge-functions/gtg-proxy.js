export default async (request, context) => {
  const url = new URL(request.url);
  
  // 1. Preserve the path prefix (DO NOT strip "/metrics")
  // TARGET CONFIGURATION: Your GTM container ID in lowercase
  const targetOrigin = "https://gtm-tbzzlpq3.fps.goog"; 
  const targetUrl = `${targetOrigin}${url.pathname}${url.search}`;
 
  // 2. Clone and modify the headers
  const headers = new Headers(request.headers);
  
  // CRITICAL SECURITY & ROUTING FIX:
  // Remove the visitor's Host header so Deno's fetch automatically sets 
  // the correct Host header matching the targetOrigin.
  headers.delete("host");
  
  // Extract geolocation data provided by Netlify's edge network
  const countryCode = context.geo?.country?.code;
  const regionCode = context.geo?.subdivision?.code;
  const city = context.geo?.city;
  const latitude = context.geo?.latitude;
  const longitude = context.geo?.longitude;

  // Inject the specific headers Google expects for regional consent & privacy
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

  // Only attach the body for writing requests (POST, PUT, etc.) to prevent fetch errors on GET/HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = request.body;
  }

  // 4. Perform the fetch to Google's servers (acts as the reverse proxy)
  try {
    const response = await fetch(targetUrl, fetchOptions);
    return response;
  } catch (error) {
    return new Response("Error proxying request to Google Tag Gateway", { status: 502 });
  }
};

// Configure this Edge Function to run only on your reserved measurement path
export const config = {
  path: "/metrics/*",
};
