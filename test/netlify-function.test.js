const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

test("modern Netlify function preserves strong reads, bookings, auth, and exports", async (t) => {
  const originalContext = process.env.NETLIFY_BLOBS_CONTEXT;
  const originalAdminToken = process.env.ADMIN_TOKEN;
  let storedState = null;
  let readCount = 0;
  let writeCount = 0;
  process.env.ADMIN_TOKEN = "test-admin";
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({
    siteID: "test-site",
    token: "test-token",
    edgeURL: "https://cached-blobs.example.test",
    uncachedEdgeURL: "https://uncached-blobs.example.test",
  })).toString("base64");

  t.after(() => {
    if (originalContext === undefined) {
      delete process.env.NETLIFY_BLOBS_CONTEXT;
    } else {
      process.env.NETLIFY_BLOBS_CONTEXT = originalContext;
    }
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = originalAdminToken;
    }
  });

  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/test-site/site:prayer-schedule/state");
    assert.equal(options.headers.authorization, "Bearer test-token");
    if (options.method === "put") {
      assert.equal(url.hostname, "cached-blobs.example.test");
      storedState = JSON.parse(options.body);
      writeCount += 1;
      return new Response(null, { status: 200 });
    }

    assert.equal(options.method, "get");
    assert.equal(url.hostname, "uncached-blobs.example.test");
    readCount += 1;
    return storedState
      ? Response.json(storedState, { headers: { etag: '"test-etag"' } })
      : new Response(null, { status: 404 });
  });

  const entry = process.env.NETLIFY_FUNCTION_ENTRY ||
    path.join(__dirname, "..", "netlify", "functions", "api.mjs");
  const { default: handler } = await import(pathToFileURL(path.resolve(entry)).href);

  async function invoke(httpMethod, requestPath, body, headers = {}) {
    return handler(new Request(`https://example.test${requestPath}`, {
      method: httpMethod,
      headers: { "content-type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }), { requestId: "test-request", ip: "127.0.0.1" });
  }

  const initialResponse = await invoke("GET", "/api/schedule");
  assert.equal(initialResponse.status, 200);
  const initialSchedule = await initialResponse.json();
  assert.equal(initialSchedule.slots.length, 24);
  assert.ok(initialSchedule.slots.every((slot) => !slot.isBooked));

  const booking = {
    fullName: "Test Participant",
    location: "Zimbabwe",
    contact: "participant@example.test",
    slotHours: [3, 4],
  };
  const bookingResponse = await invoke("POST", "/api/bookings", booking);
  assert.equal(bookingResponse.status, 201);
  const createdBooking = await bookingResponse.json();
  assert.equal(createdBooking.selectedSlots.length, 2);
  assert.equal(writeCount, 1);
  assert.equal(storedState.bookings.length, 2);

  const updatedResponse = await invoke("GET", "/api/schedule");
  assert.equal(updatedResponse.status, 200);
  const updatedSchedule = await updatedResponse.json();
  assert.deepEqual(
    updatedSchedule.slots.filter((slot) => slot.isBooked).map((slot) => slot.hour),
    [3, 4]
  );
  assert.ok(updatedSchedule.slots.every((slot) => slot.booking === null));

  const conflictResponse = await invoke("POST", "/api/bookings", booking);
  assert.equal(conflictResponse.status, 409);
  assert.equal(writeCount, 1);
  assert.ok(readCount > 0);

  const confirmation = await invoke("GET", `/api/bookings/${createdBooking.bookingId}`);
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).bookings.length, 2);

  const unauthorized = await invoke("GET", "/admin/export.csv");
  assert.equal(unauthorized.status, 401);

  const csv = await invoke("GET", "/admin/export.csv?token=test-admin");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /Test Participant/);

  const pdf = await invoke("GET", "/admin/export.pdf", undefined, {
    "x-admin-token": "test-admin",
  });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type"), /application\/pdf/);
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");

  const head = await invoke("HEAD", "/api/schedule");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
