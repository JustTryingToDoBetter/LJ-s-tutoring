async function loginAs(request, context, role, email) {
  const res = await request.post("http://localhost:3001/test/login-as", {
    data: { role, email }
  });

  if (!res.ok()) {
    throw new Error(`login-as failed: ${res.status()}`);
  }

  const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  const jar = {};

  for (const header of setCookies) {
    const [pair] = header.value.split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    jar[name] = value;
  }

  if (!jar.session || !jar.csrf) {
    throw new Error("login-as did not return session or csrf cookie");
  }

  await context.addCookies([
    { name: "session", value: jar.session, domain: "localhost", path: "/" },
    { name: "csrf", value: jar.csrf, domain: "localhost", path: "/" }
  ]);
}

module.exports = { loginAs };
