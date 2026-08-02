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
