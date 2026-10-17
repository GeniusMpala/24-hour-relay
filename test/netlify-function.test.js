const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

test("Netlify Lambda loads Blobs and reads and writes schedule state", async (t) => {
  const originalContext = process.env.NETLIFY_BLOBS_CONTEXT;
  let storedState = null;
  let readCount = 0;
  let writeCount = 0;

  t.after(() => {
    if (originalContext === undefined) {
      delete process.env.NETLIFY_BLOBS_CONTEXT;
    } else {
      process.env.NETLIFY_BLOBS_CONTEXT = originalContext;
    }
  });

  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "api.netlify.com") {
      assert.equal(url.pathname, "/api/v1/blobs/test-site/site:prayer-schedule/state");
      assert.equal(options.headers.authorization, "Bearer test-token");
      return Response.json({ url: "https://blobs.example.test/state" });
    }

    assert.equal(url.href, "https://blobs.example.test/state");
    if (options.method === "put") {
      storedState = JSON.parse(options.body);
      writeCount += 1;
      return new Response(null, { status: 200 });
    }

    assert.equal(options.method, "get");
    readCount += 1;
    return storedState
      ? Response.json(storedState, { headers: { etag: '"test-etag"' } })
      : new Response(null, { status: 404 });
  });

  const entry = process.env.NETLIFY_FUNCTION_ENTRY ||
    path.join(__dirname, "..", "netlify", "functions", "api.js");
  const { handler } = require(path.resolve(entry));

  async function invoke(httpMethod, requestPath, body) {
    return handler({
      httpMethod,
      path: requestPath,
      headers: {
        "content-type": "application/json",
        "x-nf-site-id": "test-site",
        "x-nf-deploy-id": "test-deploy",
      },
      queryStringParameters: {},
      body: body ? JSON.stringify(body) : null,
      isBase64Encoded: false,
      blobs: Buffer.from(JSON.stringify({ token: "test-token" })).toString("base64"),
    }, {});
  }

  const initialResponse = await invoke("GET", "/api/schedule");
  assert.equal(initialResponse.statusCode, 200);
  const initialSchedule = JSON.parse(initialResponse.body);
  assert.equal(initialSchedule.slots.length, 24);
  assert.ok(initialSchedule.slots.every((slot) => !slot.isBooked));

  const booking = {
    fullName: "Test Participant",
    location: "Zimbabwe",
    contact: "participant@example.test",
    slotHours: [3, 4],
  };
  const bookingResponse = await invoke("POST", "/api/bookings", booking);
  assert.equal(bookingResponse.statusCode, 201);
  assert.equal(JSON.parse(bookingResponse.body).selectedSlots.length, 2);
  assert.equal(writeCount, 1);
  assert.equal(storedState.bookings.length, 2);

  const updatedResponse = await invoke("GET", "/api/schedule");
  assert.equal(updatedResponse.statusCode, 200);
  const updatedSchedule = JSON.parse(updatedResponse.body);
  assert.deepEqual(
    updatedSchedule.slots.filter((slot) => slot.isBooked).map((slot) => slot.hour),
    [3, 4]
  );
  assert.ok(updatedSchedule.slots.every((slot) => slot.booking === null));

  const conflictResponse = await invoke("POST", "/api/bookings", booking);
  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(writeCount, 1);
  assert.ok(readCount > 0);
});
