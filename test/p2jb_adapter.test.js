"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBrowserScript } = require("./helpers/browser-script");

const MEMORY_BASE = 0x100000000n;

function profile1240() {
    return loadBrowserScript("p2jb/lk-12.40.js").P2JBFirmware1240;
}

function fakeCarrierContext(memory, firmware = "12.40") {
    let current = 0;
    const rwView = new Proxy({}, {
        get(target, property) {
            if (/^\d+$/.test(String(property)))
                return memory[current + Number(property)];
            return target[property];
        },
        set(target, property, value) {
            if (/^\d+$/.test(String(property))) {
                memory[current + Number(property)] = value;
                return true;
            }
            target[property] = value;
            return true;
        },
    });

    return {
        firmware,
        candidate: {},
        rwView,
        webkitBase: 0x800000000n,
        libkernelBase: 0x900000000n,
        scratchView: memory,
        scratchAddress: MEMORY_BASE,
        aim(address) {
            current = Number(BigInt(address) - MEMORY_BASE);
            if (current < 0 || current >= memory.length)
                throw new RangeError("fake address outside memory");
        },
        mark() {},
    };
}

function installAdapter(context, profile) {
    const global = loadBrowserScript("p2jb/slopkit-adapter.js");
    return global.SlopKitP2JBAdapter.install(context, profile);
}

test("lê e escreve qwords little-endian pelo carrier preservado", () => {
    const memory = new Uint8Array(0x20000);
    const api = installAdapter(fakeCarrierContext(memory), profile1240());

    api.write64(MEMORY_BASE + 0x20n, 0x1122334455667788n);

    assert.equal(api.read64(MEMORY_BASE + 0x20n), 0x1122334455667788n);
    assert.deepEqual([...memory.slice(0x20, 0x28)],
        [0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11]);
});

test("valida escrita, leitura e restauração somente dentro do scratch", () => {
    const memory = new Uint8Array(0x20000);
    memory.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
    const api = installAdapter(fakeCarrierContext(memory), profile1240());

    assert.equal(api.validate(), true);
    assert.deepEqual([...memory.slice(0, 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("rejeita firmware diferente de 12.40 antes de publicar a API", () => {
    assert.throws(() => installAdapter(
        fakeCarrierContext(new Uint8Array(0x20000), "12.60"),
        profile1240()), /firmware 12\.40 required/);
});

test("malloc reserva 0x1000 bytes e recusa esgotar o scratch", () => {
    const api = installAdapter(
        fakeCarrierContext(new Uint8Array(0x20000)), profile1240());

    assert.equal(api.malloc(0x100), MEMORY_BASE + 0x1000n);
    assert.throws(() => api.malloc(0x1F100), /scratch exhausted/);
});
