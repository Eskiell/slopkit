/*
 * SlopKit local profile derived from soniciso1/P2JB at
 * 9966b9176ce2592e1ea6808c7288b7d78c6713cc.
 * Sources: p2jb_lk.js and offsets/12.40.js.
 */
(function (global) {
    "use strict";

    const lk = {
        syscallWrapper: 0x1AE47n,
        setjmp: 0x1D3D3n,
        longjmp: 0x1D42Cn,
        pthreadCreate: 0x79B0n,
        slotExpect: 0x1981Bn,
        threadList: 0x68218n,
        pthreadNext: 0x38n,
        pthreadStack: 0xA8n,
        pthreadStackSize: 0xB0n,
    };
    const wkGadgets = {
        ret: 0xC7n,
        popRdi: 0x5A469n,
        popRsi: 0x16B03An,
        popRdx: 0x196067n,
        popRcx: 0x6CFAn,
        popRax: 0x6ECCn,
        popRsp: 0x1872n,
        popR8: 0x716Bn,
        popR9: 0xFFFF6n,
        movQwordRdiRax: 0x86197n,
    };

    Object.freeze(lk);
    Object.freeze(wkGadgets);
    global.P2JBFirmware1240 = Object.freeze({
        firmware: "12.40",
        lk,
        wkGadgets,
    });
})(window);
