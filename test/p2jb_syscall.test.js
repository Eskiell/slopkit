"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBrowserScript } = require("./helpers/browser-script");

function makeGlobal(overrides = {}) {
    const calls = [];
    const memory = {
        firmware: "12.40",
        validate() { calls.push("validate"); },
        ...overrides.memory,
    };
    const executor = {
        async initialize() { calls.push("initialize"); },
        syscallSync(number, ...args) {
            calls.push([number, ...args]);
            return { retval: 321n };
        },
        ...overrides.executor,
    };
    class FakeWorker {
        constructor(url) {
            calls.push(["worker", url]);
        }
    }
    const global = loadBrowserScript("p2jb/syscall.js", {
        SlopKitP2JB: memory,
        P2JBFirmware1240: { firmware: "12.40" },
        P2JBRopWorker: {
            create(receivedMemory, profile, worker) {
                calls.push(["create", receivedMemory, profile, worker]);
                return executor;
            },
        },
        Worker: FakeWorker,
    });
    return { global, calls, memory, executor };
}

test("publica syscall somente depois de validar e inicializar o executor", async () => {
    let release;
    const { global, calls } = makeGlobal({
        executor: {
            initialize() {
                calls.push("initialize");
                return new Promise((resolve) => { release = resolve; });
            },
        },
    });

    const pending = global.P2JBSyscall.initialize();
    assert.equal(global.syscall, undefined);
    release();
    await pending;

    assert.equal(calls[0], "validate");
    assert.deepEqual(calls[1], ["worker", "p2jb/rop-slave.js"]);
    assert.equal(calls[2][0], "create");
    assert.equal(calls[3], "initialize");
    assert.equal(typeof global.syscall, "function");
    assert.equal(global.syscall(0x14, 7), 321n);
    assert.deepEqual(calls.at(-1), [0x14n, 7n]);
});

test("não publica syscall quando o gate de memória falha", async () => {
    const { global } = makeGlobal({
        memory: { validate() { throw new Error("rw gate"); } },
    });

    await assert.rejects(global.P2JBSyscall.initialize(), /rw gate/);
    assert.equal(global.syscall, undefined);
});

test("mantém uma única inicialização em andamento", async () => {
    const { global, calls } = makeGlobal();

    const first = global.P2JBSyscall.initialize();
    const second = global.P2JBSyscall.initialize();
    assert.equal(first, second);
    await first;
    assert.equal(calls.filter((entry) => entry === "validate").length, 1);
});
