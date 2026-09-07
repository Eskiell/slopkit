"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBrowserScript } = require("./helpers/browser-script");

function loaderGlobal() {
    return loadBrowserScript("p2jb/loader.js");
}

test("carrega infraestrutura na ordem e inicializa antes do preflight", async () => {
    const events = [];
    let preflight;
    const global = loaderGlobal();
    const loader = global.P2JBLoader.create({
        async loadScript(src) {
            events.push(src);
            if (src === "p2jb_preflight.js")
                preflight = Promise.resolve().then(() => events.push("preflight"));
        },
        async initialize() { events.push("initialize"); },
        getPreflight() { return preflight; },
    });

    await loader.run();
    assert.deepEqual(events, [
        "p2jb/lk-12.40.js",
        "p2jb/rop-worker.js",
        "p2jb/slopkit-adapter.js",
        "p2jb/syscall.js",
        "initialize",
        "p2jb_preflight.js",
        "preflight",
    ]);
});

test("uma falha interrompe a sequência sem retry", async () => {
    let loads = 0;
    const global = loaderGlobal();
    const loader = global.P2JBLoader.create({
        loadScript() {
            loads++;
            return Promise.reject(new Error("404"));
        },
    });

    await assert.rejects(loader.run(), /404/);
    assert.equal(loads, 1);
});

test("run usa um único latch", async () => {
    let loads = 0;
    const global = loaderGlobal();
    const loader = global.P2JBLoader.create({
        async loadScript() { loads++; },
        async initialize() {},
        getPreflight() { return Promise.resolve(); },
    });

    const first = loader.run();
    const second = loader.run();
    assert.equal(first, second);
    await first;
    assert.equal(loads, 5);
});
