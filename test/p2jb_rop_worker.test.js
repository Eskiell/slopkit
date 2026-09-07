"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBrowserScript } = require("./helpers/browser-script");

const WEBKIT = 0x800000000n;
const LIBKERNEL = 0x900000000n;

function profile1240() {
    return loadBrowserScript("p2jb/lk-12.40.js").P2JBFirmware1240;
}

function fakeMemory() {
    const profile = profile1240();
    const gadgets = {};
    for (const [name, offset] of Object.entries(profile.wkGadgets))
        gadgets[name] = WEBKIT + offset;
    return {
        bases: { webkit: WEBKIT, libkernel: LIBKERNEL },
        gadgets,
        read64() { return 0n; },
        write64() {},
        malloc() { return 0x100010000n; },
    };
}

function createExecutor() {
    const global = loadBrowserScript("p2jb/rop-worker.js");
    return global.P2JBRopWorker.create(fakeMemory(), profile1240(), {
        postMessage() {},
    });
}

test("monta syscall de seis argumentos na ordem ABI do PS5", () => {
    const executor = createExecutor();

    const chain = executor.buildSyscallChain(
        1n, [1n, 2n, 3n, 4n, 5n, 6n], 0x200000000n);

    assert.deepEqual([...chain], [
        WEBKIT + 0x5A469n, 1n,
        WEBKIT + 0x16B03An, 2n,
        WEBKIT + 0x196067n, 3n,
        WEBKIT + 0x6CFAn, 4n,
        WEBKIT + 0x716Bn, 5n,
        WEBKIT + 0xFFFF6n, 6n,
        WEBKIT + 0x6ECCn, 1n,
        LIBKERNEL + 0x1AE47n,
        WEBKIT + 0x5A469n, 0x200000000n,
        WEBKIT + 0x86197n,
    ]);
});

test("omite registradores cujos argumentos não foram fornecidos", () => {
    const executor = createExecutor();

    const chain = executor.buildSyscallChain(0x14n, [], 0x200000000n);

    assert.deepEqual([...chain], [
        WEBKIT + 0x6ECCn, 0x14n,
        LIBKERNEL + 0x1AE47n,
        WEBKIT + 0x5A469n, 0x200000000n,
        WEBKIT + 0x86197n,
    ]);
});

test("recusa syscall depois que o executor entra em estado morto", () => {
    const executor = createExecutor();
    executor.state.ready = true;
    executor.state.dead = true;

    assert.throws(() => executor.syscallSync(0x14n), /executor is dead/);
});
