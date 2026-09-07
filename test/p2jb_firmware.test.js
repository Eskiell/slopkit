"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadBrowserScript } = require("./helpers/browser-script");

test("publica somente os offsets comprovados para 12.40", () => {
    const profile = loadBrowserScript("p2jb/lk-12.40.js").P2JBFirmware1240;

    assert.equal(profile.firmware, "12.40");
    assert.deepEqual({ ...profile.lk }, {
        syscallWrapper: 0x1AE47n,
        setjmp: 0x1D3D3n,
        longjmp: 0x1D42Cn,
        pthreadCreate: 0x79B0n,
        slotExpect: 0x1981Bn,
        threadList: 0x68218n,
        pthreadNext: 0x38n,
        pthreadStack: 0xA8n,
        pthreadStackSize: 0xB0n,
    });
    assert.equal(profile.wkGadgets.popRsp, 0x1872n);
    assert.equal(profile.wkGadgets.movQwordRdiRax, 0x86197n);
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.lk));
    assert.ok(Object.isFrozen(profile.wkGadgets));
});
