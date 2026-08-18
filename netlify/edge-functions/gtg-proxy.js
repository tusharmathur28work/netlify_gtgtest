const CONTAINER_ID = (Deno.env.get("GTG_CONTAINER_ID") || "GTM-TBZZLPQ3").toLowerCase();
const FPS_ORIGIN = `${CONTAINER_ID}.fps.goog`;

export default async (request, context) => {
  const url = new URL(request.url);

  let pathname = url.pathname;
  if (pathname === "/metrics") {
    pathname = "/metrics/";
  }

  const targetUrl = new URL(`${pathname}${url.search}`, `https://${FPS_ORIGIN}`);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.set("host", FPS_ORIGIN);

  const country = context.geo?.country?.code || "";
  const region = context.geo?.subdivision?.code || "";
  const city = context.geo?.city || "";
  const latitude = context.geo?.latitude;
  const longitude = context.geo?.longitude;

  const countryRegion = country && region ? `${country}-${region}` : country;
  if (countryRegion) {
    headers.set("x-forwarded-countryregion", countryRegion);
  }
  if (country) {
    headers.set("x-forwarded-country", country);
  }
  if (region) {
    headers.set("x-forwarded-region", region);
  }

  const hasCoords = latitude !== undefined && longitude !== undefined;
  if (hasCoords && city) {
    headers.set("x-forwarded-geolocation", `latlong=${latitude},${longitude};city=${city}`);
  } else if (hasCoords) {
    headers.set("x-forwarded-geolocation", `latlong=${latitude},${longitude}`);
  } else if (city) {
    headers.set("x-forwarded-geolocation", `city=${city}`);
  }

  const isReadMethod = ["GET", "HEAD"].includes(request.method);
  const body = isReadMethod ? undefined : request.body;

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      ...(body ? { duplex: "half" } : {}),
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    console.error("GTG Netlify Edge Proxy Error:", error);
    return new Response("Measurement Gateway Error", { status: 502 });
  }
};

export const config = {
  path: ["/metrics", "/metrics/*"],
};

